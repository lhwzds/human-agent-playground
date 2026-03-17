use anyhow::{Result, anyhow};
use hap_models::{GameCatalogItem, SessionStatus};
use serde::{Deserialize, Serialize};
use serde_json::{Value, from_value, to_value};
use std::sync::LazyLock;

use crate::GameAdapter;

const STARTING_FEN: &str = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
const FILES: &[u8; 9] = b"abcdefghi";
const BOARD_ROWS: usize = 10;
const BOARD_COLS: usize = 9;
const HORSE_DELTAS: &[(isize, isize, isize, isize)] = &[
    (-2, -1, -1, 0),
    (-2, 1, -1, 0),
    (2, -1, 1, 0),
    (2, 1, 1, 0),
    (-1, -2, 0, -1),
    (1, -2, 0, -1),
    (-1, 2, 0, 1),
    (1, 2, 0, 1),
];
const ELEPHANT_DELTAS: &[(isize, isize, isize, isize)] = &[
    (-2, -2, -1, -1),
    (-2, 2, -1, 1),
    (2, -2, 1, -1),
    (2, 2, 1, 1),
];
const ORTHOGONAL_DELTAS: &[(isize, isize)] = &[(-1, 0), (1, 0), (0, -1), (0, 1)];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Piece {
    side: String,
    #[serde(rename = "type")]
    piece_type: String,
    #[serde(rename = "fenChar")]
    fen_char: String,
    display: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveRecord {
    from: String,
    to: String,
    side: String,
    piece: Piece,
    captured: Option<Piece>,
    notation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameState {
    kind: String,
    fen: String,
    board: Vec<Vec<Option<Piece>>>,
    turn: String,
    status: SessionStatus,
    winner: Option<String>,
    last_move: Option<MoveRecord>,
    move_count: u32,
    is_check: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoveInput {
    from: String,
    to: String,
}

pub(super) static ADAPTER: XiangqiAdapter = XiangqiAdapter;

pub(super) struct XiangqiAdapter;

static GAME: LazyLock<GameCatalogItem> = LazyLock::new(|| GameCatalogItem {
    id: "xiangqi".to_string(),
    title: "Chinese Chess".to_string(),
    short_name: "Xiangqi".to_string(),
    description:
        "A 9x10 perfect-information board game with palace, river, cannon, and horse-leg rules."
            .to_string(),
    sides: vec!["red".to_string(), "black".to_string()],
});

impl GameAdapter for XiangqiAdapter {
    fn game(&self) -> &GameCatalogItem {
        &GAME
    }

    fn create_initial_state(&self) -> Result<Value> {
        to_value(parse_fen(STARTING_FEN)?).map_err(Into::into)
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
        to_value(play_move(&parsed, &input.from, &input.to)?).map_err(Into::into)
    }
}

fn parse_square_query(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Object(map) => map.get("from").and_then(Value::as_str).map(str::to_string),
        _ => None,
    }
}

fn parse_fen(fen: &str) -> Result<GameState> {
    let mut parts = fen.split_whitespace();
    let placement = parts
        .next()
        .ok_or_else(|| anyhow!("Invalid Xiangqi FEN: {fen}"))?;
    let turn_token = parts.next().unwrap_or("w");
    let rows: Vec<&str> = placement.split('/').collect();
    if rows.len() != BOARD_ROWS {
        return Err(anyhow!("Invalid Xiangqi FEN rows: {fen}"));
    }

    let mut board = vec![vec![None; BOARD_COLS]; BOARD_ROWS];
    for (row_index, row_token) in rows.iter().enumerate() {
        let mut col = 0usize;
        for ch in row_token.chars() {
            if ch.is_ascii_digit() {
                col += ch.to_digit(10).unwrap_or(0) as usize;
                continue;
            }
            if col >= BOARD_COLS {
                return Err(anyhow!("Invalid Xiangqi FEN placement: {fen}"));
            }
            board[row_index][col] = Some(make_piece(ch)?);
            col += 1;
        }
        if col != BOARD_COLS {
            return Err(anyhow!("Invalid Xiangqi FEN width: {fen}"));
        }
    }

    build_game_state(
        board,
        if turn_token.eq_ignore_ascii_case("b") {
            "black"
        } else {
            "red"
        },
        None,
        0,
    )
}

fn play_move(state: &GameState, from: &str, to: &str) -> Result<GameState> {
    if state.status != SessionStatus::Active {
        return Err(anyhow!("Game is already finished"));
    }

    let legal_move = list_legal_moves(state, Some(from))?
        .into_iter()
        .find(|mv| mv.to == to)
        .ok_or_else(|| anyhow!("Illegal Xiangqi move: {from} -> {to}"))?;

    let from_coords = square_to_coordinates(from)?;
    let to_coords = square_to_coordinates(to)?;
    let simulated = apply_move_to_board(&state.board, from_coords, to_coords)?;
    build_game_state(
        simulated.board,
        next_side(&state.turn),
        Some(legal_move),
        state.move_count + 1,
    )
}

fn list_legal_moves(state: &GameState, square: Option<&str>) -> Result<Vec<MoveRecord>> {
    let moves = list_legal_moves_for_side(&state.board, &state.turn)?;
    Ok(match square {
        Some(square) => moves.into_iter().filter(|mv| mv.from == square).collect(),
        None => moves,
    })
}

fn list_legal_moves_for_side(board: &[Vec<Option<Piece>>], side: &str) -> Result<Vec<MoveRecord>> {
    let mut legal_moves = Vec::new();
    for row in 0..BOARD_ROWS {
        for col in 0..BOARD_COLS {
            let Some(piece) = &board[row][col] else {
                continue;
            };
            if piece.side != side {
                continue;
            }
            let from = coordinates_to_square(row, col)?;
            let moves = generate_pseudo_moves_for_piece(board, (row, col))?;
            for destination in moves {
                let simulated = apply_move_to_board(board, (row, col), destination)?;
                if is_in_check(&simulated.board, side)? {
                    continue;
                }
                legal_moves.push(MoveRecord {
                    from: from.clone(),
                    to: coordinates_to_square(destination.0, destination.1)?,
                    side: side.to_string(),
                    piece: piece.clone(),
                    captured: simulated.captured,
                    notation: format!(
                        "{}{}",
                        from,
                        coordinates_to_square(destination.0, destination.1)?
                    ),
                });
            }
        }
    }
    Ok(legal_moves)
}

fn build_game_state(
    board: Vec<Vec<Option<Piece>>>,
    turn: &str,
    last_move: Option<MoveRecord>,
    move_count: u32,
) -> Result<GameState> {
    let general_side_missing =
        find_general(&board, "red").is_none() || find_general(&board, "black").is_none();
    let no_moves = list_legal_moves_for_side(&board, turn)?.is_empty();
    let winner = if find_general(&board, "red").is_none() {
        Some("black".to_string())
    } else if find_general(&board, "black").is_none() {
        Some("red".to_string())
    } else if no_moves {
        Some(next_side(turn).to_string())
    } else {
        None
    };

    let is_check = is_in_check(&board, turn)?;
    Ok(GameState {
        kind: "xiangqi".to_string(),
        fen: board_to_fen(&board, turn, move_count),
        board,
        turn: turn.to_string(),
        status: if general_side_missing || no_moves {
            SessionStatus::Finished
        } else {
            SessionStatus::Active
        },
        winner,
        last_move,
        move_count,
        is_check,
    })
}

fn make_piece(ch: char) -> Result<Piece> {
    let lower = ch.to_ascii_lowercase();
    let piece_type = match lower {
        'k' => "general",
        'a' => "advisor",
        'b' => "elephant",
        'n' => "horse",
        'r' => "rook",
        'c' => "cannon",
        'p' => "soldier",
        _ => return Err(anyhow!("Unsupported Xiangqi piece: {ch}")),
    };
    let display = match ch {
        'K' => "帅",
        'A' => "仕",
        'B' => "相",
        'N' => "马",
        'R' => "车",
        'C' => "炮",
        'P' => "兵",
        'k' => "将",
        'a' => "士",
        'b' => "象",
        'n' => "马",
        'r' => "车",
        'c' => "炮",
        'p' => "卒",
        _ => return Err(anyhow!("Unsupported Xiangqi piece: {ch}")),
    };
    Ok(Piece {
        side: if ch.is_ascii_lowercase() {
            "black"
        } else {
            "red"
        }
        .to_string(),
        piece_type: piece_type.to_string(),
        fen_char: ch.to_string(),
        display: display.to_string(),
    })
}

fn board_to_fen(board: &[Vec<Option<Piece>>], turn: &str, move_count: u32) -> String {
    let placement = board
        .iter()
        .map(|row| {
            let mut buffer = String::new();
            let mut empty_count = 0usize;
            for piece in row {
                if let Some(piece) = piece {
                    if empty_count > 0 {
                        buffer.push_str(&empty_count.to_string());
                        empty_count = 0;
                    }
                    buffer.push_str(&piece.fen_char);
                } else {
                    empty_count += 1;
                }
            }
            if empty_count > 0 {
                buffer.push_str(&empty_count.to_string());
            }
            buffer
        })
        .collect::<Vec<_>>()
        .join("/");
    let full_move = move_count / 2 + 1;
    format!(
        "{placement} {} - - 0 {full_move}",
        if turn == "red" { "w" } else { "b" }
    )
}

fn square_to_coordinates(square: &str) -> Result<(usize, usize)> {
    let bytes = square.as_bytes();
    if bytes.len() < 2 || bytes.len() > 3 {
        return Err(anyhow!("Invalid square: {square}"));
    }
    let file = bytes[0];
    let col = FILES
        .iter()
        .position(|candidate| *candidate == file)
        .ok_or_else(|| anyhow!("Invalid square: {square}"))?;
    let rank: usize = square[1..].parse()?;
    if !(1..=10).contains(&rank) {
        return Err(anyhow!("Invalid square: {square}"));
    }
    Ok((10 - rank, col))
}

fn coordinates_to_square(row: usize, col: usize) -> Result<String> {
    if row >= BOARD_ROWS || col >= BOARD_COLS {
        return Err(anyhow!("Invalid coordinates: {row},{col}"));
    }
    Ok(format!("{}{}", FILES[col] as char, 10 - row))
}

fn get_piece(board: &[Vec<Option<Piece>>], row: isize, col: isize) -> Option<Piece> {
    if row < 0 || col < 0 || row as usize >= BOARD_ROWS || col as usize >= BOARD_COLS {
        return None;
    }
    board[row as usize][col as usize].clone()
}

#[allow(clippy::needless_range_loop, clippy::collapsible_if)]
fn find_general(board: &[Vec<Option<Piece>>], side: &str) -> Option<(usize, usize)> {
    for row in 0..BOARD_ROWS {
        for col in 0..BOARD_COLS {
            if let Some(piece) = &board[row][col] {
                if piece.side == side && piece.piece_type == "general" {
                    return Some((row, col));
                }
            }
        }
    }
    None
}

fn next_side(side: &str) -> &'static str {
    if side == "red" { "black" } else { "red" }
}

fn palace_rows_for(side: &str) -> (usize, usize) {
    if side == "black" { (0, 2) } else { (7, 9) }
}

fn is_inside_palace(side: &str, row: isize, col: isize) -> bool {
    let (min_row, max_row) = palace_rows_for(side);
    row >= min_row as isize && row <= max_row as isize && (3..=5).contains(&(col as usize))
}

fn has_crossed_river(side: &str, row: usize) -> bool {
    if side == "red" { row <= 4 } else { row >= 5 }
}

fn is_friendly(piece: &Option<Piece>, side: &str) -> bool {
    piece.as_ref().is_some_and(|piece| piece.side == side)
}

fn generate_pseudo_moves_for_piece(
    board: &[Vec<Option<Piece>>],
    origin: (usize, usize),
) -> Result<Vec<(usize, usize)>> {
    let Some(piece) = &board[origin.0][origin.1] else {
        return Ok(Vec::new());
    };

    let mut moves = Vec::new();
    match piece.piece_type.as_str() {
        "general" => {
            for (row_delta, col_delta) in ORTHOGONAL_DELTAS {
                let row = origin.0 as isize + row_delta;
                let col = origin.1 as isize + col_delta;
                if is_inside_palace(&piece.side, row, col)
                    && !is_friendly(&get_piece(board, row, col), &piece.side)
                {
                    moves.push((row as usize, col as usize));
                }
            }
        }
        "advisor" => {
            for row_delta in [-1, 1] {
                for col_delta in [-1, 1] {
                    let row = origin.0 as isize + row_delta;
                    let col = origin.1 as isize + col_delta;
                    if is_inside_palace(&piece.side, row, col)
                        && !is_friendly(&get_piece(board, row, col), &piece.side)
                    {
                        moves.push((row as usize, col as usize));
                    }
                }
            }
        }
        "elephant" => {
            for (row_delta, col_delta, block_row_delta, block_col_delta) in ELEPHANT_DELTAS {
                let row = origin.0 as isize + row_delta;
                let col = origin.1 as isize + col_delta;
                let block_row = origin.0 as isize + block_row_delta;
                let block_col = origin.1 as isize + block_col_delta;
                if row < 0
                    || col < 0
                    || row as usize >= BOARD_ROWS
                    || col as usize >= BOARD_COLS
                    || get_piece(board, block_row, block_col).is_some()
                {
                    continue;
                }
                if piece.side == "red" && row < 5 || piece.side == "black" && row > 4 {
                    continue;
                }
                if !is_friendly(&get_piece(board, row, col), &piece.side) {
                    moves.push((row as usize, col as usize));
                }
            }
        }
        "horse" => {
            for (row_delta, col_delta, block_row_delta, block_col_delta) in HORSE_DELTAS {
                let row = origin.0 as isize + row_delta;
                let col = origin.1 as isize + col_delta;
                let block_row = origin.0 as isize + block_row_delta;
                let block_col = origin.1 as isize + block_col_delta;
                if row < 0
                    || col < 0
                    || row as usize >= BOARD_ROWS
                    || col as usize >= BOARD_COLS
                    || get_piece(board, block_row, block_col).is_some()
                {
                    continue;
                }
                if !is_friendly(&get_piece(board, row, col), &piece.side) {
                    moves.push((row as usize, col as usize));
                }
            }
        }
        "rook" => moves.extend(scan_line_moves(board, origin, &piece.side, false)),
        "cannon" => moves.extend(generate_cannon_moves(board, origin, &piece.side)),
        "soldier" => {
            let forward_row = if piece.side == "red" {
                origin.0 as isize - 1
            } else {
                origin.0 as isize + 1
            };
            if forward_row >= 0
                && (forward_row as usize) < BOARD_ROWS
                && !is_friendly(
                    &get_piece(board, forward_row, origin.1 as isize),
                    &piece.side,
                )
            {
                moves.push((forward_row as usize, origin.1));
            }
            if has_crossed_river(&piece.side, origin.0) {
                for col_delta in [-1, 1] {
                    let col = origin.1 as isize + col_delta;
                    if col >= 0
                        && (col as usize) < BOARD_COLS
                        && !is_friendly(&get_piece(board, origin.0 as isize, col), &piece.side)
                    {
                        moves.push((origin.0, col as usize));
                    }
                }
            }
        }
        _ => {}
    }
    Ok(moves)
}

fn scan_line_moves(
    board: &[Vec<Option<Piece>>],
    origin: (usize, usize),
    side: &str,
    require_screen: bool,
) -> Vec<(usize, usize)> {
    let mut moves = Vec::new();
    for (row_delta, col_delta) in ORTHOGONAL_DELTAS {
        let mut row = origin.0 as isize + row_delta;
        let mut col = origin.1 as isize + col_delta;
        let mut seen_screen = false;
        while row >= 0 && col >= 0 && (row as usize) < BOARD_ROWS && (col as usize) < BOARD_COLS {
            let target = get_piece(board, row, col);
            if !require_screen {
                if target.is_none() {
                    moves.push((row as usize, col as usize));
                } else {
                    if target.as_ref().is_some_and(|piece| piece.side != side) {
                        moves.push((row as usize, col as usize));
                    }
                    break;
                }
            } else if !seen_screen {
                if target.is_none() {
                    moves.push((row as usize, col as usize));
                } else {
                    seen_screen = true;
                }
            } else if let Some(target) = target {
                if target.side != side {
                    moves.push((row as usize, col as usize));
                }
                break;
            }
            row += row_delta;
            col += col_delta;
        }
    }
    moves
}

fn generate_cannon_moves(
    board: &[Vec<Option<Piece>>],
    origin: (usize, usize),
    side: &str,
) -> Vec<(usize, usize)> {
    let mut moves = Vec::new();
    for (row_delta, col_delta) in ORTHOGONAL_DELTAS {
        let mut row = origin.0 as isize + row_delta;
        let mut col = origin.1 as isize + col_delta;
        let mut screen_seen = false;
        while row >= 0 && col >= 0 && (row as usize) < BOARD_ROWS && (col as usize) < BOARD_COLS {
            let target = get_piece(board, row, col);
            if !screen_seen {
                if target.is_none() {
                    moves.push((row as usize, col as usize));
                } else {
                    screen_seen = true;
                }
            } else if let Some(target) = target {
                if target.side != side {
                    moves.push((row as usize, col as usize));
                }
                break;
            }
            row += row_delta;
            col += col_delta;
        }
    }
    moves
}

#[allow(clippy::needless_range_loop)]
fn generals_face(board: &[Vec<Option<Piece>>]) -> bool {
    let Some(red_general) = find_general(board, "red") else {
        return false;
    };
    let Some(black_general) = find_general(board, "black") else {
        return false;
    };
    if red_general.1 != black_general.1 {
        return false;
    }
    for row in red_general.0.min(black_general.0) + 1..red_general.0.max(black_general.0) {
        if board[row][red_general.1].is_some() {
            return false;
        }
    }
    true
}

#[allow(
    clippy::collapsible_if,
    clippy::needless_range_loop,
    clippy::manual_contains
)]
fn piece_attacks_square(
    board: &[Vec<Option<Piece>>],
    origin: (usize, usize),
    target: (usize, usize),
) -> Result<bool> {
    let Some(piece) = &board[origin.0][origin.1] else {
        return Ok(false);
    };
    if piece.piece_type == "general" && origin.1 == target.1 {
        if let Some(enemy_general) = &board[target.0][target.1] {
            if enemy_general.piece_type == "general" && enemy_general.side != piece.side {
                for row in origin.0.min(target.0) + 1..origin.0.max(target.0) {
                    if board[row][origin.1].is_some() {
                        return Ok(false);
                    }
                }
                return Ok(true);
            }
        }
    }
    Ok(generate_pseudo_moves_for_piece(board, origin)?
        .iter()
        .any(|candidate| *candidate == target))
}

