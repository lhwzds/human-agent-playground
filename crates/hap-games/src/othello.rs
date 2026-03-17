use anyhow::{Result, anyhow};
use hap_models::{GameCatalogItem, SessionStatus};
use serde::{Deserialize, Serialize};
use serde_json::{Value, from_value, to_value};
use std::sync::LazyLock;

use crate::GameAdapter;

const BOARD_SIZE: usize = 8;
const FILES: &[u8; BOARD_SIZE] = b"abcdefgh";
const DIRECTIONS: &[(isize, isize)] = &[
    (-1, -1),
    (-1, 0),
    (-1, 1),
    (0, -1),
    (0, 1),
    (1, -1),
    (1, 0),
    (1, 1),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Disc {
    side: String,
    display: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegalMove {
    point: String,
    flips: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveRecord {
    point: String,
    side: String,
    disc: Disc,
    notation: String,
    flipped_points: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameState {
    kind: String,
    board: Vec<Vec<Option<Disc>>>,
    turn: String,
    status: SessionStatus,
    winner: Option<String>,
    last_move: Option<MoveRecord>,
    move_count: u32,
    black_count: u32,
    white_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoveInput {
    point: String,
}

pub(super) static ADAPTER: OthelloAdapter = OthelloAdapter;

pub(super) struct OthelloAdapter;

static GAME: LazyLock<GameCatalogItem> = LazyLock::new(|| {
    GameCatalogItem {
    id: "othello".to_string(),
    title: "Othello".to_string(),
    short_name: "Othello".to_string(),
    description: "An 8x8 disk-flipping game where black and white bracket opposing discs and control the final board count.".to_string(),
    sides: vec!["black".to_string(), "white".to_string()],
}
});

impl GameAdapter for OthelloAdapter {
    fn game(&self) -> &GameCatalogItem {
        &GAME
    }

    fn create_initial_state(&self) -> Result<Value> {
        to_value(create_initial_game()).map_err(Into::into)
    }

    fn normalize_state(&self, state: Value) -> Result<Value> {
        let parsed: GameState = from_value(state)?;
        to_value(parsed).map_err(Into::into)
    }

    fn list_legal_moves(&self, state: &Value, query: Option<&Value>) -> Result<Vec<Value>> {
        let parsed: GameState = from_value(state.clone())?;
        let point = query.and_then(parse_point_query);
        list_legal_moves(&parsed, point.as_deref())?
            .into_iter()
            .map(|item| to_value(item).map_err(Into::into))
            .collect()
    }

    fn play_move(&self, state: &Value, input: &Value) -> Result<Value> {
        let parsed: GameState = from_value(state.clone())?;
        let input: MoveInput = from_value(input.clone())?;
        to_value(play_move(&parsed, &input.point)?).map_err(Into::into)
    }
}

fn create_initial_game() -> GameState {
    let mut board = vec![vec![None; BOARD_SIZE]; BOARD_SIZE];
    board[3][3] = Some(create_disc("black"));
    board[3][4] = Some(create_disc("white"));
    board[4][3] = Some(create_disc("white"));
    board[4][4] = Some(create_disc("black"));
    build_game_state(board, "black", None, 0, SessionStatus::Active)
}

fn parse_point_query(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Object(map) => map.get("point").and_then(Value::as_str).map(str::to_string),
        _ => None,
    }
}

fn list_legal_moves(state: &GameState, point: Option<&str>) -> Result<Vec<LegalMove>> {
    if state.status == SessionStatus::Finished {
        return Ok(Vec::new());
    }

    if let Some(point) = point {
        return Ok(collect_legal_move(&state.board, point, &state.turn)?
            .into_iter()
            .collect());
    }

    let mut moves = Vec::new();
    for row in 0..BOARD_SIZE {
        for col in 0..BOARD_SIZE {
            let point = coordinates_to_point(row, col)?;
            if let Some(mv) = collect_legal_move(&state.board, &point, &state.turn)? {
                moves.push(mv);
            }
        }
    }
    Ok(moves)
}

fn play_move(state: &GameState, point: &str) -> Result<GameState> {
    if state.status == SessionStatus::Finished {
        return Err(anyhow!(
            "Cannot play a move after the Othello game has finished"
        ));
    }

    let legal = collect_legal_move(&state.board, point, &state.turn)?
        .ok_or_else(|| anyhow!("Point {point} is not a legal Othello move"))?;
    let (row, col) = point_to_coordinates(point)?;
    let mut board = state.board.clone();
    board[row][col] = Some(create_disc(&state.turn));
    for flipped_point in &legal.flips {
        let (flip_row, flip_col) = point_to_coordinates(flipped_point)?;
        board[flip_row][flip_col] = Some(create_disc(&state.turn));
    }

    let opponent = opposing_side(&state.turn);
    let opponent_moves = all_legal_moves(&board, opponent)?;
    let current_moves = if opponent_moves.is_empty() {
        all_legal_moves(&board, &state.turn)?
    } else {
        Vec::new()
    };
    let next_turn = if opponent_moves.is_empty() {
        state.turn.as_str()
    } else {
        opponent
    };
    let status = if opponent_moves.is_empty() && current_moves.is_empty() {
        SessionStatus::Finished
    } else {
        SessionStatus::Active
    };

    Ok(build_game_state(
        board,
        next_turn,
        Some(MoveRecord {
            point: point.to_string(),
            side: state.turn.clone(),
            disc: create_disc(&state.turn),
            notation: point.to_string(),
            flipped_points: legal.flips,
        }),
        state.move_count + 1,
        status,
    ))
}

fn build_game_state(
    board: Vec<Vec<Option<Disc>>>,
    turn: &str,
    last_move: Option<MoveRecord>,
    move_count: u32,
    status: SessionStatus,
) -> GameState {
    let (black_count, white_count) = count_discs(&board);
    let winner = if status == SessionStatus::Finished {
        match black_count.cmp(&white_count) {
            std::cmp::Ordering::Equal => None,
            std::cmp::Ordering::Greater => Some("black".to_string()),
            std::cmp::Ordering::Less => Some("white".to_string()),
        }
    } else {
        None
    };

    GameState {
        kind: "othello".to_string(),
        board,
        turn: turn.to_string(),
        status,
        winner,
        last_move,
        move_count,
        black_count,
        white_count,
    }
}

fn all_legal_moves(board: &[Vec<Option<Disc>>], side: &str) -> Result<Vec<LegalMove>> {
    let mut moves = Vec::new();
    for row in 0..BOARD_SIZE {
        for col in 0..BOARD_SIZE {
            let point = coordinates_to_point(row, col)?;
            if let Some(mv) = collect_legal_move(board, &point, side)? {
                moves.push(mv);
            }
        }
    }
    Ok(moves)
}

fn collect_legal_move(
    board: &[Vec<Option<Disc>>],
    point: &str,
    side: &str,
) -> Result<Option<LegalMove>> {
    let (row, col) = point_to_coordinates(point)?;
    if board[row][col].is_some() {
        return Ok(None);
    }
    let mut flips = Vec::new();
    for (row_delta, col_delta) in DIRECTIONS {
        flips.extend(collect_direction_flips(
            board, row, col, side, *row_delta, *col_delta,
        )?);
    }
    if flips.is_empty() {
        Ok(None)
    } else {
        Ok(Some(LegalMove {
            point: point.to_string(),
            flips,
        }))
    }
}

fn collect_direction_flips(
    board: &[Vec<Option<Disc>>],
    row: usize,
    col: usize,
    side: &str,
    row_delta: isize,
    col_delta: isize,
) -> Result<Vec<String>> {
    let mut flips = Vec::new();
    let mut current_row = row as isize + row_delta;
    let mut current_col = col as isize + col_delta;
    let opposing = opposing_side(side);
    while current_row >= 0
        && current_col >= 0
        && (current_row as usize) < BOARD_SIZE
        && (current_col as usize) < BOARD_SIZE
    {
        let next_row = current_row as usize;
        let next_col = current_col as usize;
        match &board[next_row][next_col] {
            None => return Ok(Vec::new()),
            Some(disc) if disc.side == opposing => {
                flips.push(coordinates_to_point(next_row, next_col)?);
            }
            Some(disc) if disc.side == side => {
                return Ok(if flips.is_empty() { Vec::new() } else { flips });
            }
            _ => return Ok(Vec::new()),
        }
        current_row += row_delta;
        current_col += col_delta;
    }
    Ok(Vec::new())
}

fn count_discs(board: &[Vec<Option<Disc>>]) -> (u32, u32) {
    let mut black = 0;
    let mut white = 0;
    for row in board {
        for disc in row {
            match disc.as_ref().map(|disc| disc.side.as_str()) {
                Some("black") => black += 1,
                Some("white") => white += 1,
                _ => {}
            }
        }
    }
    (black, white)
}

fn create_disc(side: &str) -> Disc {
    Disc {
        side: side.to_string(),
        display: if side == "black" { "●" } else { "○" }.to_string(),
    }
}

fn opposing_side(side: &str) -> &'static str {
    if side == "black" { "white" } else { "black" }
}

fn point_to_coordinates(point: &str) -> Result<(usize, usize)> {
    if point.len() != 2 {
        return Err(anyhow!("Invalid Othello point: {point}"));
    }
    let file = point.as_bytes()[0];
    let col = FILES
        .iter()
        .position(|candidate| *candidate == file)
        .ok_or_else(|| anyhow!("Invalid Othello point: {point}"))?;
    let rank: usize = point[1..].parse()?;
    if !(1..=BOARD_SIZE).contains(&rank) {
        return Err(anyhow!("Invalid Othello point: {point}"));
    }
    Ok((BOARD_SIZE - rank, col))
}

fn coordinates_to_point(row: usize, col: usize) -> Result<String> {
    if row >= BOARD_SIZE || col >= BOARD_SIZE {
        return Err(anyhow!("Invalid Othello coordinates: {row},{col}"));
    }
    Ok(format!("{}{}", FILES[col] as char, BOARD_SIZE - row))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flips_discs_and_updates_counts() {
        let state = create_initial_game();
        let next = play_move(&state, "d3").unwrap();
        assert_eq!(next.black_count, 4);
        assert_eq!(next.white_count, 1);
        assert_eq!(next.turn, "white");
    }

    #[test]
    fn adapter_returns_flat_legal_move_payloads() {
        let state = ADAPTER.create_initial_state().unwrap();
        let moves = ADAPTER
            .list_legal_moves(&state, Some(&Value::String("d3".to_string())))
            .unwrap();

        assert_eq!(moves.len(), 1);
        assert_eq!(moves[0]["point"], Value::String("d3".to_string()));
    }
}
