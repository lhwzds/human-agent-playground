use anyhow::{Result, anyhow};
use restflow_ai::llm::{CompletionRequest, DefaultLlmClientFactory, LlmClientFactory, Message};
use restflow_core::AIModel;
use restflow_core::auth::AuthProfileManager;
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;
use tracing::warn;

use crate::types::{
    DecideTurnRequest, DecideTurnResponse, DecisionAlternative, DecisionExplanation, UsageStats,
};

const RAW_RESPONSE_PREVIEW_LIMIT: usize = 400;

#[derive(Debug, Deserialize)]
struct RawDecisionResponse {
    action: Option<Value>,
    reasoning: Option<RawReasoning>,
}

#[derive(Debug, Deserialize)]
struct RawReasoning {
    summary: String,
    #[serde(rename = "reasoningSteps", default)]
    reasoning_steps: Vec<String>,
    #[serde(rename = "consideredAlternatives", default)]
    considered_alternatives: Vec<RawAlternative>,
    confidence: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawAlternative {
    action: String,
    summary: String,
    #[serde(rename = "rejectedBecause")]
    rejected_because: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DecisionFailure {
    error_code: &'static str,
    message: String,
    raw_response_preview: Option<String>,
}

impl DecisionFailure {
    fn provider_unavailable(message: impl Into<String>) -> Self {
        Self {
            error_code: "provider_unavailable",
            message: message.into(),
            raw_response_preview: None,
        }
    }

    fn provider_request_failed(message: impl Into<String>) -> Self {
        Self {
            error_code: "provider_request_failed",
            message: message.into(),
            raw_response_preview: None,
        }
    }

    fn decision_parse_failed(
        message: impl Into<String>,
        raw_response_preview: Option<String>,
    ) -> Self {
        Self {
            error_code: "decision_parse_failed",
            message: message.into(),
            raw_response_preview,
        }
    }

    fn decision_missing_action(
        message: impl Into<String>,
        raw_response_preview: Option<String>,
    ) -> Self {
        Self {
            error_code: "decision_missing_action",
            message: message.into(),
            raw_response_preview,
        }
    }
}

pub async fn decide_turn(
    auth_manager: Arc<AuthProfileManager>,
    request: DecideTurnRequest,
) -> DecideTurnResponse {
    match decide_turn_inner(auth_manager, request).await {
        Ok(result) => result,
        Err(error) => DecideTurnResponse {
            action: None,
            reasoning: None,
            usage: None,
            model: None,
            provider: None,
            error: Some(error.message),
            error_code: Some(error.error_code.to_string()),
            raw_response_preview: error.raw_response_preview,
        },
    }
}

async fn decide_turn_inner(
    auth_manager: Arc<AuthProfileManager>,
    request: DecideTurnRequest,
) -> std::result::Result<DecideTurnResponse, DecisionFailure> {
    if std::env::var("HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_FORCE_FIRST_LEGAL")
        .ok()
        .as_deref()
        == Some("1")
    {
        return mock_decide_turn(request);
    }

    let model = resolve_model(&request.seat_config.model)
        .map_err(|error| DecisionFailure::provider_unavailable(error.to_string()))?;
    let provider = model.provider();
    let api_key = resolve_api_key(
        auth_manager,
        model,
        request.seat_config.provider_profile_id.as_deref(),
    )
    .await?;

    let mut api_keys = HashMap::new();
    if let Some(key) = api_key.clone() {
        api_keys.insert(provider.as_llm_provider(), key);
    }

    let factory = DefaultLlmClientFactory::new(api_keys, AIModel::build_model_specs());
    let client = factory
        .create_client(model.as_serialized_str(), api_key.as_deref())
        .map_err(|error| {
            DecisionFailure::provider_unavailable(format!(
                "Failed to initialize the AI provider client: {error}"
            ))
        })?;

    let system_prompt = build_system_prompt(
        &request.game_id,
        &request.seat_side,
        request.seat_config.prompt_override.as_deref(),
    );
    let user_prompt = build_user_prompt(&request).map_err(|error| {
        DecisionFailure::provider_request_failed(format!(
            "Failed to build the turn decision prompt: {error}"
        ))
    })?;

    let response = client
        .complete(
            CompletionRequest::new(vec![
                Message::system(system_prompt),
                Message::user(user_prompt),
            ])
            .with_max_tokens(1200),
        )
        .await
        .map_err(|error| {
            DecisionFailure::provider_request_failed(format!(
                "Failed to complete turn decision: {error}"
            ))
        })?;
    let repair_legal_moves = request.legal_moves.clone();

    let content = response
        .content
        .as_deref()
        .map(strip_code_fence)
        .ok_or_else(|| {
            DecisionFailure::decision_parse_failed("The model returned an empty response.", None)
        })?;
    let parsed = parse_or_repair_decision_response(
        &content,
        &request,
        provider.as_canonical_str(),
        model.as_serialized_str(),
        |raw_response| async move {
            let repair_system_prompt = build_repair_system_prompt();
            let repair_user_prompt =
                build_repair_user_prompt(raw_response.as_str(), &repair_legal_moves).map_err(
                    |error| {
                        DecisionFailure::provider_request_failed(format!(
                            "Failed to build the repair prompt: {error}"
                        ))
                    },
                )?;

            let repair_response = client
                .complete(
                    CompletionRequest::new(vec![
                        Message::system(repair_system_prompt),
                        Message::user(repair_user_prompt),
                    ])
                    .with_max_tokens(600),
                )
                .await
                .map_err(|error| {
                    DecisionFailure::provider_request_failed(format!(
                        "Failed to repair the model response: {error}"
                    ))
                })?;

            repair_response
                .content
                .as_deref()
                .map(strip_code_fence)
                .ok_or_else(|| {
                    DecisionFailure::decision_parse_failed("The repair response was empty.", None)
                })
        },
    )
    .await?;

    let reasoning = parsed.reasoning.map(|value| DecisionExplanation {
        summary: value.summary,
        reasoning_steps: value.reasoning_steps,
        considered_alternatives: value
            .considered_alternatives
            .into_iter()
            .map(|item| DecisionAlternative {
                action: item.action,
                summary: item.summary,
                rejected_because: item.rejected_because,
            })
            .collect(),
        confidence: value.confidence,
    });

    Ok(DecideTurnResponse {
        action: parsed.action,
        reasoning,
        usage: response.usage.map(|usage| UsageStats {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            cost_usd: usage.cost_usd,
        }),
        model: Some(model.as_serialized_str().to_string()),
        provider: Some(provider.as_canonical_str().to_string()),
        error: None,
        error_code: None,
        raw_response_preview: None,
    })
}

fn mock_decide_turn(
    request: DecideTurnRequest,
) -> std::result::Result<DecideTurnResponse, DecisionFailure> {
    let action = request
        .legal_moves
        .as_array()
        .and_then(|moves| moves.first())
        .cloned()
        .ok_or_else(|| {
            DecisionFailure::decision_missing_action(
                "No legal moves were available in mock bridge mode.",
                None,
            )
        })?;

    let provider = request
        .seat_config
        .provider
        .clone()
        .or_else(|| {
            resolve_model(&request.seat_config.model)
                .ok()
                .map(|model| model.provider().as_canonical_str().to_string())
        })
        .unwrap_or_else(|| "mock".to_string());

    Ok(DecideTurnResponse {
        action: Some(action),
        reasoning: Some(DecisionExplanation {
            summary: format!(
                "Selected the first legal move in mock bridge mode for {}.",
                request.game_id
            ),
            reasoning_steps: vec![
                "Mock bridge mode is enabled.".to_string(),
                "Returned the first legal move from the provided legal move list.".to_string(),
            ],
            considered_alternatives: Vec::new(),
            confidence: Some(0.01),
        }),
        usage: Some(UsageStats {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            cost_usd: Some(0.0),
        }),
        model: Some(request.seat_config.model),
        provider: Some(provider),
        error: None,
        error_code: None,
        raw_response_preview: None,
    })
}

fn resolve_model(value: &str) -> Result<AIModel> {
    AIModel::from_api_name(value)
        .or_else(|| AIModel::from_canonical_id(value))
        .ok_or_else(|| anyhow!("Unsupported model: {}", value))
}

async fn resolve_api_key(
    auth_manager: Arc<AuthProfileManager>,
    model: AIModel,
    profile_id: Option<&str>,
) -> std::result::Result<Option<String>, DecisionFailure> {
    let provider = model.provider();

    if let Some(profile_id) = profile_id {
        let profile = auth_manager.get_profile(profile_id).await.ok_or_else(|| {
            DecisionFailure::provider_unavailable(format!("Auth profile not found: {}", profile_id))
        })?;
        return profile
            .get_api_key(auth_manager.resolver())
            .map(Some)
            .map_err(|error| {
                DecisionFailure::provider_unavailable(format!(
                    "Failed to read the credential for auth profile {}: {}",
                    profile_id, error
                ))
            });
    }

    if model.is_codex_cli() || model.is_gemini_cli() || model.is_claude_code() {
        return Ok(None);
    }

    if let Ok(value) = std::env::var(provider.api_key_env()) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_string()));
        }
    }

    let compatible_profiles = auth_manager
        .get_compatible_profiles_for_model_provider(provider)
        .await;
    if let Some(profile) = compatible_profiles.into_iter().next() {
        let profile_id = profile.id.clone();
        return profile
            .get_api_key(auth_manager.resolver())
            .map(Some)
            .map_err(|error| {
                DecisionFailure::provider_unavailable(format!(
                    "Failed to read the credential for auth profile {}: {}",
                    profile_id, error
                ))
            });
    }

    Err(DecisionFailure::provider_unavailable(format!(
        "No usable credential was found for provider {}",
        provider.as_canonical_str()
    )))
}

