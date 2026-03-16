use anyhow::{Result, anyhow};
use hap_models::{GameCatalogItem, SessionStatus};
use serde::{Deserialize, Serialize};
use serde_json::{Value, from_value, to_value};
use shakmaty::{
    CastlingMode, Chess, Color, EnPassantMode, File, Move, Position, Rank, Role, Square,
    fen::Fen,
    san::San,
    uci::UciMove,
};
use std::str::FromStr;
use std::sync::LazyLock;

use crate::GameAdapter;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PieceView {
    side: String,
    #[serde(rename = "type")]
    piece_type: String,
    display: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegalMove {
    from: String,
    to: String,
    side: String,
    piece: String,
    san: String,
    notation: String,
    flags: String,
    captured: Option<String>,
    promotion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveRecord {
    from: String,
    to: String,
    side: String,
    piece: PieceView,
    san: String,
    notation: String,
    flags: String,
    captured: Option<PieceView>,
    promotion: Option<PieceView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameState {
    kind: String,
    fen: String,
    board: Vec<Vec<Option<PieceView>>>,
    turn: String,
    status: SessionStatus,
    winner: Option<String>,
    is_check: bool,
    last_move: Option<MoveRecord>,
    move_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoveInput {
    from: String,
    to: String,
    promotion: Option<String>,
}

pub(super) static ADAPTER: ChessAdapter = ChessAdapter;

pub(super) struct ChessAdapter;

static GAME: LazyLock<GameCatalogItem> = LazyLock::new(|| GameCatalogItem {
    id: "chess".to_string(),
    title: "Chess".to_string(),
    short_name: "Chess".to_string(),
    description: "An 8x8 royal strategy game where white and black maneuver pieces, deliver checkmate, and fight for the center.".to_string(),
    sides: vec!["white".to_string(), "black".to_string()],
});

impl GameAdapter for ChessAdapter {
    fn game(&self) -> &GameCatalogItem {
        &GAME
    }

    fn create_initial_state(&self) -> Result<Value> {
        to_value(build_game_state(&Chess::default(), None, 0)?).map_err(Into::into)
    }

    fn normalize_state(&self, state: Value) -> Result<Value> {
        let parsed: GameState = from_value(state)?;
        to_value(parsed).map_err(Into::into)
    }

    fn list_legal_moves(&self, state: &Value, query: Option<&Value>) -> Result<Vec<Value>> {
        let parsed: GameState = from_value(state.clone())?;
        let square = query.and_then(parse_square_query);
        list_legal_moves(&parsed, square.as_deref())?
            .into_iter()
            .map(|item| to_value(item).map_err(Into::into))
            .collect()
    }

    fn play_move(&self, state: &Value, input: &Value) -> Result<Value> {
        let parsed: GameState = from_value(state.clone())?;
        let input: MoveInput = from_value(input.clone())?;
        to_value(play_move(&parsed, &input.from, &input.to, input.promotion.as_deref())?)
            .map_err(Into::into)
    }
}

fn build_game_state(position: &Chess, last_move: Option<MoveRecord>, move_count: u32) -> Result<GameState> {
    let outcome = position.outcome();
    let winner = match outcome.winner() {
        Some(Color::White) => Some("white".to_string()),
        Some(Color::Black) => Some("black".to_string()),
        None if outcome.is_known() => Some("draw".to_string()),
        None => None,
    };

    Ok(GameState {
        kind: "chess".to_string(),
        fen: Fen::from_position(position, EnPassantMode::Legal).to_string(),
        board: build_board(position),
        turn: color_to_side(position.turn()).to_string(),
        status: if outcome.is_known() {
            SessionStatus::Finished
        } else {
            SessionStatus::Active
        },
        winner,
        is_check: position.is_check(),
        last_move,
        move_count,
    })
}

#[allow(clippy::needless_range_loop)]
fn build_board(position: &Chess) -> Vec<Vec<Option<PieceView>>> {
    let board = position.board();
    let mut rows = vec![vec![None; 8]; 8];
    for row in 0..8 {
        for col in 0..8 {
            let rank = Rank::new((7 - row) as u32);
            let file = File::new(col as u32);
            let square = Square::from_coords(file, rank);
            rows[row][col] = board.piece_at(square).map(piece_to_view);
        }
    }
    rows
}

fn list_legal_moves(state: &GameState, from: Option<&str>) -> Result<Vec<LegalMove>> {
    if state.status == SessionStatus::Finished {
        return Ok(Vec::new());
    }
    let position = load_position(&state.fen)?;
    let from_square = match from {
        Some(value) => Some(parse_square(value)?),
        None => None,
    };
    let moves = position.legal_moves();
    Ok(moves
        .into_iter()
        .filter(|mv| from_square.is_none_or(|square| mv.from() == Some(square)))
        .map(|mv| create_legal_move(&position, mv))
        .collect())
}

fn play_move(state: &GameState, from: &str, to: &str, promotion: Option<&str>) -> Result<GameState> {
    if state.status == SessionStatus::Finished {
        return Err(anyhow!("Cannot play a move after the Chess game has finished"));
    }
    let position = load_position(&state.fen)?;
    let from_square = parse_square(from)?;
    let to_square = parse_square(to)?;
    let promotion_role = promotion.map(parse_promotion).transpose()?;

    let candidates: Vec<Move> = position
        .legal_moves()
        .into_iter()
        .filter(|mv| mv.from() == Some(from_square) && mv.to() == to_square)
        .collect();
    if candidates.is_empty() {
        return Err(anyhow!(
            "Move {from} -> {to} is not legal in the current Chess position"
        ));
    }

    let selected = if let Some(role) = promotion_role {
        candidates
            .into_iter()
            .find(|mv| promotion_from_move(*mv) == Some(role))
            .ok_or_else(|| anyhow!("Promotion {role:?} is not legal for {from} -> {to}"))?
    } else {
        candidates
            .iter()
            .copied()
            .find(|mv| promotion_from_move(*mv) == Some(Role::Queen))
            .unwrap_or_else(|| candidates[0])
    };

    let last_move = create_move_record(&position, selected);
    let next_position = position.play(selected)?;
    build_game_state(&next_position, Some(last_move), state.move_count + 1)
}

fn load_position(fen: &str) -> Result<Chess> {
    let fen = Fen::from_str(fen)?;
    fen.into_position(CastlingMode::Standard)
        .map_err(|error| anyhow!("Invalid chess position: {error}"))
}

fn parse_square_query(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Object(map) => map.get("from").and_then(Value::as_str).map(str::to_string),
        _ => None,
    }
}

fn parse_square(square: &str) -> Result<Square> {
    Square::from_str(square).map_err(|_| anyhow!("Invalid Chess square: {square}"))
}

fn parse_promotion(value: &str) -> Result<Role> {
    match value {
        "queen" => Ok(Role::Queen),
        "rook" => Ok(Role::Rook),
        "bishop" => Ok(Role::Bishop),
        "knight" => Ok(Role::Knight),
        _ => Err(anyhow!("Invalid Chess promotion: {value}")),
    }
}

fn create_legal_move(position: &Chess, mv: Move) -> LegalMove {
    let side = color_to_side(position.turn()).to_string();
    let role = role_to_piece_type(mv.role()).to_string();
    let san = San::from_move(position, mv).to_string();
    let notation = UciMove::from_standard(mv).to_string();
    LegalMove {
        from: square_to_string(mv.from().expect("legal move should have from")),
        to: square_to_string(mv.to()),
        side,
        piece: role,
        san,
        notation: notation.clone(),
        flags: flags_for_move(mv, &notation),
        captured: mv.capture().map(role_to_piece_type).map(str::to_string),
        promotion: promotion_from_move(mv).map(role_to_piece_type).map(str::to_string),
    }
}

fn create_move_record(position: &Chess, mv: Move) -> MoveRecord {
    let side = color_to_side(position.turn()).to_string();
    let piece = piece_view_from_role(&side, mv.role());
    let san = San::from_move(position, mv).to_string();
    let notation = UciMove::from_standard(mv).to_string();
    let captured = mv
        .capture()
        .map(|role| piece_view_from_role(opposing_side(&side), role));
    let promotion = promotion_from_move(mv).map(|role| piece_view_from_role(&side, role));
    MoveRecord {
        from: square_to_string(mv.from().expect("legal move should have from")),
        to: square_to_string(mv.to()),
        side,
        piece,
        san,
        notation: notation.clone(),
        flags: flags_for_move(mv, &notation),
        captured,
        promotion,
    }
}

fn promotion_from_move(mv: Move) -> Option<Role> {
    match mv {
        Move::Normal { promotion, .. } => promotion,
        _ => None,
    }
}

fn flags_for_move(mv: Move, notation: &str) -> String {
    match mv {
        Move::Castle { king, rook } => {
            if rook.file() > king.file() {
                "k".to_string()
            } else {
                "q".to_string()
            }
        }
        Move::EnPassant { .. } => "e".to_string(),
        Move::Normal {
            role: Role::Pawn,
            from,
            to,
            capture,
            promotion,
        } if promotion.is_some() && capture.is_some() => "cp".to_string(),
        Move::Normal {
            promotion: Some(_), ..
        } => "p".to_string(),
        Move::Normal {
            role: Role::Pawn,
            from,
            to,
            capture: None,
            ..
        } if from.rank().distance(to.rank()) == 2 => "b".to_string(),
        mv if mv.is_capture() => "c".to_string(),
        _ if notation.len() >= 4 => "n".to_string(),
        _ => "n".to_string(),
    }
}

fn color_to_side(color: Color) -> &'static str {
    match color {
        Color::White => "white",
        Color::Black => "black",
    }
}

fn opposing_side(side: &str) -> &'static str {
    if side == "white" { "black" } else { "white" }
}

fn role_to_piece_type(role: Role) -> &'static str {
    match role {
        Role::Pawn => "pawn",
        Role::Knight => "knight",
        Role::Bishop => "bishop",
        Role::Rook => "rook",
        Role::Queen => "queen",
        Role::King => "king",
    }
}