fn is_in_check(board: &[Vec<Option<Piece>>], side: &str) -> Result<bool> {
    let Some(general) = find_general(board, side) else {
        return Ok(true);
    };
    if generals_face(board) {
        return Ok(true);
    }
    let opponent = if side == "red" { "black" } else { "red" };
    for row in 0..BOARD_ROWS {
        for col in 0..BOARD_COLS {
            if board[row][col]
                .as_ref()
                .is_some_and(|piece| piece.side == opponent)
                && piece_attacks_square(board, (row, col), general)?
            {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

struct AppliedMove {
    board: Vec<Vec<Option<Piece>>>,
    captured: Option<Piece>,
}

fn apply_move_to_board(
    board: &[Vec<Option<Piece>>],
    from: (usize, usize),
    to: (usize, usize),
) -> Result<AppliedMove> {
    let mut next_board = board.to_vec();
    let piece = next_board[from.0][from.1]
        .clone()
        .ok_or_else(|| anyhow!("No piece on source square"))?;
    let captured = next_board[to.0][to.1].clone();
    next_board[to.0][to.1] = Some(piece);
    next_board[from.0][from.1] = None;
    Ok(AppliedMove {
        board: next_board,
        captured,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_position_has_legal_rook_move_count() {
        let game = parse_fen(STARTING_FEN).unwrap();
        let moves = list_legal_moves(&game, Some("a1")).unwrap();
        assert!(!moves.is_empty());
    }

    #[test]
    fn adapter_returns_flat_legal_move_payloads() {
        let state = ADAPTER.create_initial_state().unwrap();
        let moves = ADAPTER
            .list_legal_moves(&state, Some(&Value::String("a4".to_string())))
            .unwrap();

        assert_eq!(moves.len(), 1);
        assert_eq!(moves[0]["from"], Value::String("a4".to_string()));
        assert_eq!(moves[0]["to"], Value::String("a5".to_string()));
    }
}