fn build_system_prompt(game_id: &str, seat_side: &str, prompt_override: Option<&str>) -> String {
    let base = format!(
        "You are the AI player for a shared board-game session.\nGame: {game_id}\nSeat: {seat_side}\nChoose exactly one legal action.\nRespond with raw JSON only, no markdown.\nOutput schema:\n{{\"action\": <one legal action object>, \"reasoning\": {{\"summary\": string, \"reasoningSteps\": string[], \"consideredAlternatives\": [{{\"action\": string, \"summary\": string, \"rejectedBecause\"?: string}}], \"confidence\"?: number}}}}\nNever invent actions outside the provided legal moves."
    );

    match prompt_override {
        Some(prompt) if !prompt.trim().is_empty() => {
            format!("{base}\n\nAdditional guidance:\n{}", prompt.trim())
        }
        _ => base,
    }
}

fn build_user_prompt(request: &DecideTurnRequest) -> Result<String> {
    Ok(serde_json::to_string_pretty(&json!({
        "gameId": request.game_id,
        "sessionId": request.session_id,
        "seatSide": request.seat_side,
        "state": request.state,
        "legalMoves": request.legal_moves,
        "recentEvents": request.recent_events,
    }))?)
}

fn build_repair_system_prompt() -> String {
    "You repair invalid model outputs for a board-game AI runtime. Return exactly one raw JSON object. Do not use markdown, code fences, or explanations. The object must include an \"action\" field copied from the legal move list. Include \"reasoning\" only if it is already present and can be preserved without inventing facts.".to_string()
}

