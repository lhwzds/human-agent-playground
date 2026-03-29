mod mcp;

use anyhow::Result;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use futures::StreamExt;
use futures::stream::once;
use hap_models::{
    AiRuntimeSettings, CreateAuthProfileInput, CreateSessionInput, GameSession, SessionStreamEvent,
    UpdateAiSeatInput, UpdateAiSeatLauncherInput, UpdateAiSeatLaunchersInput,
    UpdateAuthProfileInput,
};
use hap_runtime::{HumanAgentPlaygroundRuntime, RuntimeConfig, RuntimeError};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use tokio_stream::wrappers::BroadcastStream;
use tokio_util::sync::CancellationToken;
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

use crate::mcp::HumanAgentPlaygroundMcpServer;

#[derive(Clone)]
struct AppState {
    runtime: Arc<HumanAgentPlaygroundRuntime>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,human_agent_playground_backend=debug")),
        )
        .init();

    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(8790);
    let runtime = HumanAgentPlaygroundRuntime::new(runtime_config_from_env()).await?;
    let app = build_app(runtime, CancellationToken::new());

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

fn runtime_config_from_env() -> RuntimeConfig {
    let defaults = RuntimeConfig::default();
    RuntimeConfig {
        session_data_path: std::env::var("HUMAN_AGENT_PLAYGROUND_DATA_PATH")
            .ok()
            .map(PathBuf::from)
            .unwrap_or(defaults.session_data_path),
        auth_data_path: std::env::var("HUMAN_AGENT_PLAYGROUND_AUTH_DATA_PATH")
            .ok()
            .or_else(|| std::env::var("HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_DATA_PATH").ok())
            .map(PathBuf::from)
            .unwrap_or(defaults.auth_data_path),
    }
}

fn build_app(runtime: Arc<HumanAgentPlaygroundRuntime>, cancellation: CancellationToken) -> Router {
    let mcp_service = rmcp::transport::streamable_http_server::StreamableHttpService::new(
        {
            let runtime = runtime.clone();
            move || Ok(HumanAgentPlaygroundMcpServer::new(runtime.clone()))
        },
        rmcp::transport::streamable_http_server::session::local::LocalSessionManager::default()
            .into(),
        rmcp::transport::streamable_http_server::StreamableHttpServerConfig {
            stateful_mode: false,
            cancellation_token: cancellation,
            ..Default::default()
        },
    );

    Router::new()
        .route("/health", get(handle_health))
        .route("/api/games", get(handle_list_games))
        .route(
            "/api/sessions",
            get(handle_list_sessions).post(handle_create_session),
        )
        .route("/api/sessions/{session_id}", get(handle_get_session))
        .route(
            "/api/sessions/{session_id}/stream",
            get(handle_stream_session),
        )
        .route(
            "/api/sessions/{session_id}/legal-moves",
            get(handle_get_legal_moves),
        )
        .route("/api/sessions/{session_id}/moves", post(handle_play_move))
        .route(
            "/api/sessions/{session_id}/reset",
            post(handle_reset_session),
        )
        .route("/api/ai/providers", get(handle_list_ai_providers))
        .route(
            "/api/ai/auth-profiles",
            get(handle_list_auth_profiles).post(handle_create_auth_profile),
        )
        .route(
            "/api/ai/auth-profiles/{profile_id}",
            patch(handle_update_auth_profile).delete(handle_delete_auth_profile),
        )
        .route(
            "/api/ai/auth-profiles/{profile_id}/test",
            post(handle_test_auth_profile),
        )
        .route(
            "/api/ai/runtime-settings",
            get(handle_get_ai_runtime_settings).put(handle_update_ai_runtime_settings),
        )
        .route(
            "/api/sessions/{session_id}/ai-seats",
            get(handle_get_ai_seats).patch(handle_update_ai_seat_launchers),
        )
        .route(
            "/api/sessions/{session_id}/ai-seats/{side}",
            patch(handle_update_ai_seat),
        )
        .route(
            "/api/sessions/{session_id}/ai-seats/{side}/launcher",
            patch(handle_update_ai_seat_launcher),
        )
        .nest_service("/mcp", mcp_service)
        .with_state(AppState { runtime })
        .layer(CorsLayer::permissive())
}

async fn handle_health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn handle_list_games(State(state): State<AppState>) -> Json<Value> {
    Json(json!({ "games": state.runtime.list_games() }))
}

async fn handle_list_sessions(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({
        "sessions": state.runtime.list_sessions().await?
    })))
}

async fn handle_create_session(
    State(state): State<AppState>,
    Json(input): Json<CreateSessionInput>,
) -> Result<Json<Value>, ApiError> {
    let session = state.runtime.create_session(input).await?;
    Ok(Json(serde_json::to_value(session).unwrap_or(Value::Null)))
}

async fn handle_get_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let session = state.runtime.get_session(&session_id).await?;
    Ok(Json(serde_json::to_value(session).unwrap_or(Value::Null)))
}

