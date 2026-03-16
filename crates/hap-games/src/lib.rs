mod chess;
mod connect_four;
mod gomoku;
mod othello;
mod xiangqi;

use anyhow::{Result, anyhow};
use hap_models::GameCatalogItem;
use serde_json::Value;

pub trait GameAdapter: Send + Sync {
    fn game(&self) -> &GameCatalogItem;
    fn create_initial_state(&self) -> Result<Value>;
    fn normalize_state(&self, state: Value) -> Result<Value>;
    fn list_legal_moves(&self, state: &Value, query: Option<&Value>) -> Result<Vec<Value>>;
    fn play_move(&self, state: &Value, input: &Value) -> Result<Value>;
}

pub fn list_game_catalog() -> Vec<GameCatalogItem> {
    adapters()
        .iter()
        .map(|adapter| adapter.game().clone())
        .collect()
}

pub fn get_game_adapter(game_id: &str) -> Result<&'static dyn GameAdapter> {
    adapters()
        .into_iter()
        .find(|adapter| adapter.game().id == game_id)
        .ok_or_else(|| anyhow!("Unsupported game: {game_id}"))
}

fn adapters() -> Vec<&'static dyn GameAdapter> {
    vec![
        &xiangqi::ADAPTER,
        &chess::ADAPTER,
        &gomoku::ADAPTER,
        &connect_four::ADAPTER,
        &othello::ADAPTER,
    ]
}
