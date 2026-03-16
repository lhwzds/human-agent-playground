use anyhow::{Result, anyhow};
use hap_models::{GameCatalogItem, SessionStatus};
use serde::{Deserialize, Serialize};
use serde_json::{Value, from_value, to_value};
use std::sync::LazyLock;

use crate::GameAdapter;

const BOARD_SIZE: usize = 15;
const FILES: &[u8; BOARD_SIZE] = b"abcdefghijklmno";
const DIRECTIONS: &[(isize, isize)] = &[(1, 0), (0, 1), (1, 1), (1, -1)];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Stone {
    side: String,
    display: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegalMove {
    point: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveRecord {
    point: String,
    side: String,
    stone: Stone,
    notation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameState {
    kind: String,
    board: Vec<Vec<Option<Stone>>>,
    turn: String,
    status: SessionStatus,
    winner: Option<String>,
    last_move: Option<MoveRecord>,
    move_count: u32,
    winning_line: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoveInput {
    point: String,
}

pub(super) static ADAPTER: GomokuAdapter = GomokuAdapter;

pub(super) struct GomokuAdapter;

static GAME: LazyLock<GameCatalogItem> = LazyLock::new(|| GameCatalogItem {
    id: "gomoku".to_string(),
    title: "Gomoku".to_string(),
    short_name: "Gomoku".to_string(),
    description: "A 15x15 connection game where black and white alternate placing stones and race to make five in a row.".to_string(),
    sides: vec!["black".to_string(), "white".to_string()],
});

impl GameAdapter for GomokuAdapter {
    fn game(&self) -> &GameCatalogItem {
        &GAME
    }

    fn create_initial_state(&self) -> Result<Value> {
        to_value(create_initial_game()?).map_err(Into::into)
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

fn create_initial_game() -> Result<GameState> {
    build_game_state(empty_board(), "black", None, 0, None)
}

fn empty_board() -> Vec<Vec<Option<Stone>>> {
    vec![vec![None; BOARD_SIZE]; BOARD_SIZE]
}

fn parse_point_query(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Object(map) => map.get("point").and_then(Value::as_str).map(str::to_string),
        _ => None,
    }
}

fn play_move(state: &GameState, point: &str) -> Result<GameState> {
    if state.status == SessionStatus::Finished {
        return Err(anyhow!("Cannot play a move after the Gomoku game has finished"));
    }

    let (row, col) = point_to_coordinates(point)?;
    if state.board[row][col].is_some() {
        return Err(anyhow!("Point {point} is already occupied"));
    }

    let mut board = state.board.clone();
    board[row][col] = Some(create_stone(&state.turn));
    let last_move = create_move(point, &state.turn);
    let winning_line = find_winning_line(&board, row, col, &state.turn);

    build_game_state(
        board,
        opposing_side(&state.turn),
        Some(last_move),
        state.move_count + 1,
        winning_line,
    )
}

fn list_legal_moves(state: &GameState, point: Option<&str>) -> Result<Vec<LegalMove>> {
    if state.status == SessionStatus::Finished {
        return Ok(Vec::new());
    }

    if let Some(point) = point {
        let (row, col) = point_to_coordinates(point)?;
        return Ok(if state.board[row][col].is_none() {
            vec![LegalMove {
                point: point.to_string(),
            }]
        } else {
            Vec::new()
        });
    }

    let mut moves = Vec::new();
    for row in 0..BOARD_SIZE {
        for col in 0..BOARD_SIZE {
            if state.board[row][col].is_none() {
                moves.push(LegalMove {
                    point: coordinates_to_point(row, col)?,
                });
            }
        }
    }
    Ok(moves)
}

fn build_game_state(
    board: Vec<Vec<Option<Stone>>>,
    turn: &str,
    last_move: Option<MoveRecord>,
    move_count: u32,
    winning_line: Option<Vec<String>>,
) -> Result<GameState> {
    let winner = if winning_line.is_some() {
        last_move.as_ref().map(|mv| mv.side.clone())
    } else {
        None
    };
    let is_draw = winner.is_none() && board.iter().all(|row| row.iter().all(Option::is_some));

    Ok(GameState {
        kind: "gomoku".to_string(),
        board,
        turn: turn.to_string(),
        status: if winner.is_some() || is_draw {
            SessionStatus::Finished
        } else {
            SessionStatus::Active
        },
        winner,
        last_move,
        move_count,
        winning_line,
    })
}

fn create_stone(side: &str) -> Stone {
    Stone {
        side: side.to_string(),
        display: if side == "black" { "●" } else { "○" }.to_string(),
    }
}

fn create_move(point: &str, side: &str) -> MoveRecord {
    MoveRecord {
        point: point.to_string(),
        side: side.to_string(),
        stone: create_stone(side),
        notation: point.to_string(),
    }
}

fn opposing_side(side: &str) -> &'static str {
    if side == "black" { "white" } else { "black" }
}

fn point_to_coordinates(point: &str) -> Result<(usize, usize)> {
    if point.len() < 2 || point.len() > 3 {
        return Err(anyhow!("Invalid Gomoku point: {point}"));
    }
    let file = point.as_bytes()[0];
    let col = FILES
        .iter()
        .position(|candidate| *candidate == file)
        .ok_or_else(|| anyhow!("Invalid Gomoku point: {point}"))?;
    let rank: usize = point[1..].parse()?;
    if !(1..=BOARD_SIZE).contains(&rank) {
        return Err(anyhow!("Invalid Gomoku point: {point}"));
    }
    Ok((BOARD_SIZE - rank, col))
}

fn coordinates_to_point(row: usize, col: usize) -> Result<String> {
    if row >= BOARD_SIZE || col >= BOARD_SIZE {
        return Err(anyhow!("Invalid Gomoku coordinates: {row},{col}"));
    }
    Ok(format!("{}{}", FILES[col] as char, BOARD_SIZE - row))
}

fn find_winning_line(
    board: &[Vec<Option<Stone>>],
    row: usize,
    col: usize,
    side: &str,
) -> Option<Vec<String>> {
    for (row_delta, col_delta) in DIRECTIONS {
        let mut line = collect_direction(board, row, col, side, -*row_delta, -*col_delta);
        line.reverse();
        line.push((row, col));
        line.extend(collect_direction(board, row, col, side, *row_delta, *col_delta));

        if line.len() >= 5 {
            return line
                .into_iter()
                .map(|(row, col)| coordinates_to_point(row, col))
                .collect::<Result<Vec<_>>>()
                .ok();
        }
    }
    None
}

fn collect_direction(
    board: &[Vec<Option<Stone>>],
    row: usize,
    col: usize,
    side: &str,
    row_delta: isize,
    col_delta: isize,
) -> Vec<(usize, usize)> {
    let mut points = Vec::new();
    let mut current_row = row as isize + row_delta;
    let mut current_col = col as isize + col_delta;

    while current_row >= 0
        && current_col >= 0
        && (current_row as usize) < BOARD_SIZE
        && (current_col as usize) < BOARD_SIZE
    {
        let next_row = current_row as usize;
        let next_col = current_col as usize;
        match &board[next_row][next_col] {
            Some(stone) if stone.side == side => points.push((next_row, next_col)),
            _ => break,
        }
        current_row += row_delta;
        current_col += col_delta;
    }

    points
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adapter_returns_flat_legal_move_payloads() {
        let state = ADAPTER.create_initial_state().unwrap();
        let moves = ADAPTER
            .list_legal_moves(&state, Some(&Value::String("h8".to_string())))
            .unwrap();

        assert_eq!(moves.len(), 1);
        assert_eq!(moves[0]["point"], Value::String("h8".to_string()));
    }

    #[test]
    fn detects_five_in_a_row() {
        let mut state = create_initial_game().unwrap();
        let moves = ["h8", "a1", "i8", "a2", "j8", "a3", "k8", "a4", "l8"];
        for point in moves {
            state = play_move(&state, point).unwrap();
        }
        assert_eq!(state.status, SessionStatus::Finished);
        assert_eq!(state.winner.as_deref(), Some("black"));
        assert_eq!(state.winning_line.unwrap().len(), 5);
    }
}