fn square_to_string(square: Square) -> String {
    square.to_string()
}

fn piece_to_view(piece: shakmaty::Piece) -> PieceView {
    piece_view_from_role(color_to_side(piece.color), piece.role)
}

fn piece_view_from_role(side: &str, role: Role) -> PieceView {
    let piece_type = role_to_piece_type(role).to_string();
    let display = match (side, role) {
        ("white", Role::King) => "♔",
        ("white", Role::Queen) => "♕",
        ("white", Role::Rook) => "♖",
        ("white", Role::Bishop) => "♗",
        ("white", Role::Knight) => "♘",
        ("white", Role::Pawn) => "♙",
        ("black", Role::King) => "♚",
        ("black", Role::Queen) => "♛",
        ("black", Role::Rook) => "♜",
        ("black", Role::Bishop) => "♝",
        ("black", Role::Knight) => "♞",
        ("black", Role::Pawn) => "♟",
        _ => "?",
    };
    PieceView {
        side: side.to_string(),
        piece_type,
        display: display.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_position_has_twenty_legal_moves() {
        let state = build_game_state(&Chess::default(), None, 0).unwrap();
        let moves = list_legal_moves(&state, None).unwrap();
        assert_eq!(moves.len(), 20);
    }

    #[test]
    fn can_play_e4() {
        let state = build_game_state(&Chess::default(), None, 0).unwrap();
        let next = play_move(&state, "e2", "e4", None).unwrap();
        assert_eq!(next.turn, "black");
        assert_eq!(next.last_move.unwrap().san, "e4");
    }

    #[test]
    fn adapter_returns_flat_legal_move_payloads() {
        let state = ADAPTER.create_initial_state().unwrap();
        let moves = ADAPTER
            .list_legal_moves(&state, Some(&Value::String("e2".to_string())))
            .unwrap();

        assert!(moves.iter().any(|item| item["from"] == "e2" && item["to"] == "e4"));
    }
}