async fn handle_stream_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Sse<impl futures::Stream<Item = Result<Event, Infallible>>>, ApiError> {
    let (session, receiver) = state.runtime.subscribe_session(&session_id).await?;
    let initial = once(async move { Ok(event_for_session(session)) });
    let updates = BroadcastStream::new(receiver).filter_map(|result| async move {
        match result {
            Ok(session) => Some(Ok(event_for_session(session))),
            Err(_) => None,
        }
    });

    Ok(Sse::new(initial.chain(updates))
        .keep_alive(KeepAlive::new().interval(std::time::Duration::from_secs(15))))
}

async fn handle_get_legal_moves(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    let query_value = if query.is_empty() {
        None
    } else {
        Some(Value::Object(
            query
                .into_iter()
                .map(|(key, value)| (key, Value::String(value)))
                .collect(),
        ))
    };
    let moves = state
        .runtime
        .get_legal_moves(&session_id, query_value)
        .await?;
    Ok(Json(json!({ "moves": moves })))
}

async fn handle_play_move(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(input): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let session = state.runtime.play_move(&session_id, input).await?;
    Ok(Json(serde_json::to_value(session).unwrap_or(Value::Null)))
}

async fn handle_reset_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    input: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let session = state
        .runtime
        .reset_session(
            &session_id,
            input
                .map(|Json(value)| value)
                .unwrap_or_else(|| json!({ "actorKind": "unknown", "channel": "http" })),
        )
        .await?;
    Ok(Json(serde_json::to_value(session).unwrap_or(Value::Null)))
}

async fn handle_list_ai_providers(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let providers = state.runtime.list_provider_capabilities().await?;
    Ok(Json(json!({ "providers": providers })))
}

async fn handle_list_auth_profiles(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let profiles = state.runtime.list_auth_profiles().await?;
    Ok(Json(json!({ "profiles": profiles })))
}

async fn handle_create_auth_profile(
    State(state): State<AppState>,
    Json(input): Json<CreateAuthProfileInput>,
) -> Result<Json<Value>, ApiError> {
    let (id, created) = state.runtime.create_auth_profile(input).await?;
    Ok(Json(json!({ "id": id, "created": created })))
}

async fn handle_update_auth_profile(
    State(state): State<AppState>,
    Path(profile_id): Path<String>,
    Json(input): Json<UpdateAuthProfileInput>,
) -> Result<Json<Value>, ApiError> {
    let (id, name, enabled, priority) = state
        .runtime
        .update_auth_profile(&profile_id, input)
        .await?;
    Ok(Json(json!({
        "id": id,
        "name": name,
        "enabled": enabled,
        "priority": priority,
    })))
}

