use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Active,
    Finished,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AiSeatStatus {
    #[default]
    Idle,
    Thinking,
    Waiting,
    Errored,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AiRuntimeProviderId {
    Openai,
    Anthropic,
    Codex,
    ClaudeCode,
    Gemini,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "snake_case")]
pub enum AiLauncherId {
    #[default]
    Human,
    Openai,
    Anthropic,
    Codex,
    ClaudeCode,
    Gemini,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionSeatLauncherInput {
    #[serde(default)]
    pub launcher: AiLauncherId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_play: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionInput {
    #[serde(default = "default_game_id")]
    pub game_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor_kind: Option<SessionActorKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<SessionChannel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seat_launchers: Option<HashMap<String, CreateSessionSeatLauncherInput>>,
}

impl Default for CreateSessionInput {
    fn default() -> Self {
        Self {
            game_id: default_game_id(),
            actor_kind: None,
            channel: None,
            actor_name: None,
            seat_launchers: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub struct GameCatalogItem {
    pub id: String,
    pub title: String,
    #[serde(rename = "shortName")]
    pub short_name: String,
    pub description: String,
    pub sides: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DecisionAlternative {
    pub action: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rejected_because: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DecisionExplanation {
    pub summary: String,
    #[serde(default)]
    pub reasoning_steps: Vec<String>,
    #[serde(default)]
    pub considered_alternatives: Vec<DecisionAlternative>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuthProfileSummary {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub source: String,
    pub health: String,
    pub enabled: bool,
    pub credential_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub masked_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModel {
    pub id: String,
    pub label: String,
    pub provider: String,
    #[serde(default)]
    pub supports_temperature: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapability {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub available: bool,
    pub status: String,
    #[serde(default)]
    pub models: Vec<ProviderModel>,
    #[serde(default)]
    pub auth_providers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSeatConfig {
    pub side: String,
    #[serde(default)]
    pub launcher: AiLauncherId,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub auto_play: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_profile_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_override: Option<String>,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub status: AiSeatStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_source: Option<String>,
}

impl Default for AiSeatConfig {
    fn default() -> Self {
        Self {
            side: String::new(),
            launcher: AiLauncherId::Human,
            enabled: false,
            auto_play: true,
            provider_profile_id: None,
            model: None,
            prompt_override: None,
            timeout_ms: default_timeout_ms(),
            status: AiSeatStatus::Idle,
            last_error: None,
            runtime_source: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiSeatInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launcher: Option<AiLauncherId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_play: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_profile_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_override: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeProviderSetting {
    pub provider_id: AiRuntimeProviderId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_profile_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preferred_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct AiRuntimeSettings {
    pub providers: Vec<AiRuntimeProviderSetting>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSeatLauncherState {
    pub side: String,
    #[serde(default)]
    pub launcher: AiLauncherId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub auto_play: bool,
    #[serde(default)]
    pub status: AiSeatStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiSeatLauncherAdvancedInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_profile_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_override: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiSeatLauncherInput {
    pub launcher: AiLauncherId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_play: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub advanced: Option<UpdateAiSeatLauncherAdvancedInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateAuthProfileInput {
    pub name: String,
    pub provider: String,
    pub credential_type: String,
    pub credential_value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAuthProfileInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential_value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionEventKind {
    SessionCreated,
    MovePlayed,
    SessionReset,
    SystemNotice,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionActorKind {
    Human,
    Agent,
    System,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionChannel {
    Ui,
    Mcp,
    Http,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionEvent {
    pub id: String,
    pub kind: SessionEventKind,
    pub created_at: String,
    pub actor_kind: SessionActorKind,
    pub channel: SessionChannel,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor_name: Option<String>,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<DecisionExplanation>,
    #[serde(default)]
    pub details: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameSession {
    pub id: String,
    pub game_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub state: Value,
    pub events: Vec<SessionEvent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_seats: Option<HashMap<String, AiSeatConfig>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct SessionStreamEvent {
    pub session: GameSession,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSessions {
    pub sessions: Vec<GameSession>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_runtime_settings: Option<AiRuntimeSettings>,
}

pub fn now_iso() -> String {
    DateTime::<Utc>::from(std::time::SystemTime::now()).to_rfc3339()
}

fn default_game_id() -> String {
    "xiangqi".to_string()
}

fn default_true() -> bool {
    true
}

fn default_timeout_ms() -> u64 {
    60_000
}
