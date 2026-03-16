mod catalog;
mod decide;
mod types;

use anyhow::{Context, Result};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use restflow_core::AppCore;
use restflow_core::auth::{
    AuthManagerConfig, AuthProfileManager, Credential, CredentialSource, ProfileHealth,
    ProfileUpdate,
};
use restflow_storage::AuthProfileStorage;
use serde_json::{Value, json};
use std::net::SocketAddr;
use std::path::Path as FsPath;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

use crate::catalog::{auth_provider_id, parse_auth_provider, provider_capabilities};
use crate::decide::decide_turn;
use crate::types::{
    AuthProfileSummary, CreateAuthProfileInput, DecideTurnRequest, UpdateAuthProfileInput,
};

#[derive(Clone)]
struct BridgeState {
    auth_manager: Arc<AuthProfileManager>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,human_agent_playground_ai_bridge=debug")),
        )
        .init();

    let data_path = std::env::var("HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_DATA_PATH")
        .unwrap_or_else(|_| ".board-bridge-data/restflow.db".to_string());
    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(8795);

    if let Some(parent) = FsPath::new(&data_path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .context("Failed to create AI bridge data directory")?;
    }

    let core = Arc::new(
        AppCore::new(&data_path)
            .await
            .context("Failed to initialize AppCore")?,
    );
    let profile_storage = AuthProfileStorage::new(core.storage.get_db())?;
    let auth_manager = Arc::new(AuthProfileManager::with_storage(
        AuthManagerConfig::default(),
        Arc::new(core.storage.secrets.clone()),
        Some(profile_storage),
    ));
    auth_manager
        .initialize()
        .await
        .context("Failed to initialize auth profile manager")?;

    let state = BridgeState { auth_manager };
    let app = Router::new()
        .route("/health", get(handle_health))
        .route("/api/providers", get(handle_list_providers))
        .route(
            "/api/auth-profiles",
            get(handle_list_profiles).post(handle_create_profile),
        )
        .route(
            "/api/auth-profiles/{profile_id}",
            patch(handle_update_profile).delete(handle_delete_profile),
        )
        .route(
            "/api/auth-profiles/{profile_id}/test",
            post(handle_test_profile),
        )
        .route("/api/turns/decide", post(handle_decide_turn))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!(
        "Human Agent Playground AI bridge listening on http://{}",
        addr
    );
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn handle_health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn handle_list_providers() -> Json<Value> {
    Json(json!({ "providers": provider_capabilities() }))
}

async fn handle_list_profiles(
    State(state): State<BridgeState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let profiles = state
        .auth_manager
        .list_profiles()
        .await
        .into_iter()
        .map(|profile| {
            let masked_value = profile
                .get_api_key(state.auth_manager.resolver())
                .ok()
                .map(|value| mask_value(&value));

            AuthProfileSummary {
                id: profile.id,
                name: profile.name,
                provider: auth_provider_id(&profile.provider).to_string(),
                source: profile.source.to_string(),
                health: match profile.health {
                    ProfileHealth::Healthy => "healthy".to_string(),
                    ProfileHealth::Cooldown => "cooldown".to_string(),
                    ProfileHealth::Disabled => "disabled".to_string(),
                    ProfileHealth::Unknown => "unknown".to_string(),
                },
                enabled: profile.enabled,
                credential_type: match profile.credential {
                    restflow_core::auth::SecureCredential::ApiKey { .. } => "api_key".to_string(),
                    restflow_core::auth::SecureCredential::Token { .. } => "token".to_string(),
                    restflow_core::auth::SecureCredential::OAuth { .. } => "oauth".to_string(),
                },
                masked_value,
            }
        })
        .collect::<Vec<_>>();

    Ok(Json(json!({ "profiles": profiles })))
}

async fn handle_create_profile(
    State(state): State<BridgeState>,
    Json(input): Json<CreateAuthProfileInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let provider = parse_auth_provider(&input.provider)
        .ok_or_else(|| bad_request(format!("Unsupported auth provider: {}", input.provider)))?;
    let credential = match input.credential_type.as_str() {
        "api_key" => Credential::ApiKey {
            key: input.credential_value,
            email: input.email,
        },
        "token" => Credential::Token {
            token: input.credential_value,
            expires_at: None,
            email: input.email,
        },
        value => {
            return Err(bad_request(format!(
                "Unsupported credential type: {}",
                value
            )));
        }
    };

    let id = state
        .auth_manager
        .add_profile_from_credential(input.name, credential, CredentialSource::Manual, provider)
        .await
        .map_err(internal_error)?;
    Ok(Json(json!({ "id": id, "created": true })))
}

async fn handle_update_profile(
    Path(profile_id): Path<String>,
    State(state): State<BridgeState>,
    Json(input): Json<UpdateAuthProfileInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let updated = state
        .auth_manager
        .update_profile(
            &profile_id,
            ProfileUpdate {
                name: input.name,
                enabled: input.enabled,
                priority: input.priority,
            },
        )
        .await
        .map_err(internal_error)?;
    Ok(Json(json!({
        "id": updated.id,
        "name": updated.name,
        "enabled": updated.enabled,
        "priority": updated.priority
    })))
}

async fn handle_delete_profile(
    Path(profile_id): Path<String>,
    State(state): State<BridgeState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    state
        .auth_manager
        .remove_profile(&profile_id)
        .await
        .map_err(internal_error)?;
    Ok(Json(json!({ "deleted": true, "id": profile_id })))
}

async fn handle_test_profile(
    Path(profile_id): Path<String>,
    State(state): State<BridgeState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let profile = state
        .auth_manager
        .get_profile(&profile_id)
        .await
        .ok_or_else(|| bad_request(format!("Profile not found: {}", profile_id)))?;
    let available = profile.get_api_key(state.auth_manager.resolver()).is_ok();
    Ok(Json(json!({ "id": profile_id, "available": available })))
}

async fn handle_decide_turn(
    State(state): State<BridgeState>,
    Json(request): Json<DecideTurnRequest>,
) -> Json<Value> {
    Json(
        serde_json::to_value(decide_turn(state.auth_manager, request).await).unwrap_or_else(|_| {
            json!({
                "action": null,
                "reasoning": null,
                "usage": null,
                "model": null,
                "provider": null,
                "error": "Failed to serialize decision response"
            })
        }),
    )
}

fn mask_value(value: &str) -> String {
    if value.len() <= 8 {
        return "*".repeat(value.len());
    }

    format!(
        "{}...{}",
        &value[..4],
        &value[value.len().saturating_sub(4)..]
    )
}

fn bad_request(message: String) -> (StatusCode, Json<Value>) {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": message })))
}

fn internal_error(error: impl std::fmt::Display) -> (StatusCode, Json<Value>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": error.to_string() })),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_long_values() {
        assert_eq!(mask_value("abcd1234efgh5678"), "abcd...5678");
    }

    #[test]
    fn masks_short_values_fully() {
        assert_eq!(mask_value("secret"), "******");
    }
}
