use anyhow::{Result, anyhow};
use hap_models::{GameCatalogItem, SessionStatus};
use serde::{Deserialize, Serialize};
use serde_json::{Value, from_value, to_value};
use std::sync::LazyLock;

use crate::GameAdapter;

const ROWS: usize = 6;
const COLS: usize = 7;
const FILES: &[u8; COLS] = b"abcdefg";
const DIRECTIONS: &[(isize, isize)] = &[(1, 0), (0, 1), (1, 1), (1, -1)];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Disc {
    side: String,
    display: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegalMove {
    column: u8,
    point: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveRecord {
    column: u8,
    row: u8,
    point: String,
    side: String,
    disc: Disc,
    notation: String,
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
    winning_line: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoveInput {
    column: u8,
}

pub(super) static ADAPTER: ConnectFourAdapter = ConnectFourAdapter;

pub(super) struct ConnectFourAdapter;

static GAME: LazyLock<GameCatalogItem> = LazyLock::new(|| GameCatalogItem {
    id: "connect-four".to_string(),
    title: "Connect Four".to_string(),
    short_name: "Connect Four".to_string(),
    description: "A vertical 7x6 connection game where red and yellow drop discs into columns and race to connect four.".to_string(),
    sides: vec!["red".to_string(), "yellow".to_string()],
});

impl GameAdapter for ConnectFourAdapter {
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
        let column = query.and_then(parse_column_query);
        list_legal_moves(&parsed, column)?
            .into_iter()
            .map(|item| to_value(item).map_err(Into::into))
            .collect()
    }

    fn play_move(&self, state: &Value, input: &Value) -> Result<Value> {
        let parsed: GameState = from_value(state.clone())?;
        let input: MoveInput = from_value(input.clone())?;
        to_value(play_move(&parsed, input.column)?).map_err(Into::into)
    }
}

fn create_initial_game() -> GameState {
    GameState {
        kind: "connect-four".to_string(),
        board: vec![vec![None; COLS]; ROWS],
        turn: "red".to_string(),
        status: SessionStatus::Active,
        winner: None,
        last_move: None,
        move_count: 0,
        winning_line: None,
    }
}

fn parse_column_query(value: &Value) -> Option<u8> {
    match value {
        Value::Number(number) => number.as_u64().map(|value| value as u8),
        Value::String(text) => text.parse::<u8>().ok(),
        Value::Object(map) => map
            .get("column")
            .and_then(|value| value.as_u64().map(|value| value as u8)),
        _ => None,
    }
}

fn list_legal_moves(state: &GameState, column: Option<u8>) -> Result<Vec<LegalMove>> {
    if state.status == SessionStatus::Finished {
        return Ok(Vec::new());
    }

    if let Some(column) = column {
        return Ok(match landing_row(&state.board, column) {
            Some(row) => vec![LegalMove {
                column,
                point: coordinates_to_point(row, (column - 1) as usize)?,
            }],
            None => Vec::new(),
        });
    }

    let mut moves = Vec::new();
    for column in 1..=(COLS as u8) {
        if let Some(row) = landing_row(&state.board, column) {
            moves.push(LegalMove {
                column,
                point: coordinates_to_point(row, (column - 1) as usize)?,
            });
        }
    }
    Ok(moves)
}

fn play_move(state: &GameState, column: u8) -> Result<GameState> {
    if state.status == SessionStatus::Finished {
        return Err(anyhow!(
            "Cannot play a move after the Connect Four game has finished"
        ));
    }

    let row = landing_row(&state.board, column)
        .ok_or_else(|| anyhow!("Column {column} is already full"))?;
    let mut board = state.board.clone();
    board[row][(column - 1) as usize] = Some(create_disc(&state.turn));
    let last_move = create_move(column, row, &state.turn)?;
    let winning_line = find_winning_line(&board, row, (column - 1) as usize, &state.turn);
    let winner = if winning_line.is_some() {
        Some(state.turn.clone())
    } else {
        None
    };
    let is_draw = winner.is_none() && board.iter().all(|line| line.iter().all(Option::is_some));

    Ok(GameState {
        kind: "connect-four".to_string(),
        board,
        turn: opposing_side(&state.turn).to_string(),
        status: if winner.is_some() || is_draw {
            SessionStatus::Finished
        } else {
            SessionStatus::Active
        },
        winner,
        last_move: Some(last_move),
        move_count: state.move_count + 1,
        winning_line,
    })
}

fn landing_row(board: &[Vec<Option<Disc>>], column: u8) -> Option<usize> {
    let col = usize::from(column.saturating_sub(1));
    if col >= COLS {
        return None;
    }
    (0..ROWS).rev().find(|row| board[*row][col].is_none())
}

fn create_disc(side: &str) -> Disc {
    Disc {
        side: side.to_string(),
        display: "●".to_string(),
    }
}

fn create_move(column: u8, row: usize, side: &str) -> Result<MoveRecord> {
    Ok(MoveRecord {
        column,
        row: (ROWS - row) as u8,
        point: coordinates_to_point(row, usize::from(column - 1))?,
        side: side.to_string(),
        disc: create_disc(side),
        notation: column.to_string(),
    })
}

fn opposing_side(side: &str) -> &'static str {
    if side == "red" { "yellow" } else { "red" }
}

fn coordinates_to_point(row: usize, col: usize) -> Result<String> {
    if row >= ROWS || col >= COLS {
        return Err(anyhow!("Invalid Connect Four coordinates: {row},{col}"));
    }
    Ok(format!("{}{}", FILES[col] as char, ROWS - row))
}

fn find_winning_line(
    board: &[Vec<Option<Disc>>],
    row: usize,
    col: usize,
    side: &str,
) -> Option<Vec<String>> {
    for (row_delta, col_delta) in DIRECTIONS {
        let mut line = collect_direction(board, row, col, side, -*row_delta, -*col_delta);
        line.reverse();
        line.push((row, col));
        line.extend(collect_direction(board, row, col, side, *row_delta, *col_delta));
        if line.len() >= 4 {
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
    board: &[Vec<Option<Disc>>],
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
        && (current_row as usize) < ROWS
        && (current_col as usize) < COLS
    {
        let next_row = current_row as usize;
        let next_col = current_col as usize;
        match &board[next_row][next_col] {
            Some(disc) if disc.side == side => points.push((next_row, next_col)),
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
            .list_legal_moves(&state, Some(&Value::Number(1_u8.into())))
            .unwrap();

        assert_eq!(moves.len(), 1);
        assert_eq!(moves[0]["column"], Value::Number(1_u8.into()));
    }

    #[test]
    fn detects_vertical_win() {
        let mut state = create_initial_game();
        for column in [1, 2, 1, 2, 1, 2, 1] {
            state = play_move(&state, column).unwrap();
        }
        assert_eq!(state.status, SessionStatus::Finished);
        assert_eq!(state.winner.as_deref(), Some("red"));
    }
}