fn build_repair_user_prompt(raw_response: &str, legal_moves: &Value) -> Result<String> {
    Ok(serde_json::to_string_pretty(&json!({
        "task": "Convert the previous model output into one valid JSON object.",
        "rules": [
            "Return JSON only.",
            "Do not include markdown or explanation.",
            "The action must match exactly one object from legalMoves.",
            "If you include reasoning, keep it brief and structured."
        ],
        "schema": {
            "action": "<one legal move object>",
            "reasoning": {
                "summary": "string",
                "reasoningSteps": ["string"],
                "consideredAlternatives": [
                    {
                        "action": "string",
                        "summary": "string",
                        "rejectedBecause": "string"
                    }
                ],
                "confidence": 0.5
            }
        },
        "legalMoves": legal_moves,
        "previousResponse": raw_response,
    }))?)
}

fn strip_code_fence(content: &str) -> String {
    let trimmed = content.trim();
    if !trimmed.starts_with("```") {
        return trimmed.to_string();
    }

    trimmed
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string()
}

fn parse_decision_response(content: &str) -> Result<RawDecisionResponse> {
    if let Ok(parsed) = serde_json::from_str(content) {
        return Ok(parsed);
    }

    if let Ok(parsed) = json5::from_str(content) {
        return Ok(parsed);
    }

    if let Some(candidate) = extract_first_json_object(content) {
        if let Ok(parsed) = serde_json::from_str(&candidate) {
            return Ok(parsed);
        }

        if let Ok(parsed) = json5::from_str(&candidate) {
            return Ok(parsed);
        }
    }

    Err(anyhow!("Model response was not valid JSON"))
}