async fn handle_delete_auth_profile(
    State(state): State<AppState>,
    Path(profile_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (deleted, id) = state.runtime.delete_auth_profile(&profile_id).await?;
    Ok(Json(json!({ "deleted": deleted, "id": id })))
}

async fn handle_test_auth_profile(
    State(state): State<AppState>,
    Path(profile_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (id, available) = state.runtime.test_auth_profile(&profile_id).await?;
    Ok(Json(json!({ "id": id, "available": available })))
}

async fn handle_get_ai_runtime_settings(
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    let payload = state.runtime.get_ai_runtime_settings().await?;
    Ok(Json(json!({
        "settings": payload.settings,
        "providers": payload.providers,
        "profiles": payload.profiles,
    })))
}

async fn handle_update_ai_runtime_settings(
    State(state): State<AppState>,
    Json(input): Json<AiRuntimeSettings>,
) -> Result<Json<Value>, ApiError> {
    let settings = state.runtime.update_ai_runtime_settings(input).await?;
    Ok(Json(json!({ "settings": settings })))
}

async fn handle_get_ai_seats(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let seats = state.runtime.get_ai_seats(&session_id).await?;
    Ok(Json(json!({ "seats": seats })))
}

async fn handle_update_ai_seat_launchers(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(input): Json<UpdateAiSeatLaunchersInput>,
) -> Result<Json<Value>, ApiError> {
    let session = state
        .runtime
        .update_ai_seat_launchers(&session_id, input)
        .await?;
    Ok(Json(serde_json::to_value(session).unwrap_or(Value::Null)))
}

async fn handle_update_ai_seat(
    State(state): State<AppState>,
    Path((session_id, side)): Path<(String, String)>,
    Json(input): Json<UpdateAiSeatInput>,
) -> Result<Json<Value>, ApiError> {
    let session = state
        .runtime
        .update_ai_seat(&session_id, &side, input)
        .await?;
    Ok(Json(serde_json::to_value(session).unwrap_or(Value::Null)))
}

async fn handle_update_ai_seat_launcher(
    State(state): State<AppState>,
    Path((session_id, side)): Path<(String, String)>,
    Json(input): Json<UpdateAiSeatLauncherInput>,
) -> Result<Json<Value>, ApiError> {
    let session = state
        .runtime
        .update_ai_seat_launcher(&session_id, &side, input)
        .await?;
    Ok(Json(serde_json::to_value(session).unwrap_or(Value::Null)))
}

fn event_for_session(session: GameSession) -> Event {
    Event::default().data(
        serde_json::to_string(&SessionStreamEvent { session })
            .unwrap_or_else(|_| "{\"session\":null}".to_string()),
    )
}

struct ApiError(RuntimeError);

impl From<RuntimeError> for ApiError {
    fn from(value: RuntimeError) -> Self {
        Self(value)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status =
            StatusCode::from_u16(self.0.status_code()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let mut body = serde_json::Map::new();
        body.insert(
            "error".to_string(),
            Value::String(self.0.message().to_string()),
        );
        if let Some(code) = self.0.code() {
            body.insert("code".to_string(), Value::String(code.to_string()));
        }
        for (key, value) in self.0.details() {
            body.insert(key.clone(), value.clone());
        }
        (status, Json(Value::Object(body))).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::build_app;
    use anyhow::Result;
    use hap_runtime::{HumanAgentPlaygroundRuntime, RuntimeConfig};
    use rmcp::ServiceExt;
    use rmcp::model::CallToolRequestParams;
    use rmcp::transport::StreamableHttpClientTransport;
    use serde_json::{Value, json};
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::time::{SystemTime, UNIX_EPOCH};
    use tokio::net::TcpListener;
    use tokio_util::sync::CancellationToken;

    fn temp_path(prefix: &str, suffix: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        path.push(format!("{prefix}-{nonce}-{suffix}"));
        path
    }

    #[tokio::test]
    async fn serves_mcp_tools_over_http_and_plays_xiangqi_move() -> Result<()> {
        let runtime = HumanAgentPlaygroundRuntime::new(RuntimeConfig {
            session_data_path: temp_path("hap-sessions", "sessions.json"),
            auth_data_path: temp_path("hap-auth", "restflow.db"),
        })
        .await?;
        let cancellation = CancellationToken::new();
        let app = build_app(Arc::clone(&runtime), cancellation.clone());
        let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
        let address = listener.local_addr()?;
        let handle = tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        let transport = StreamableHttpClientTransport::from_uri(format!(
            "http://127.0.0.1:{}/mcp",
            address.port()
        ));
        let client = ().serve(transport).await?;

        let tools = client.list_all_tools().await?;
        let names = tools
            .iter()
            .map(|tool| tool.name.as_ref())
            .collect::<Vec<_>>();
        assert!(names.contains(&"list_games"));
        assert!(names.contains(&"search_tools"));
        assert!(names.contains(&"get_game_state"));
        assert!(names.contains(&"wait_for_turn"));
        assert!(names.contains(&"reset_session"));
        assert!(names.contains(&"xiangqi_get_legal_moves"));
        assert!(names.contains(&"xiangqi_play_move"));
        assert!(names.contains(&"xiangqi_play_move_and_wait"));
        assert!(names.contains(&"chess_play_move_and_wait"));
        assert!(names.contains(&"gomoku_play_move_and_wait"));
        assert!(names.contains(&"connect_four_play_move_and_wait"));
        assert!(names.contains(&"othello_play_move_and_wait"));

        let created = client
            .call_tool(CallToolRequestParams {
                meta: None,
                name: "create_session".into(),
                arguments: Some(
                    json!({
                        "gameId": "xiangqi",
                    })
                    .as_object()
                    .cloned()
                    .unwrap_or_default(),
                ),
                task: None,
            })
            .await?;
        let session_id = created
            .structured_content
            .as_ref()
            .and_then(|value| value.get("payload"))
            .and_then(|value| value.get("id"))
            .and_then(Value::as_str)
            .expect("session id")
            .to_string();

        let result = client
            .call_tool(CallToolRequestParams {
                meta: None,
                name: "xiangqi_play_move_and_wait".into(),
                arguments: Some(
                    json!({
                        "sessionId": session_id,
                        "from": "a4",
                        "to": "a5",
                        "timeoutMs": 1000,
                        "reasoning": {
                            "summary": "Advance the pawn to pressure the file.",
                            "reasoningSteps": ["Push the pawn one step forward."],
                        }
                    })
                    .as_object()
                    .cloned()
                    .unwrap_or_default(),
                ),
                task: None,
            })
            .await?;

        let payload = result
            .structured_content
            .as_ref()
            .and_then(|value| value.get("payload"))
            .cloned()
            .expect("tool payload");
        assert_eq!(
            payload.get("status").and_then(Value::as_str),
            Some("timeout")
        );
        assert_eq!(
            payload
                .get("playedSession")
                .and_then(|value| value.get("gameId"))
                .and_then(Value::as_str),
            Some("xiangqi")
        );

        client.cancel().await?;
        cancellation.cancel();
        handle.abort();
        Ok(())
    }
}
