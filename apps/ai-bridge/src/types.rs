use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderModel {
    pub id: String,
    pub label: String,
    pub provider: String,
    #[serde(rename = "supportsTemperature")]
    pub supports_temperature: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCapability {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub available: bool,
    pub status: String,
    pub models: Vec<ProviderModel>,
    #[serde(rename = "authProviders")]
    pub auth_providers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthProfileSummary {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub source: String,
    pub health: String,
    pub enabled: bool,
    #[serde(rename = "credentialType")]
    pub credential_type: String,
    #[serde(rename = "maskedValue")]
    pub masked_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAuthProfileInput {
    pub name: String,
    pub provider: String,
    #[serde(rename = "credentialType")]
    pub credential_type: String,
    #[serde(rename = "credentialValue")]
    pub credential_value: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateAuthProfileInput {
    pub name: Option<String>,
    pub enabled: Option<bool>,
    pub priority: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeatConfigInput {
    #[serde(rename = "providerProfileId")]
    pub provider_profile_id: Option<String>,
    pub provider: Option<String>,
    pub model: String,
    #[serde(rename = "promptOverride")]
    pub prompt_override: Option<String>,
    #[serde(rename = "timeoutMs")]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecideTurnRequest {
    #[serde(rename = "gameId")]
    pub game_id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "seatSide")]
    pub seat_side: String,
    pub state: Value,
    #[serde(rename = "legalMoves")]
    pub legal_moves: Value,
    #[serde(rename = "recentEvents")]
    pub recent_events: Value,
    #[serde(rename = "seatConfig")]
    pub seat_config: SeatConfigInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionAlternative {
    pub action: String,
    pub summary: String,
    #[serde(rename = "rejectedBecause", skip_serializing_if = "Option::is_none")]
    pub rejected_because: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionExplanation {
    pub summary: String,
    #[serde(rename = "reasoningSteps", default)]
    pub reasoning_steps: Vec<String>,
    #[serde(rename = "consideredAlternatives", default)]
    pub considered_alternatives: Vec<DecisionAlternative>,
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UsageStats {
    #[serde(rename = "promptTokens")]
    pub prompt_tokens: u32,
    #[serde(rename = "completionTokens")]
    pub completion_tokens: u32,
    #[serde(rename = "totalTokens")]
    pub total_tokens: u32,
    #[serde(rename = "costUsd")]
    pub cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecideTurnResponse {
    pub action: Option<Value>,
    pub reasoning: Option<DecisionExplanation>,
    pub usage: Option<UsageStats>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub error: Option<String>,
    #[serde(rename = "errorCode", skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(rename = "rawResponsePreview", skip_serializing_if = "Option::is_none")]
    pub raw_response_preview: Option<String>,
}