fn finalize_decision_response(
    parsed: RawDecisionResponse,
    raw_response: &str,
) -> std::result::Result<RawDecisionResponse, DecisionFailure> {
    if parsed.action.is_none() {
        return Err(DecisionFailure::decision_missing_action(
            "The model response did not include an action.",
            Some(make_raw_response_preview(raw_response)),
        ));
    }

    Ok(parsed)
}

async fn parse_or_repair_decision_response<F, Fut>(
    content: &str,
    request: &DecideTurnRequest,
    provider: &str,
    model: &str,
    repair: F,
) -> std::result::Result<RawDecisionResponse, DecisionFailure>
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = std::result::Result<String, DecisionFailure>>,
{
    match parse_decision_response(content) {
        Ok(parsed) => return finalize_decision_response(parsed, content),
        Err(error) => {
            warn!(
                provider = provider,
                model = model,
                session_id = %request.session_id,
                side = %request.seat_side,
                stage = "initial",
                error = %error,
                raw_response_preview = %make_raw_response_preview(content),
                "Failed to parse the initial AI decision response"
            );
        }
    }

    let repaired_content = repair(content.to_string()).await?;
    match parse_decision_response(&repaired_content) {
        Ok(parsed) => finalize_decision_response(parsed, &repaired_content),
        Err(error) => {
            let preview = make_raw_response_preview(&repaired_content);
            warn!(
                provider = provider,
                model = model,
                session_id = %request.session_id,
                side = %request.seat_side,
                stage = "repair",
                error = %error,
                raw_response_preview = %preview,
                "Failed to parse the repaired AI decision response"
            );
            Err(DecisionFailure::decision_parse_failed(
                "The model response could not be converted into a valid action.",
                Some(preview),
            ))
        }
    }
}

fn make_raw_response_preview(content: &str) -> String {
    let normalized = content.split_whitespace().collect::<Vec<_>>().join(" ");
    let truncated: String = normalized
        .chars()
        .take(RAW_RESPONSE_PREVIEW_LIMIT)
        .collect();
    if normalized.chars().count() > RAW_RESPONSE_PREVIEW_LIMIT {
        format!("{truncated}…")
    } else {
        truncated
    }
}

fn extract_first_json_object(content: &str) -> Option<String> {
    let start = content.find('{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaping = false;

    for (offset, ch) in content[start..].char_indices() {
        if in_string {
            if escaping {
                escaping = false;
                continue;
            }

            match ch {
                '\\' => escaping = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                if depth == 0 {
                    return None;
                }
                depth -= 1;
                if depth == 0 {
                    let end = start + offset + ch.len_utf8();
                    return Some(content[start..end].to_string());
                }
            }
            _ => {}
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_code_fences() {
        assert_eq!(
            strip_code_fence("```json\n{\"action\":{\"from\":\"e2\",\"to\":\"e4\"}}\n```"),
            "{\"action\":{\"from\":\"e2\",\"to\":\"e4\"}}"
        );
    }

    #[test]
    fn extracts_json_object_from_surrounding_text() {
        let extracted = extract_first_json_object(
            "Here is the move.\n{\"action\":{\"from\":\"e7\",\"to\":\"e5\"},\"reasoning\":{\"summary\":\"Develop\",\"reasoningSteps\":[\"Occupy the center.\"],\"consideredAlternatives\":[]}}\nGood luck.",
        );

        assert_eq!(
            extracted.as_deref(),
            Some(
                "{\"action\":{\"from\":\"e7\",\"to\":\"e5\"},\"reasoning\":{\"summary\":\"Develop\",\"reasoningSteps\":[\"Occupy the center.\"],\"consideredAlternatives\":[]}}"
            ),
        );
    }

    #[test]
    fn parses_decision_response_after_extraction() {
        let parsed = parse_decision_response(
            "I will play the most principled move.\n```json\n{\"action\":{\"from\":\"e7\",\"to\":\"e5\"},\"reasoning\":{\"summary\":\"Fight for the center.\",\"reasoningSteps\":[\"e5 contests white immediately.\"],\"consideredAlternatives\":[]}}\n```",
        )
        .unwrap();

        assert_eq!(parsed.action, Some(json!({ "from": "e7", "to": "e5" })));
        assert_eq!(
            parsed
                .reasoning
                .as_ref()
                .map(|reasoning| reasoning.summary.as_str()),
            Some("Fight for the center.")
        );
    }

    #[test]
    fn parses_json5_style_response() {
        let parsed = parse_decision_response(
            "The move is:\n{action: {from: 'e7', to: 'e5'}, reasoning: {summary: 'Fight for the center.', reasoningSteps: ['e5 contests white immediately.'], consideredAlternatives: [], confidence: 0.72,},}",
        )
        .unwrap();

        assert_eq!(parsed.action, Some(json!({ "from": "e7", "to": "e5" })));
        assert_eq!(
            parsed
                .reasoning
                .as_ref()
                .map(|reasoning| reasoning.summary.as_str()),
            Some("Fight for the center.")
        );
    }

    #[tokio::test]
    async fn repairs_an_invalid_response_into_valid_json() {
        let request = DecideTurnRequest {
            game_id: "chess".to_string(),
            session_id: "session-1".to_string(),
            seat_side: "black".to_string(),
            state: json!({}),
            legal_moves: json!([
                { "from": "e7", "to": "e5" },
                { "from": "c7", "to": "c5" }
            ]),
            recent_events: json!([]),
            seat_config: crate::types::SeatConfigInput {
                provider_profile_id: None,
                provider: Some("codex-cli".to_string()),
                model: "codex-mini-latest".to_string(),
                prompt_override: None,
                timeout_ms: Some(60_000),
            },
        };

        let repaired = parse_or_repair_decision_response(
            "I would push the central pawn.",
            &request,
            "codex-cli",
            "codex-mini-latest",
            |_raw| async {
                Ok(
                    "{\"action\":{\"from\":\"e7\",\"to\":\"e5\"},\"reasoning\":{\"summary\":\"Contest the center.\",\"reasoningSteps\":[\"e5 claims central space.\"],\"consideredAlternatives\":[]}}"
                        .to_string(),
                )
            },
        )
        .await
        .unwrap();

        assert_eq!(repaired.action, Some(json!({ "from": "e7", "to": "e5" })));
    }

    #[tokio::test]
    async fn returns_a_structured_parse_failure_when_repair_fails() {
        let request = DecideTurnRequest {
            game_id: "chess".to_string(),
            session_id: "session-1".to_string(),
            seat_side: "black".to_string(),
            state: json!({}),
            legal_moves: json!([{ "from": "e7", "to": "e5" }]),
            recent_events: json!([]),
            seat_config: crate::types::SeatConfigInput {
                provider_profile_id: None,
                provider: Some("codex-cli".to_string()),
                model: "codex-mini-latest".to_string(),
                prompt_override: None,
                timeout_ms: Some(60_000),
            },
        };

        let error = parse_or_repair_decision_response(
            "still not json",
            &request,
            "codex-cli",
            "codex-mini-latest",
            |_raw| async { Ok("still not json after repair".to_string()) },
        )
        .await
        .unwrap_err();

        assert_eq!(error.error_code, "decision_parse_failed");
        assert!(error.raw_response_preview.is_some());
    }

    #[test]
    fn resolves_known_models() {
        assert_eq!(resolve_model("gpt-5").unwrap().as_serialized_str(), "gpt-5");
        assert!(resolve_model("nope-model").is_err());
    }

    #[test]
    fn mock_mode_returns_first_legal_action() {
        let response = mock_decide_turn(DecideTurnRequest {
            game_id: "chess".to_string(),
            session_id: "session-1".to_string(),
            seat_side: "black".to_string(),
            state: json!({}),
            legal_moves: json!([
                { "from": "e7", "to": "e5" },
                { "from": "c7", "to": "c5" }
            ]),
            recent_events: json!([]),
            seat_config: crate::types::SeatConfigInput {
                provider_profile_id: Some("profile-1".to_string()),
                provider: Some("openai".to_string()),
                model: "gpt-5".to_string(),
                prompt_override: None,
                timeout_ms: Some(60_000),
            },
        })
        .unwrap();

        assert_eq!(response.action, Some(json!({ "from": "e7", "to": "e5" })));
        assert_eq!(response.provider.as_deref(), Some("openai"));
    }
}
