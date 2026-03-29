use crate::ai::{
    DecideTurnRequest, DecideTurnResult, SeatConfigInput, build_auth_manager, create_auth_profile,
    decide_turn, delete_auth_profile, list_auth_profiles, list_provider_capabilities,
    test_auth_profile, update_auth_profile,
};
use crate::error::RuntimeError;
use anyhow::Result;
use hap_games::{get_game_adapter, list_game_catalog};
use hap_models::{
    AiLauncherId, AiRuntimeProviderId, AiRuntimeProviderSetting, AiRuntimeSettings, AiSeatConfig,
    AiSeatStatus, AuthProfileSummary, CreateAuthProfileInput, CreateSessionInput,
    DecisionExplanation, GameCatalogItem, GameSession, PersistedSessions, ProviderCapability,
    SessionActorKind, SessionChannel, SessionEvent, SessionEventKind, UpdateAiSeatInput,
    UpdateAiSeatLauncherInput, UpdateAiSeatLaunchersInput, UpdateAuthProfileInput, now_iso,
};
use restflow_core::auth::AuthProfileManager;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use tokio::fs::{create_dir_all, read_to_string, write};
use tokio::sync::{Mutex, RwLock, broadcast};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    pub session_data_path: PathBuf,
    pub auth_data_path: PathBuf,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            session_data_path: default_session_data_path(),
            auth_data_path: default_auth_data_path(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct WaitForTurnResult {
    pub status: String,
    pub session: GameSession,
    pub event: Option<SessionEvent>,
}

#[derive(Debug, Clone)]
pub struct PlayMoveAndWaitResult {
    pub status: String,
    pub session: GameSession,
    pub event: Option<SessionEvent>,
    pub played_session: GameSession,
    pub played_event: Option<SessionEvent>,
}

#[derive(Debug, Clone)]
pub struct AiRuntimeSettingsPayload {
    pub settings: AiRuntimeSettings,
    pub providers: Vec<ProviderCapability>,
    pub profiles: Vec<AuthProfileSummary>,
}

#[derive(Debug, Clone)]
struct RuntimeState {
    sessions: HashMap<String, GameSession>,
    ai_runtime_settings: AiRuntimeSettings,
}

#[derive(Debug, Clone)]
struct SessionActorContext {
    actor_kind: SessionActorKind,
    channel: SessionChannel,
    actor_name: Option<String>,
}

#[derive(Debug, Clone)]
struct ResolvedLauncherSeatConfig {
    launcher: AiLauncherId,
    model: String,
    provider_profile_id: Option<String>,
    prompt_override: Option<String>,
    timeout_ms: u64,
    auto_play: bool,
}

#[derive(Debug, Clone)]
struct AiSeatFailure {
    code: String,
    user_message: String,
    notice_summary: String,
    raw_response_preview: Option<String>,
}

#[derive(Debug, Clone)]
struct AiSeatRunToken {
    session_updated_at: String,
    last_event_id: Option<String>,
    seat_signature: String,
}

#[derive(Debug)]
struct AiSeatRuntimeError {
    failure: AiSeatFailure,
}

impl std::fmt::Display for AiSeatRuntimeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.failure.user_message)
    }
}

impl std::error::Error for AiSeatRuntimeError {}

impl From<RuntimeError> for AiSeatRuntimeError {
    fn from(value: RuntimeError) -> Self {
        Self {
            failure: AiSeatFailure {
                code: value
                    .code()
                    .unwrap_or("provider_request_failed")
                    .to_string(),
                user_message: value.message().to_string(),
                notice_summary: "the AI runtime request failed".to_string(),
                raw_response_preview: None,
            },
        }
    }
}

#[derive(Clone)]
pub struct HumanAgentPlaygroundRuntime {
    data_path: PathBuf,
    auth_manager: Arc<AuthProfileManager>,
    state: Arc<RwLock<RuntimeState>>,
    persist_lock: Arc<Mutex<()>>,
    streams: Arc<Mutex<HashMap<String, broadcast::Sender<GameSession>>>>,
    active_seat_runs: Arc<StdMutex<HashSet<String>>>,
}

impl HumanAgentPlaygroundRuntime {
    pub async fn new(config: RuntimeConfig) -> Result<Arc<Self>> {
        let auth_manager = build_auth_manager(&config.auth_data_path).await?;
        let runtime = Arc::new(Self {
            data_path: config.session_data_path,
            auth_manager,
            state: Arc::new(RwLock::new(RuntimeState {
                sessions: HashMap::new(),
                ai_runtime_settings: build_default_ai_runtime_settings(),
            })),
            persist_lock: Arc::new(Mutex::new(())),
            streams: Arc::new(Mutex::new(HashMap::new())),
            active_seat_runs: Arc::new(StdMutex::new(HashSet::new())),
        });
        runtime.load_from_disk().await?;
        Ok(runtime)
    }

    pub async fn list_sessions(&self) -> Result<Vec<GameSession>, RuntimeError> {
        let mut sessions = {
            let state = self.state.read().await;
            state.sessions.values().cloned().collect::<Vec<_>>()
        };
        sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        Ok(sessions)
    }

    pub fn list_games(&self) -> Vec<GameCatalogItem> {
        list_game_catalog()
    }

    pub async fn create_session(
        self: &Arc<Self>,
        input: CreateSessionInput,
    ) -> Result<GameSession, RuntimeError> {
        let adapter = get_game_adapter(&input.game_id)
            .map_err(|error| RuntimeError::not_found(error.to_string()))?;
        let initial_state = adapter
            .create_initial_state()
            .map_err(RuntimeError::internal)?;
        let timestamp = now_iso();
        let actor = resolve_actor_context_from_create(
            &input,
            SessionActorContext {
                actor_kind: SessionActorKind::System,
                channel: SessionChannel::System,
                actor_name: None,
            },
        );

        let valid_sides = adapter.game().sides.iter().cloned().collect::<HashSet<_>>();
        let configured_launchers = input.seat_launchers.unwrap_or_default();
        for side in configured_launchers.keys() {
            if !valid_sides.contains(side) {
                return Err(
                    RuntimeError::bad_request(format!("Unsupported seat side: {side}"))
                        .with_code("invalid_side")
                        .with_detail("side", side.clone()),
                );
            }
        }

        let mut ai_seats = build_default_ai_seats(&adapter.game().sides);
        for side in &adapter.game().sides {
            let Some(seat_input) = configured_launchers.get(side) else {
                continue;
            };
            if seat_input.launcher == AiLauncherId::Human {
                continue;
            }

            let resolved = self
                .resolve_launcher_seat_config(UpdateAiSeatLauncherInput {
                    launcher: seat_input.launcher,
                    model: seat_input.model.clone(),
                    auto_play: seat_input.auto_play,
                    advanced: None,
                })
                .await?;

            ai_seats.insert(
                side.clone(),
                AiSeatConfig {
                    side: side.clone(),
                    launcher: resolved.launcher,
                    enabled: true,
                    auto_play: resolved.auto_play,
                    provider_profile_id: resolved.provider_profile_id,
                    model: Some(resolved.model),
                    prompt_override: resolved.prompt_override,
                    timeout_ms: resolved.timeout_ms,
                    last_error: None,
                    runtime_source: Some("restflow-bridge".to_string()),
                    status: AiSeatStatus::Idle,
                },
            );
        }

        let mut session = GameSession {
            id: Uuid::new_v4().to_string(),
            game_id: input.game_id,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
            state: initial_state,
            ai_seats: Some(HashMap::new()),
            events: vec![create_session_event(
                &timestamp,
                &actor,
                &adapter.game().id,
                &adapter.game().short_name,
            )],
        };
        let turn = read_session_turn(&session.state);
        let status = read_session_status(&session.state);
        session.ai_seats = Some(reconcile_ai_seats(
            ai_seats,
            turn.as_deref(),
            status.as_deref(),
        ));

        {
            let mut state = self.state.write().await;
            state.sessions.insert(session.id.clone(), session.clone());
        }
        self.persist().await.map_err(RuntimeError::internal)?;
        self.emit_session_update(&session).await;
        Arc::clone(self).queue_ai_seat_turn(session.clone());
        Ok(session)
    }

    pub async fn get_session(&self, session_id: &str) -> Result<GameSession, RuntimeError> {
        let state = self.state.read().await;
        state
            .sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| RuntimeError::not_found(format!("Session not found: {session_id}")))
    }

    pub async fn get_legal_moves(
        &self,
        session_id: &str,
        query: Option<Value>,
    ) -> Result<Vec<Value>, RuntimeError> {
        let session = self.get_session(session_id).await?;
        let adapter = get_game_adapter(&session.game_id)
            .map_err(|error| RuntimeError::not_found(error.to_string()))?;
        adapter
            .list_legal_moves(&session.state, query.as_ref())
            .map_err(RuntimeError::internal)
    }

    pub async fn play_move(
        self: &Arc<Self>,
        session_id: &str,
        input: Value,
    ) -> Result<GameSession, RuntimeError> {
        let actor = resolve_actor_context(
            &input,
            SessionActorContext {
                actor_kind: SessionActorKind::Unknown,
                channel: SessionChannel::Http,
                actor_name: None,
            },
        );
        let reasoning = parse_decision_explanation(&input)?;
        validate_agent_move_explanation(&actor, reasoning.as_ref())?;
        let updated = self
            .update_latest_session(session_id, |latest| {
                let adapter = get_game_adapter(&latest.game_id)
                    .map_err(|error| RuntimeError::not_found(error.to_string()))?;
                let next_state = adapter
                    .play_move(&latest.state, &input)
                    .map_err(|error| RuntimeError::bad_request(error.to_string()))?;
                let move_details = merge_detail_maps(
                    &parse_move_event_details(&next_state),
                    &parse_ai_runtime_event_details(&input),
                );
                let timestamp = now_iso();
                let turn = read_session_turn(&next_state);
                let status = read_session_status(&next_state);
                let current_ai_seats =
                    normalize_ai_seats(&adapter.game().sides, latest.ai_seats.as_ref());

                Ok(GameSession {
                    id: latest.id.clone(),
                    game_id: latest.game_id.clone(),
                    created_at: latest.created_at.clone(),
                    updated_at: timestamp.clone(),
                    state: next_state,
                    ai_seats: Some(reconcile_ai_seats(
                        current_ai_seats,
                        turn.as_deref(),
                        status.as_deref(),
                    )),
                    events: {
                        let mut events = latest.events.clone();
                        events.push(create_move_played_event(
                            &timestamp,
                            &actor,
                            reasoning.as_ref(),
                            move_details,
                        ));
                        events
                    },
                })
            })
            .await?;
        Arc::clone(self).queue_ai_seat_turn(updated.clone());
        Ok(updated)
    }

    pub async fn reset_session(
        self: &Arc<Self>,
        session_id: &str,
        input: Value,
    ) -> Result<GameSession, RuntimeError> {
        let actor = resolve_actor_context(
            &input,
            SessionActorContext {
                actor_kind: SessionActorKind::Unknown,
                channel: SessionChannel::Http,
                actor_name: None,
            },
        );
        let updated = self
            .update_latest_session(session_id, |latest| {
                let adapter = get_game_adapter(&latest.game_id)
                    .map_err(|error| RuntimeError::not_found(error.to_string()))?;
                let timestamp = now_iso();
                let state = adapter
                    .create_initial_state()
                    .map_err(RuntimeError::internal)?;
                let turn = read_session_turn(&state);
                let status = read_session_status(&state);

                Ok(GameSession {
                    id: latest.id.clone(),
                    game_id: latest.game_id.clone(),
                    created_at: latest.created_at.clone(),
                    updated_at: timestamp.clone(),
                    state,
                    ai_seats: Some(reconcile_ai_seats(
                        normalize_ai_seats(&adapter.game().sides, latest.ai_seats.as_ref()),
                        turn.as_deref(),
                        status.as_deref(),
                    )),
                    events: {
                        let mut events = latest.events.clone();
                        events.push(create_session_reset_event(
                            &timestamp,
                            &actor,
                            &adapter.game().short_name,
                        ));
                        events
                    },
                })
            })
            .await?;
        Arc::clone(self).queue_ai_seat_turn(updated.clone());
        Ok(updated)
    }

    pub async fn subscribe_session(
        &self,
        session_id: &str,
    ) -> Result<(GameSession, broadcast::Receiver<GameSession>), RuntimeError> {
        let session = self.get_session(session_id).await?;
        let receiver = {
            let mut streams = self.streams.lock().await;
            streams
                .entry(session_id.to_string())
                .or_insert_with(|| {
                    let (sender, _receiver) = broadcast::channel(128);
                    sender
                })
                .subscribe()
        };
        Ok((session, receiver))
    }

    pub async fn wait_for_turn(
        &self,
        session_id: &str,
        expected_turn: &str,
        after_event_id: Option<&str>,
        timeout_ms: Option<u64>,
    ) -> Result<WaitForTurnResult, RuntimeError> {
        let timeout_ms = timeout_ms.unwrap_or(60_000);
        let mut latest_session = self.get_session(session_id).await?;
        if let Some(result) =
            resolve_wait_for_turn_result(latest_session.clone(), expected_turn, after_event_id)
        {
            return Ok(result);
        }

        let (_initial, mut receiver) = self.subscribe_session(session_id).await?;
        let timeout = tokio::time::sleep(std::time::Duration::from_millis(timeout_ms));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                _ = &mut timeout => {
                    return Ok(WaitForTurnResult {
                        status: "timeout".to_string(),
                        event: get_latest_session_event(&latest_session),
                        session: latest_session,
                    });
                }
                next = receiver.recv() => {
                    match next {
                        Ok(session) => {
                            latest_session = session.clone();
                            if let Some(result) = resolve_wait_for_turn_result(session, expected_turn, after_event_id) {
                                return Ok(result);
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => {
                            return Ok(WaitForTurnResult {
                                status: "timeout".to_string(),
                                event: get_latest_session_event(&latest_session),
                                session: latest_session,
                            });
                        }
                    }
                }
            }
        }
    }

    pub async fn play_move_and_wait(
        self: &Arc<Self>,
        session_id: &str,
        input: Value,
        timeout_ms: Option<u64>,
    ) -> Result<PlayMoveAndWaitResult, RuntimeError> {
        let played_session = self.play_move(session_id, input).await?;
        let played_event = get_latest_session_event(&played_session);
        let played_status = read_session_status(&played_session.state);
        let mover_side = read_last_move_side(&played_session.state);

        if played_status.as_deref() == Some("finished") {
            return Ok(PlayMoveAndWaitResult {
                status: "finished".to_string(),
                session: played_session.clone(),
                event: played_event.clone(),
                played_session,
                played_event,
            });
        }

        let mover_side = mover_side.ok_or_else(|| {
            RuntimeError::bad_request("Unable to determine the side that just moved")
        })?;

        let wait_result = self
            .wait_for_turn(
                session_id,
                &mover_side,
                played_event.as_ref().map(|event| event.id.as_str()),
                timeout_ms,
            )
            .await?;

        Ok(PlayMoveAndWaitResult {
            status: wait_result.status,
            session: wait_result.session,
            event: wait_result.event,
            played_session,
            played_event,
        })
    }

    pub async fn list_provider_capabilities(
        &self,
    ) -> Result<Vec<ProviderCapability>, RuntimeError> {
        Ok(list_provider_capabilities())
    }

    pub async fn list_auth_profiles(&self) -> Result<Vec<AuthProfileSummary>, RuntimeError> {
        Ok(list_auth_profiles(self.auth_manager.clone()).await)
    }

    pub async fn create_auth_profile(
        &self,
        input: CreateAuthProfileInput,
    ) -> Result<(String, bool), RuntimeError> {
        create_auth_profile(self.auth_manager.clone(), input).await
    }

    pub async fn update_auth_profile(
        &self,
        profile_id: &str,
        input: UpdateAuthProfileInput,
    ) -> Result<(String, String, bool, i32), RuntimeError> {
        update_auth_profile(self.auth_manager.clone(), profile_id, input).await
    }

    pub async fn delete_auth_profile(
        &self,
        profile_id: &str,
    ) -> Result<(bool, String), RuntimeError> {
        delete_auth_profile(self.auth_manager.clone(), profile_id).await
    }

    pub async fn test_auth_profile(
        &self,
        profile_id: &str,
    ) -> Result<(String, bool), RuntimeError> {
        test_auth_profile(self.auth_manager.clone(), profile_id).await
    }

    pub async fn get_ai_runtime_settings(&self) -> Result<AiRuntimeSettingsPayload, RuntimeError> {
        let settings = {
            let state = self.state.read().await;
            normalize_ai_runtime_settings(Some(state.ai_runtime_settings.clone()))
        };
        let providers = list_provider_capabilities();
        let profiles = list_auth_profiles(self.auth_manager.clone()).await;
        Ok(AiRuntimeSettingsPayload {
            settings,
            providers,
            profiles,
        })
    }

    pub async fn update_ai_runtime_settings(
        &self,
        settings: AiRuntimeSettings,
    ) -> Result<AiRuntimeSettings, RuntimeError> {
        let normalized = normalize_ai_runtime_settings(Some(settings));
        {
            let mut state = self.state.write().await;
            state.ai_runtime_settings = normalized.clone();
        }
        self.persist().await.map_err(RuntimeError::internal)?;
        Ok(normalized)
    }

    pub async fn get_ai_seats(
        &self,
        session_id: &str,
    ) -> Result<HashMap<String, AiSeatConfig>, RuntimeError> {
        let session = self.get_session(session_id).await?;
        let adapter = get_game_adapter(&session.game_id)
            .map_err(|error| RuntimeError::not_found(error.to_string()))?;
        Ok(normalize_ai_seats(
            &adapter.game().sides,
            session.ai_seats.as_ref(),
        ))
    }

    pub async fn update_ai_seat(
        self: &Arc<Self>,
        session_id: &str,
        side: &str,
        input: UpdateAiSeatInput,
    ) -> Result<GameSession, RuntimeError> {
        let session = self.get_session(session_id).await?;
        let adapter = get_game_adapter(&session.game_id)
            .map_err(|error| RuntimeError::not_found(error.to_string()))?;
        if !adapter
            .game()
            .sides
            .iter()
            .any(|candidate| candidate == side)
        {
            return Err(RuntimeError::bad_request(format!(
                "Unsupported seat side: {side}"
            )));
        }

        let updated = self
            .update_latest_session(session_id, |latest| {
                let adapter = get_game_adapter(&latest.game_id)
                    .map_err(|error| RuntimeError::not_found(error.to_string()))?;
                let mut current_seats =
                    normalize_ai_seats(&adapter.game().sides, latest.ai_seats.as_ref());
                let seat = current_seats
                    .get(side)
                    .cloned()
                    .unwrap_or_else(|| AiSeatConfig {
                        side: side.to_string(),
                        ..AiSeatConfig::default()
                    });
                let merged = AiSeatConfig {
                    side: side.to_string(),
                    launcher: input.launcher.unwrap_or(seat.launcher),
                    enabled: input.enabled.unwrap_or(seat.enabled),
                    auto_play: input.auto_play.unwrap_or(seat.auto_play),
                    provider_profile_id: input
                        .provider_profile_id
                        .clone()
                        .or(seat.provider_profile_id),
                    model: input.model.clone().or(seat.model),
                    prompt_override: input.prompt_override.clone().or(seat.prompt_override),
                    timeout_ms: input.timeout_ms.unwrap_or(seat.timeout_ms),
                    status: seat.status,
                    last_error: seat.last_error,
                    runtime_source: seat.runtime_source,
                };
                if merged.enabled && merged.model.as_deref().unwrap_or_default().is_empty() {
                    return Err(RuntimeError::bad_request(
                        "Enabled AI seats must select a model",
                    ));
                }

                current_seats.insert(side.to_string(), merged);
                let turn = read_session_turn(&latest.state);
                let status = read_session_status(&latest.state);
                Ok(GameSession {
                    id: latest.id.clone(),
                    game_id: latest.game_id.clone(),
                    created_at: latest.created_at.clone(),
                    updated_at: now_iso(),
                    state: latest.state.clone(),
                    events: latest.events.clone(),
                    ai_seats: Some(reconcile_ai_seats(
                        current_seats,
                        turn.as_deref(),
                        status.as_deref(),
                    )),
                })
            })
            .await?;
        Arc::clone(self).queue_ai_seat_turn(updated.clone());
        Ok(updated)
    }

    pub async fn update_ai_seat_launcher(
        self: &Arc<Self>,
        session_id: &str,
        side: &str,
        input: UpdateAiSeatLauncherInput,
    ) -> Result<GameSession, RuntimeError> {
        self.update_ai_seat_launchers(
            session_id,
            UpdateAiSeatLaunchersInput {
                seats: HashMap::from([(side.to_string(), input)]),
            },
        )
        .await
    }

    pub async fn update_ai_seat_launchers(
        self: &Arc<Self>,
        session_id: &str,
        input: UpdateAiSeatLaunchersInput,
    ) -> Result<GameSession, RuntimeError> {
        let session = self.get_session(session_id).await?;
        let adapter = get_game_adapter(&session.game_id)
            .map_err(|error| RuntimeError::not_found(error.to_string()))?;
        let mut resolved_updates = HashMap::new();
        for (side, seat_input) in input.seats {
            if !adapter.game().sides.iter().any(|candidate| candidate == &side) {
                return Err(
                    RuntimeError::bad_request(format!("Unsupported seat side: {side}"))
                        .with_code("invalid_side")
                        .with_detail("side", side),
                );
            }

            let seat = if seat_input.launcher == AiLauncherId::Human {
                AiSeatConfig {
                    side: side.clone(),
                    launcher: AiLauncherId::Human,
                    enabled: false,
                    auto_play: false,
                    provider_profile_id: None,
                    model: None,
                    prompt_override: None,
                    timeout_ms: 60_000,
                    status: AiSeatStatus::Idle,
                    last_error: None,
                    runtime_source: None,
                }
            } else {
                let resolved = self.resolve_launcher_seat_config(seat_input).await?;
                AiSeatConfig {
                    side: side.clone(),
                    launcher: resolved.launcher,
                    enabled: true,
                    auto_play: resolved.auto_play,
                    provider_profile_id: resolved.provider_profile_id,
                    model: Some(resolved.model),
                    prompt_override: resolved.prompt_override,
                    timeout_ms: resolved.timeout_ms,
                    status: AiSeatStatus::Idle,
                    last_error: None,
                    runtime_source: Some("restflow-bridge".to_string()),
                }
            };
            resolved_updates.insert(side, seat);
        }

        let updated = self
            .update_latest_session(session_id, |latest| {
                let adapter = get_game_adapter(&latest.game_id)
                    .map_err(|error| RuntimeError::not_found(error.to_string()))?;
                let mut current_seats =
                    normalize_ai_seats(&adapter.game().sides, latest.ai_seats.as_ref());

                for (side, seat) in &resolved_updates {
                    current_seats.insert(side.clone(), seat.clone());
                }

                let turn = read_session_turn(&latest.state);
                let status = read_session_status(&latest.state);
                Ok(GameSession {
                    id: latest.id.clone(),
                    game_id: latest.game_id.clone(),
                    created_at: latest.created_at.clone(),
                    updated_at: now_iso(),
                    state: latest.state.clone(),
                    events: latest.events.clone(),
                    ai_seats: Some(reconcile_ai_seats(
                        current_seats,
                        turn.as_deref(),
                        status.as_deref(),
                    )),
                })
            })
            .await?;
        Arc::clone(self).queue_ai_seat_turn(updated.clone());
        Ok(updated)
    }

    async fn load_from_disk(&self) -> Result<()> {
        let raw = match read_to_string(&self.data_path).await {
            Ok(raw) => raw,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.into()),
        };

        let root: Value = serde_json::from_str(&raw)?;
        let settings = root
            .get("aiRuntimeSettings")
            .cloned()
            .or_else(|| root.get("ai_runtime_settings").cloned());
        let sessions = root
            .get("sessions")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        let normalized_settings = normalize_ai_runtime_settings(
            settings.and_then(|value| serde_json::from_value::<AiRuntimeSettings>(value).ok()),
        );
        let mut normalized_sessions = HashMap::new();
        for raw_session in sessions {
            let session = self.normalize_session(raw_session)?;
            normalized_sessions.insert(session.id.clone(), session);
        }

        let mut state = self.state.write().await;
        state.ai_runtime_settings = normalized_settings;
        state.sessions = normalized_sessions;
        Ok(())
    }

    fn normalize_session(&self, raw: Value) -> Result<GameSession> {
        let object = raw
            .as_object()
            .ok_or_else(|| anyhow::anyhow!("Session payload must be an object"))?;
        let game_id = object
            .get("gameId")
            .and_then(Value::as_str)
            .or_else(|| object.get("game").and_then(Value::as_str))
            .unwrap_or("xiangqi")
            .to_string();
        let adapter = get_game_adapter(&game_id)?;
        let created_at = object
            .get("createdAt")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(now_iso);
        let updated_at = object
            .get("updatedAt")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(now_iso);
        let state = match object.get("state").cloned() {
            Some(state) => adapter.normalize_state(state)?,
            None => adapter.create_initial_state()?,
        };
        let events = object
            .get("events")
            .and_then(Value::as_array)
            .map(|events| {
                events
                    .iter()
                    .filter_map(|event| serde_json::from_value::<SessionEvent>(event.clone()).ok())
                    .collect::<Vec<_>>()
            })
            .filter(|events| !events.is_empty())
            .unwrap_or_else(|| {
                vec![create_session_event(
                    &created_at,
                    &SessionActorContext {
                        actor_kind: SessionActorKind::System,
                        channel: SessionChannel::System,
                        actor_name: None,
                    },
                    &game_id,
                    &adapter.game().short_name,
                )]
            });

        let raw_ai_seats = object
            .get("aiSeats")
            .or_else(|| object.get("ai_seats"))
            .cloned()
            .and_then(|value| serde_json::from_value::<HashMap<String, AiSeatConfig>>(value).ok());

        Ok(GameSession {
            id: object
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            game_id,
            created_at,
            updated_at,
            state: state.clone(),
            ai_seats: Some(reconcile_ai_seats(
                normalize_ai_seats(&adapter.game().sides, raw_ai_seats.as_ref()),
                read_session_turn(&state).as_deref(),
                read_session_status(&state).as_deref(),
            )),
            events,
        })
    }

    async fn persist(&self) -> Result<()> {
        let _guard = self.persist_lock.lock().await;
        let payload = {
            let state = self.state.read().await;
            PersistedSessions {
                sessions: state.sessions.values().cloned().collect(),
                ai_runtime_settings: Some(state.ai_runtime_settings.clone()),
            }
        };

        if let Some(parent) = self.data_path.parent() {
            create_dir_all(parent).await?;
        }
        let body = serde_json::to_string_pretty(&payload)?;
        write(&self.data_path, body).await?;
        Ok(())
    }

    async fn emit_session_update(&self, session: &GameSession) {
        let sender = {
            let mut streams = self.streams.lock().await;
            streams
                .entry(session.id.clone())
                .or_insert_with(|| {
                    let (sender, _receiver) = broadcast::channel(128);
                    sender
                })
                .clone()
        };
        let _ = sender.send(session.clone());
    }

    fn queue_ai_seat_turn(self: Arc<Self>, session: GameSession) {
        let turn = read_session_turn(&session.state);
        let status = read_session_status(&session.state);
        let Some(turn) = turn else {
            return;
        };
        if status.as_deref() == Some("finished") {
            return;
        }
        let seat = session
            .ai_seats
            .as_ref()
            .and_then(|ai_seats| ai_seats.get(&turn))
            .cloned();
        let Some(seat) = seat else {
            return;
        };
        if !seat.enabled || !seat.auto_play || seat.status == AiSeatStatus::Errored {
            return;
        }

        let run_key = format!("{}:{turn}", session.id);
        {
            let mut active = self
                .active_seat_runs
                .lock()
                .expect("active seat runs lock poisoned");
            if active.contains(&run_key) {
                return;
            }
            active.insert(run_key.clone());
        }

        let this = Arc::clone(&self);
        let session_id = session.id.clone();
        tokio::spawn(async move {
            let _ = Arc::clone(&this).run_ai_seat_turn(&session_id, &turn).await;
            {
                let mut active = this
                    .active_seat_runs
                    .lock()
                    .expect("active seat runs lock poisoned");
                active.remove(&run_key);
            }
            if let Ok(latest) = this.get_session(&session_id).await {
                this.queue_ai_seat_turn(latest);
            }
        });
    }

    async fn run_ai_seat_turn(
        self: &Arc<Self>,
        session_id: &str,
        side: &str,
    ) -> Result<(), RuntimeError> {
        let session = self.get_session(session_id).await?;
        let adapter = get_game_adapter(&session.game_id)
            .map_err(|error| RuntimeError::not_found(error.to_string()))?;
        let ai_seats = normalize_ai_seats(&adapter.game().sides, session.ai_seats.as_ref());
        let Some(seat) = ai_seats.get(side).cloned() else {
            return Ok(());
        };
        if !seat.enabled || !seat.auto_play || seat.status == AiSeatStatus::Errored {
            return Ok(());
        }

        let thinking_session = self
            .persist_seat_status(
                session_id,
                side,
                AiSeatStatus::Thinking,
                None,
                Some("restflow-bridge".to_string()),
            )
            .await?;
        let run_token = create_ai_seat_run_token(&thinking_session, side);

        let result = async {
            let legal_moves = self.get_legal_moves(session_id, None).await?;
            let decision = decide_turn(
                self.auth_manager.clone(),
                DecideTurnRequest {
                    game_id: thinking_session.game_id.clone(),
                    session_id: thinking_session.id.clone(),
                    seat_side: side.to_string(),
                    state: thinking_session.state.clone(),
                    legal_moves: Value::Array(legal_moves.clone()),
                    recent_events: serde_json::to_value(
                        thinking_session
                            .events
                            .iter()
                            .rev()
                            .take(12)
                            .cloned()
                            .collect::<Vec<_>>()
                            .into_iter()
                            .rev()
                            .collect::<Vec<_>>(),
                    )
                    .unwrap_or_else(|_| Value::Array(Vec::new())),
                    seat_config: SeatConfigInput {
                        provider_profile_id: seat.provider_profile_id.clone(),
                        provider: map_launcher_to_decision_provider(seat.launcher)
                            .map(str::to_string),
                        model: seat.model.clone().unwrap_or_default(),
                        prompt_override: seat.prompt_override.clone(),
                        timeout_ms: Some(seat.timeout_ms),
                    },
                },
            )
            .await;

            if decision.error.is_some() {
                return Err(AiSeatRuntimeError {
                    failure: map_bridge_decision_failure(&decision),
                });
            }

            let action = decision.action.clone().ok_or_else(|| AiSeatRuntimeError {
                failure: AiSeatFailure {
                    code: "decision_missing_action".to_string(),
                    user_message: "The AI response did not include a move.".to_string(),
                    notice_summary: "the model response did not include an action".to_string(),
                    raw_response_preview: None,
                },
            })?;

            if !includes_legal_action(&legal_moves, &action) {
                return Err(AiSeatRuntimeError {
                    failure: AiSeatFailure {
                        code: "decision_illegal_action".to_string(),
                        user_message: "The AI proposed a move that is not legal in this position."
                            .to_string(),
                        notice_summary: "the model proposed an illegal action".to_string(),
                        raw_response_preview: None,
                    },
                });
            }

            let latest_before_move = self.get_session(session_id).await?;
            if !is_ai_seat_run_current(&latest_before_move, side, &run_token) {
                return Ok(());
            }

            let input = build_ai_runtime_move_input(&action, &decision, side);
            let _played = self.play_move(session_id, input).await?;
            let next_session = self.get_session(session_id).await?;
            if read_session_status(&next_session.state).as_deref() == Some("finished") {
                let _ = self
                    .persist_seat_status(
                        session_id,
                        side,
                        AiSeatStatus::Idle,
                        None,
                        Some("restflow-bridge".to_string()),
                    )
                    .await?;
                return Ok(());
            }

            let next_status = if read_session_turn(&next_session.state).as_deref() == Some(side) {
                AiSeatStatus::Waiting
            } else {
                AiSeatStatus::Idle
            };
            let _ = self
                .persist_seat_status(
                    session_id,
                    side,
                    next_status,
                    None,
                    Some("restflow-bridge".to_string()),
                )
                .await?;
            Ok(())
        }
        .await;

        if let Err(error) = result {
            let latest = self.get_session(session_id).await?;
            if !is_ai_seat_run_current(&latest, side, &run_token) {
                return Ok(());
            }
            self.persist_seat_error(session_id, side, normalize_ai_seat_failure(&error))
                .await?;
        }

        Ok(())
    }

    async fn persist_seat_status(
        &self,
        session_id: &str,
        side: &str,
        status: AiSeatStatus,
        last_error: Option<String>,
        runtime_source: Option<String>,
    ) -> Result<GameSession, RuntimeError> {
        self.update_latest_session(session_id, |latest| {
            let adapter = get_game_adapter(&latest.game_id)
                .map_err(|error| RuntimeError::not_found(error.to_string()))?;
            let mut ai_seats = normalize_ai_seats(&adapter.game().sides, latest.ai_seats.as_ref());
            let Some(seat) = ai_seats.get(side).cloned() else {
                return Ok(latest.clone());
            };
            ai_seats.insert(
                side.to_string(),
                AiSeatConfig {
                    status,
                    last_error: last_error.clone(),
                    runtime_source: runtime_source.clone(),
                    ..seat
                },
            );
            Ok(GameSession {
                id: latest.id.clone(),
                game_id: latest.game_id.clone(),
                created_at: latest.created_at.clone(),
                updated_at: now_iso(),
                state: latest.state.clone(),
                events: latest.events.clone(),
                ai_seats: Some(ai_seats),
            })
        })
        .await
    }

    async fn persist_seat_error(
        &self,
        session_id: &str,
        side: &str,
        failure: AiSeatFailure,
    ) -> Result<GameSession, RuntimeError> {
        self.update_latest_session(session_id, |latest| {
            let adapter = get_game_adapter(&latest.game_id)
                .map_err(|error| RuntimeError::not_found(error.to_string()))?;
            let mut ai_seats = normalize_ai_seats(&adapter.game().sides, latest.ai_seats.as_ref());
            let Some(seat) = ai_seats.get(side).cloned() else {
                return Ok(latest.clone());
            };
            let timestamp = now_iso();
            let summary = format!("AI seat {side} stopped: {}", failure.notice_summary);
            let last_event = latest.events.last();
            let should_append_notice = !matches!(
                (seat.status, seat.last_error.as_deref(), last_event),
                (
                    AiSeatStatus::Errored,
                    Some(existing_error),
                    Some(SessionEvent {
                        kind: SessionEventKind::SystemNotice,
                        summary: existing_summary,
                        ..
                    }),
                ) if existing_error == failure.user_message && existing_summary == &summary
            );

            ai_seats.insert(
                side.to_string(),
                AiSeatConfig {
                    status: AiSeatStatus::Errored,
                    last_error: Some(failure.user_message.clone()),
                    runtime_source: Some("restflow-bridge".to_string()),
                    ..seat
                },
            );

            let mut events = latest.events.clone();
            if should_append_notice {
                events.push(create_system_notice_event(
                    &timestamp,
                    &summary,
                    map_from_pairs([
                        ("side", Value::String(side.to_string())),
                        (
                            "runtimeSource",
                            Value::String("restflow-bridge".to_string()),
                        ),
                        ("error", Value::String(failure.user_message.clone())),
                        ("errorCode", Value::String(failure.code.clone())),
                        (
                            "rawResponsePreview",
                            failure
                                .raw_response_preview
                                .clone()
                                .map(Value::String)
                                .unwrap_or(Value::Null),
                        ),
                    ]),
                ));
            }

            Ok(GameSession {
                id: latest.id.clone(),
                game_id: latest.game_id.clone(),
                created_at: latest.created_at.clone(),
                updated_at: timestamp,
                state: latest.state.clone(),
                events,
                ai_seats: Some(ai_seats),
            })
        })
        .await
    }

    async fn update_latest_session<F>(
        &self,
        session_id: &str,
        updater: F,
    ) -> Result<GameSession, RuntimeError>
    where
        F: Fn(&GameSession) -> Result<GameSession, RuntimeError>,
    {
        let updated = {
            let mut state = self.state.write().await;
            let latest = state.sessions.get(session_id).cloned().ok_or_else(|| {
                RuntimeError::not_found(format!("Session not found: {session_id}"))
            })?;
            let updated = updater(&latest)?;
            state
                .sessions
                .insert(session_id.to_string(), updated.clone());
            updated
        };
        self.persist().await.map_err(RuntimeError::internal)?;
        self.emit_session_update(&updated).await;
        Ok(updated)
    }

    async fn resolve_launcher_seat_config(
        &self,
        input: UpdateAiSeatLauncherInput,
    ) -> Result<ResolvedLauncherSeatConfig, RuntimeError> {
        let providers = list_provider_capabilities();
        let profiles = list_auth_profiles(self.auth_manager.clone()).await;
        let settings = {
            let state = self.state.read().await;
            normalize_ai_runtime_settings(Some(state.ai_runtime_settings.clone()))
        };
        let setting = settings
            .providers
            .iter()
            .find(|candidate| {
                candidate.provider_id == runtime_provider_id_for_launcher(input.launcher)
            })
            .cloned();
        let timeout_ms = input
            .advanced
            .as_ref()
            .and_then(|advanced| advanced.timeout_ms)
            .unwrap_or(60_000);
        let auto_play = input.auto_play.unwrap_or(true);

        let resolve_model =
            |provider_ids: &[&str]| -> Result<(String, Option<ProviderCapability>), RuntimeError> {
                let matching_providers = providers
                    .iter()
                    .filter(|candidate| provider_ids.iter().any(|id| *id == candidate.id))
                    .cloned()
                    .collect::<Vec<_>>();
                let allowed_models = matching_providers
                    .iter()
                    .flat_map(|candidate| candidate.models.iter().cloned())
                    .collect::<Vec<_>>();
                let requested_model = input
                    .model
                    .clone()
                    .or_else(|| {
                        setting
                            .as_ref()
                            .and_then(|value| value.default_model.clone())
                    })
                    .or_else(|| allowed_models.first().map(|model| model.id.clone()));

                let Some(requested_model) = requested_model else {
                    return Err(RuntimeError::bad_request(format!(
                        "No model is configured for launcher {:?}",
                        input.launcher
                    ))
                    .with_code("config_missing"));
                };

                let selected_model = allowed_models
                    .iter()
                    .find(|candidate| candidate.id == requested_model)
                    .cloned()
                    .ok_or_else(|| {
                        RuntimeError::bad_request(format!(
                            "Model {requested_model} is not available for launcher {:?}",
                            input.launcher
                        ))
                        .with_code("config_missing")
                        .with_detail("model", requested_model.clone())
                    })?;

                Ok((
                    selected_model.id.clone(),
                    matching_providers
                        .iter()
                        .find(|candidate| candidate.id == selected_model.provider)
                        .cloned(),
                ))
            };

        match input.launcher {
            AiLauncherId::Openai | AiLauncherId::Anthropic => {
                let launcher_id = match input.launcher {
                    AiLauncherId::Openai => "openai",
                    AiLauncherId::Anthropic => "anthropic",
                    _ => unreachable!(),
                };
                let (model, provider) = resolve_model(&[launcher_id])?;
                let profile_id = input
                    .advanced
                    .as_ref()
                    .and_then(|advanced| advanced.provider_profile_id.clone())
                    .or_else(|| {
                        setting
                            .as_ref()
                            .and_then(|value| value.default_profile_id.clone())
                    });

                let Some(profile_id) = profile_id else {
                    return Err(RuntimeError::bad_request(format!(
                        "{launcher_id} is not configured yet"
                    ))
                    .with_code("config_missing")
                    .with_detail("launcher", launcher_id));
                };

                let profile = profiles.iter().find(|candidate| candidate.id == profile_id);
                if !matches!(profile, Some(profile) if profile.enabled && profile.health != "disabled")
                {
                    return Err(RuntimeError::bad_request(format!(
                        "{launcher_id} profile is unavailable"
                    ))
                    .with_code("test_failed")
                    .with_detail("launcher", launcher_id)
                    .with_detail("profileId", profile_id));
                }

                if !provider.as_ref().is_some_and(|provider| provider.available) {
                    return Err(RuntimeError::bad_request(format!(
                        "{launcher_id} provider is unavailable"
                    ))
                    .with_code("test_failed")
                    .with_detail("launcher", launcher_id));
                }

                Ok(ResolvedLauncherSeatConfig {
                    launcher: input.launcher,
                    model,
                    provider_profile_id: Some(profile_id),
                    prompt_override: input.advanced.and_then(|advanced| advanced.prompt_override),
                    timeout_ms,
                    auto_play,
                })
            }
            AiLauncherId::Codex => {
                let (model, provider) = resolve_model(&["codex-cli"])?;
                if !provider.as_ref().is_some_and(|provider| provider.available) {
                    return Err(RuntimeError::bad_request(
                        "Codex CLI is unavailable on this machine",
                    )
                    .with_code("cli_unavailable"));
                }

                Ok(ResolvedLauncherSeatConfig {
                    launcher: input.launcher,
                    model,
                    provider_profile_id: None,
                    prompt_override: input.advanced.and_then(|advanced| advanced.prompt_override),
                    timeout_ms,
                    auto_play,
                })
            }
            AiLauncherId::ClaudeCode => {
                let (model, provider) = resolve_model(&["claude-code"])?;
                let Some(provider) = provider else {
                    return Err(RuntimeError::bad_request(
                        "Claude Code is unavailable on this machine",
                    )
                    .with_code("cli_unavailable"));
                };

                if provider.available {
                    return Ok(ResolvedLauncherSeatConfig {
                        launcher: input.launcher,
                        model,
                        provider_profile_id: None,
                        prompt_override: input
                            .advanced
                            .and_then(|advanced| advanced.prompt_override),
                        timeout_ms,
                        auto_play,
                    });
                }

                if provider.status == "not_logged_in" {
                    return Err(RuntimeError::bad_request(
                        "Claude Code is installed, but you are not signed in. Please sign in with `claude auth login` first.",
                    )
                    .with_code("config_missing")
                    .with_detail("launcher", "claude-code"));
                }

                if provider.status.starts_with("missing_command") {
                    return Err(RuntimeError::bad_request(
                        "Claude Code is unavailable on this machine",
                    )
                    .with_code("cli_unavailable"));
                }

                Err(
                    RuntimeError::bad_request("Claude Code is unavailable on this machine")
                        .with_code("test_failed"),
                )
            }
            AiLauncherId::Gemini => {
                let preferred_source = setting
                    .as_ref()
                    .and_then(|value| value.preferred_source.clone());
                let profile_id = input
                    .advanced
                    .as_ref()
                    .and_then(|advanced| advanced.provider_profile_id.clone())
                    .or_else(|| {
                        setting
                            .as_ref()
                            .and_then(|value| value.default_profile_id.clone())
                    });
                let google_provider = providers.iter().find(|candidate| candidate.id == "google");
                let cli_provider = providers
                    .iter()
                    .find(|candidate| candidate.id == "gemini-cli");
                let should_use_cli = preferred_source.as_deref() == Some("cli")
                    || (profile_id.is_none()
                        && preferred_source.as_deref() != Some("api")
                        && cli_provider.is_some_and(|provider| provider.available));

                if should_use_cli {
                    let (model, provider) = resolve_model(&["gemini-cli"])?;
                    if !provider.as_ref().is_some_and(|provider| provider.available) {
                        return Err(RuntimeError::bad_request(
                            "Gemini CLI is unavailable on this machine",
                        )
                        .with_code("cli_unavailable"));
                    }

                    return Ok(ResolvedLauncherSeatConfig {
                        launcher: input.launcher,
                        model,
                        provider_profile_id: None,
                        prompt_override: input
                            .advanced
                            .and_then(|advanced| advanced.prompt_override),
                        timeout_ms,
                        auto_play,
                    });
                }

                let Some(profile_id) = profile_id else {
                    return Err(RuntimeError::bad_request("Gemini is not configured yet")
                        .with_code("config_missing"));
                };
                let profile = profiles.iter().find(|candidate| candidate.id == profile_id);
                if !matches!(profile, Some(profile) if profile.enabled && profile.health != "disabled")
                {
                    return Err(
                        RuntimeError::bad_request("Gemini API profile is unavailable")
                            .with_code("test_failed"),
                    );
                }
                if !google_provider.is_some_and(|provider| provider.available) {
                    return Err(
                        RuntimeError::bad_request("Gemini API provider is unavailable")
                            .with_code("test_failed"),
                    );
                }

                let (model, _provider) = resolve_model(&["google"])?;
                Ok(ResolvedLauncherSeatConfig {
                    launcher: input.launcher,
                    model,
                    provider_profile_id: Some(profile_id),
                    prompt_override: input.advanced.and_then(|advanced| advanced.prompt_override),
                    timeout_ms,
                    auto_play,
                })
            }
            AiLauncherId::Human => Err(RuntimeError::bad_request(
                "Human launcher does not require AI configuration",
            )),
        }
    }
}

fn default_session_data_path() -> PathBuf {
    Path::new(".").join(
        std::env::var("HUMAN_AGENT_PLAYGROUND_DATA_PATH")
            .unwrap_or_else(|_| ".human-agent-playground-data/sessions.json".to_string()),
    )
}

fn default_auth_data_path() -> PathBuf {
    Path::new(".").join(
        std::env::var("HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_DATA_PATH")
            .unwrap_or_else(|_| ".board-bridge-data/restflow.db".to_string()),
    )
}

fn build_default_ai_runtime_settings() -> AiRuntimeSettings {
    AiRuntimeSettings {
        providers: vec![
            AiRuntimeProviderSetting {
                provider_id: AiRuntimeProviderId::Openai,
                display_name: None,
                default_model: None,
                default_profile_id: None,
                preferred_source: None,
            },
            AiRuntimeProviderSetting {
                provider_id: AiRuntimeProviderId::Anthropic,
                display_name: None,
                default_model: None,
                default_profile_id: None,
                preferred_source: None,
            },
            AiRuntimeProviderSetting {
                provider_id: AiRuntimeProviderId::Codex,
                display_name: None,
                default_model: None,
                default_profile_id: None,
                preferred_source: None,
            },
            AiRuntimeProviderSetting {
                provider_id: AiRuntimeProviderId::ClaudeCode,
                display_name: None,
                default_model: None,
                default_profile_id: None,
                preferred_source: None,
            },
            AiRuntimeProviderSetting {
                provider_id: AiRuntimeProviderId::Gemini,
                display_name: None,
                default_model: None,
                default_profile_id: None,
                preferred_source: Some("api".to_string()),
            },
        ],
    }
}

fn normalize_ai_runtime_settings(raw: Option<AiRuntimeSettings>) -> AiRuntimeSettings {
    let parsed = raw.unwrap_or_else(build_default_ai_runtime_settings);
    let mut by_id = parsed
        .providers
        .into_iter()
        .map(|setting| (setting.provider_id, setting))
        .collect::<HashMap<_, _>>();

    for provider_id in [
        AiRuntimeProviderId::Openai,
        AiRuntimeProviderId::Anthropic,
        AiRuntimeProviderId::Codex,
        AiRuntimeProviderId::ClaudeCode,
        AiRuntimeProviderId::Gemini,
    ] {
        by_id
            .entry(provider_id)
            .or_insert_with(|| AiRuntimeProviderSetting {
                provider_id,
                display_name: None,
                default_model: None,
                default_profile_id: None,
                preferred_source: if provider_id == AiRuntimeProviderId::Gemini {
                    Some("api".to_string())
                } else {
                    None
                },
            });
    }

    AiRuntimeSettings {
        providers: [
            AiRuntimeProviderId::Openai,
            AiRuntimeProviderId::Anthropic,
            AiRuntimeProviderId::Codex,
            AiRuntimeProviderId::ClaudeCode,
            AiRuntimeProviderId::Gemini,
        ]
        .into_iter()
        .filter_map(|provider_id| by_id.remove(&provider_id))
        .collect(),
    }
}

fn build_default_ai_seats(sides: &[String]) -> HashMap<String, AiSeatConfig> {
    sides
        .iter()
        .map(|side| {
            (
                side.clone(),
                AiSeatConfig {
                    side: side.clone(),
                    launcher: AiLauncherId::Human,
                    enabled: false,
                    auto_play: true,
                    provider_profile_id: None,
                    model: None,
                    prompt_override: None,
                    timeout_ms: 60_000,
                    status: AiSeatStatus::Idle,
                    last_error: None,
                    runtime_source: None,
                },
            )
        })
        .collect()
}

fn normalize_ai_seats(
    sides: &[String],
    raw_ai_seats: Option<&HashMap<String, AiSeatConfig>>,
) -> HashMap<String, AiSeatConfig> {
    let defaults = build_default_ai_seats(sides);
    sides
        .iter()
        .map(|side| {
            let raw = raw_ai_seats.and_then(|value| value.get(side)).cloned();
            let mut seat = raw.unwrap_or_else(|| defaults.get(side).cloned().unwrap_or_default());
            seat.side = side.clone();
            (side.clone(), seat)
        })
        .collect()
}

fn reconcile_ai_seats(
    ai_seats: HashMap<String, AiSeatConfig>,
    turn: Option<&str>,
    status: Option<&str>,
) -> HashMap<String, AiSeatConfig> {
    ai_seats
        .into_iter()
        .map(|(side, seat)| {
            let next_seat = if !seat.enabled
                || seat.model.as_deref().unwrap_or_default().is_empty()
                || status == Some("finished")
            {
                AiSeatConfig {
                    launcher: if seat.enabled {
                        seat.launcher
                    } else {
                        AiLauncherId::Human
                    },
                    status: if seat.status == AiSeatStatus::Errored {
                        AiSeatStatus::Errored
                    } else {
                        AiSeatStatus::Idle
                    },
                    ..seat
                }
            } else if seat.status == AiSeatStatus::Errored {
                seat
            } else if seat.status == AiSeatStatus::Thinking {
                AiSeatConfig {
                    status: if turn == Some(side.as_str()) {
                        AiSeatStatus::Thinking
                    } else {
                        AiSeatStatus::Idle
                    },
                    ..seat
                }
            } else {
                AiSeatConfig {
                    status: if turn == Some(side.as_str()) {
                        AiSeatStatus::Waiting
                    } else {
                        AiSeatStatus::Idle
                    },
                    ..seat
                }
            };
            (side, next_seat)
        })
        .collect()
}

fn resolve_wait_for_turn_result(
    session: GameSession,
    expected_turn: &str,
    after_event_id: Option<&str>,
) -> Option<WaitForTurnResult> {
    let latest_event = get_latest_session_event(&session);
    let turn = read_session_turn(&session.state);
    let status = read_session_status(&session.state);
    let has_advanced = match (after_event_id, latest_event.as_ref()) {
        (Some(after_event_id), Some(event)) => event.id != after_event_id,
        (Some(_), None) => false,
        (None, _) => true,
    };

    if status.as_deref() == Some("finished") {
        return Some(WaitForTurnResult {
            status: "finished".to_string(),
            session,
            event: latest_event,
        });
    }

    if turn.as_deref() == Some(expected_turn) && has_advanced {
        return Some(WaitForTurnResult {
            status: "ready".to_string(),
            session,
            event: latest_event,
        });
    }

    None
}

fn get_latest_session_event(session: &GameSession) -> Option<SessionEvent> {
    session.events.last().cloned()
}

fn read_session_turn(state: &Value) -> Option<String> {
    state
        .as_object()
        .and_then(|value| value.get("turn"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn read_session_status(state: &Value) -> Option<String> {
    state
        .as_object()
        .and_then(|value| value.get("status"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn read_last_move_side(state: &Value) -> Option<String> {
    state
        .as_object()
        .and_then(|value| value.get("lastMove"))
        .and_then(Value::as_object)
        .and_then(|value| value.get("side"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn resolve_actor_context_from_create(
    input: &CreateSessionInput,
    fallback: SessionActorContext,
) -> SessionActorContext {
    SessionActorContext {
        actor_kind: input.actor_kind.unwrap_or(fallback.actor_kind),
        channel: input.channel.unwrap_or(fallback.channel),
        actor_name: input.actor_name.clone().or(fallback.actor_name),
    }
}

fn resolve_actor_context(input: &Value, fallback: SessionActorContext) -> SessionActorContext {
    let actor_kind = input
        .get("actorKind")
        .and_then(|value| serde_json::from_value::<SessionActorKind>(value.clone()).ok())
        .unwrap_or(fallback.actor_kind);
    let channel = input
        .get("channel")
        .and_then(|value| serde_json::from_value::<SessionChannel>(value.clone()).ok())
        .unwrap_or(fallback.channel);
    let actor_name = input
        .get("actorName")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or(fallback.actor_name);

    SessionActorContext {
        actor_kind,
        channel,
        actor_name,
    }
}

fn parse_decision_explanation(input: &Value) -> Result<Option<DecisionExplanation>, RuntimeError> {
    let Some(reasoning) = input.get("reasoning") else {
        return Ok(None);
    };
    if reasoning.is_null() {
        return Ok(None);
    }
    serde_json::from_value::<DecisionExplanation>(reasoning.clone())
        .map(Some)
        .map_err(|error| RuntimeError::bad_request(error.to_string()))
}

fn validate_agent_move_explanation(
    actor: &SessionActorContext,
    reasoning: Option<&DecisionExplanation>,
) -> Result<(), RuntimeError> {
    let requires_reasoning = actor.actor_kind == SessionActorKind::Agent
        && (actor.channel == SessionChannel::Mcp
            || actor.actor_name.as_deref() == Some("restflow-bridge"));
    if !requires_reasoning {
        return Ok(());
    }

    let Some(reasoning) = reasoning else {
        return Err(RuntimeError::bad_request(
            "Agent MCP moves must include a reasoning summary for the current move",
        ));
    };
    if reasoning.reasoning_steps.is_empty() {
        return Err(RuntimeError::bad_request(
            "Agent MCP moves must include at least one reasoning step",
        ));
    }

    Ok(())
}

fn parse_ai_runtime_event_details(input: &Value) -> HashMap<String, Value> {
    map_from_pairs([
        (
            "provider",
            input.get("provider").cloned().unwrap_or(Value::Null),
        ),
        ("model", input.get("model").cloned().unwrap_or(Value::Null)),
        (
            "seatSide",
            input.get("seatSide").cloned().unwrap_or(Value::Null),
        ),
        (
            "runtimeSource",
            input.get("runtimeSource").cloned().unwrap_or(Value::Null),
        ),
    ])
}

fn parse_move_event_details(state: &Value) -> HashMap<String, Value> {
    let Some(last_move) = state.get("lastMove").and_then(Value::as_object) else {
        return HashMap::new();
    };
    map_from_pairs([
        (
            "column",
            last_move.get("column").cloned().unwrap_or(Value::Null),
        ),
        ("row", last_move.get("row").cloned().unwrap_or(Value::Null)),
        (
            "point",
            last_move.get("point").cloned().unwrap_or(Value::Null),
        ),
        (
            "from",
            last_move.get("from").cloned().unwrap_or(Value::Null),
        ),
        ("to", last_move.get("to").cloned().unwrap_or(Value::Null)),
        (
            "side",
            last_move.get("side").cloned().unwrap_or(Value::Null),
        ),
        (
            "notation",
            last_move.get("notation").cloned().unwrap_or(Value::Null),
        ),
        ("san", last_move.get("san").cloned().unwrap_or(Value::Null)),
        (
            "flippedPoints",
            last_move
                .get("flippedPoints")
                .cloned()
                .unwrap_or(Value::Null),
        ),
        (
            "pieceDisplay",
            last_move
                .get("piece")
                .and_then(Value::as_object)
                .and_then(|piece| piece.get("display"))
                .cloned()
                .unwrap_or(Value::Null),
        ),
        (
            "stoneDisplay",
            last_move
                .get("stone")
                .and_then(Value::as_object)
                .and_then(|stone| stone.get("display"))
                .or_else(|| {
                    last_move
                        .get("disc")
                        .and_then(Value::as_object)
                        .and_then(|disc| disc.get("display"))
                })
                .cloned()
                .unwrap_or(Value::Null),
        ),
        (
            "capturedDisplay",
            last_move
                .get("captured")
                .and_then(Value::as_object)
                .and_then(|captured| captured.get("display"))
                .cloned()
                .unwrap_or(Value::Null),
        ),
        (
            "promotionDisplay",
            last_move
                .get("promotion")
                .and_then(Value::as_object)
                .and_then(|promotion| promotion.get("display"))
                .cloned()
                .unwrap_or(Value::Null),
        ),
    ])
}

fn create_session_event(
    timestamp: &str,
    actor: &SessionActorContext,
    game_id: &str,
    game_title: &str,
) -> SessionEvent {
    SessionEvent {
        id: Uuid::new_v4().to_string(),
        kind: SessionEventKind::SessionCreated,
        created_at: timestamp.to_string(),
        actor_kind: actor.actor_kind,
        channel: actor.channel,
        actor_name: actor.actor_name.clone(),
        summary: format!("Created a new {game_title} session."),
        reasoning: None,
        details: map_from_pairs([("gameId", Value::String(game_id.to_string()))]),
    }
}

fn create_move_played_event(
    timestamp: &str,
    actor: &SessionActorContext,
    reasoning: Option<&DecisionExplanation>,
    details: HashMap<String, Value>,
) -> SessionEvent {
    let side = details
        .get("side")
        .and_then(Value::as_str)
        .unwrap_or("Unknown");
    let point = details.get("point").and_then(Value::as_str);
    let from = details.get("from").and_then(Value::as_str);
    let to = details.get("to").and_then(Value::as_str);
    let summary = match point {
        Some(point) => format!("{side} played {point}."),
        None => format!(
            "{side} played {} -> {}.",
            from.unwrap_or("unknown"),
            to.unwrap_or("unknown")
        ),
    };

    SessionEvent {
        id: Uuid::new_v4().to_string(),
        kind: SessionEventKind::MovePlayed,
        created_at: timestamp.to_string(),
        actor_kind: actor.actor_kind,
        channel: actor.channel,
        actor_name: actor.actor_name.clone(),
        summary,
        reasoning: reasoning.cloned(),
        details,
    }
}

fn create_session_reset_event(
    timestamp: &str,
    actor: &SessionActorContext,
    game_title: &str,
) -> SessionEvent {
    SessionEvent {
        id: Uuid::new_v4().to_string(),
        kind: SessionEventKind::SessionReset,
        created_at: timestamp.to_string(),
        actor_kind: actor.actor_kind,
        channel: actor.channel,
        actor_name: actor.actor_name.clone(),
        summary: format!("Reset the {game_title} session to the opening position."),
        reasoning: None,
        details: HashMap::new(),
    }
}

fn create_system_notice_event(
    timestamp: &str,
    summary: &str,
    details: HashMap<String, Value>,
) -> SessionEvent {
    SessionEvent {
        id: Uuid::new_v4().to_string(),
        kind: SessionEventKind::SystemNotice,
        created_at: timestamp.to_string(),
        actor_kind: SessionActorKind::System,
        channel: SessionChannel::System,
        actor_name: Some("restflow-bridge".to_string()),
        summary: summary.to_string(),
        reasoning: None,
        details,
    }
}

fn create_ai_seat_run_token(session: &GameSession, side: &str) -> AiSeatRunToken {
    let seat = session
        .ai_seats
        .as_ref()
        .and_then(|ai_seats| ai_seats.get(side))
        .cloned();
    AiSeatRunToken {
        session_updated_at: session.updated_at.clone(),
        last_event_id: session.events.last().map(|event| event.id.clone()),
        seat_signature: build_ai_seat_signature(seat.as_ref()),
    }
}

fn is_ai_seat_run_current(session: &GameSession, side: &str, token: &AiSeatRunToken) -> bool {
    let seat = session
        .ai_seats
        .as_ref()
        .and_then(|ai_seats| ai_seats.get(side));
    let Some(seat) = seat else {
        return false;
    };
    if !seat.enabled || !seat.auto_play || seat.status == AiSeatStatus::Errored {
        return false;
    }
    if read_session_status(&session.state).as_deref() == Some("finished")
        || read_session_turn(&session.state).as_deref() != Some(side)
    {
        return false;
    }

    session.updated_at == token.session_updated_at
        && session.events.last().map(|event| event.id.as_str()) == token.last_event_id.as_deref()
        && build_ai_seat_signature(Some(seat)) == token.seat_signature
}

fn build_ai_seat_signature(seat: Option<&AiSeatConfig>) -> String {
    let Some(seat) = seat else {
        return "missing".to_string();
    };

    stable_json(&json!({
        "side": seat.side,
        "launcher": seat.launcher,
        "enabled": seat.enabled,
        "autoPlay": seat.auto_play,
        "providerProfileId": seat.provider_profile_id,
        "model": seat.model,
        "promptOverride": seat.prompt_override,
        "timeoutMs": seat.timeout_ms,
        "status": seat.status,
        "runtimeSource": seat.runtime_source,
    }))
}

fn includes_legal_action(legal_moves: &[Value], action: &Value) -> bool {
    let target = stable_json(action);
    legal_moves
        .iter()
        .any(|candidate| stable_json(candidate) == target)
}

fn map_bridge_decision_failure(decision: &DecideTurnResult) -> AiSeatFailure {
    let code = decision
        .error_code
        .clone()
        .unwrap_or_else(|| "provider_request_failed".to_string());

    match code.as_str() {
        "decision_parse_failed" => AiSeatFailure {
            code,
            user_message: "The AI response could not be turned into a valid move.".to_string(),
            notice_summary: "the model returned an unparseable action".to_string(),
            raw_response_preview: decision.raw_response_preview.clone(),
        },
        "decision_missing_action" => AiSeatFailure {
            code,
            user_message: "The AI response did not include a move.".to_string(),
            notice_summary: "the model response did not include an action".to_string(),
            raw_response_preview: decision.raw_response_preview.clone(),
        },
        "provider_unavailable" => AiSeatFailure {
            code,
            user_message: decision
                .error
                .clone()
                .unwrap_or_else(|| "The selected AI provider is unavailable.".to_string()),
            notice_summary: "the provider is unavailable".to_string(),
            raw_response_preview: decision.raw_response_preview.clone(),
        },
        "provider_request_failed" => AiSeatFailure {
            code,
            user_message: decision
                .error
                .clone()
                .unwrap_or_else(|| "The AI provider request failed.".to_string()),
            notice_summary: "the provider request failed".to_string(),
            raw_response_preview: decision.raw_response_preview.clone(),
        },
        _ => AiSeatFailure {
            code,
            user_message: decision
                .error
                .clone()
                .unwrap_or_else(|| "The AI seat failed.".to_string()),
            notice_summary: "the AI runtime failed".to_string(),
            raw_response_preview: decision.raw_response_preview.clone(),
        },
    }
}

fn normalize_ai_seat_failure(error: &AiSeatRuntimeError) -> AiSeatFailure {
    error.failure.clone()
}

fn stable_json(value: &Value) -> String {
    match value {
        Value::Array(values) => format!(
            "[{}]",
            values.iter().map(stable_json).collect::<Vec<_>>().join(",")
        ),
        Value::Object(map) => format!("{{{}}}", {
            let mut entries = map.iter().collect::<Vec<_>>();
            entries.sort_by(|(left, _), (right, _)| left.cmp(right));
            entries
                .into_iter()
                .map(|(key, nested)| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(key).unwrap_or_default(),
                        stable_json(nested)
                    )
                })
                .collect::<Vec<_>>()
                .join(",")
        }),
        _ => serde_json::to_string(value).unwrap_or_else(|_| "null".to_string()),
    }
}

fn normalize_ai_runtime_action(value: &Value) -> Value {
    match value {
        Value::Array(values) => {
            Value::Array(values.iter().map(normalize_ai_runtime_action).collect())
        }
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(_, value)| !value.is_null())
                .map(|(key, value)| (key.clone(), normalize_ai_runtime_action(value)))
                .collect(),
        ),
        _ => value.clone(),
    }
}

fn map_launcher_to_decision_provider(launcher: AiLauncherId) -> Option<&'static str> {
    match launcher {
        AiLauncherId::Openai => Some("openai"),
        AiLauncherId::Anthropic => Some("anthropic"),
        AiLauncherId::Codex => Some("codex-cli"),
        AiLauncherId::ClaudeCode => Some("claude-code"),
        AiLauncherId::Gemini => Some("google"),
        AiLauncherId::Human => None,
    }
}

fn runtime_provider_id_for_launcher(launcher: AiLauncherId) -> AiRuntimeProviderId {
    match launcher {
        AiLauncherId::Human => AiRuntimeProviderId::Openai,
        AiLauncherId::Openai => AiRuntimeProviderId::Openai,
        AiLauncherId::Anthropic => AiRuntimeProviderId::Anthropic,
        AiLauncherId::Codex => AiRuntimeProviderId::Codex,
        AiLauncherId::ClaudeCode => AiRuntimeProviderId::ClaudeCode,
        AiLauncherId::Gemini => AiRuntimeProviderId::Gemini,
    }
}

fn build_ai_runtime_move_input(action: &Value, decision: &DecideTurnResult, side: &str) -> Value {
    let mut normalized = normalize_ai_runtime_action(action);
    let mut object = normalized.as_object_mut().cloned().unwrap_or_default();
    object.insert("actorKind".to_string(), Value::String("agent".to_string()));
    object.insert("channel".to_string(), Value::String("system".to_string()));
    object.insert(
        "actorName".to_string(),
        Value::String("restflow-bridge".to_string()),
    );
    if let Some(reasoning) = decision.reasoning.clone() {
        object.insert(
            "reasoning".to_string(),
            serde_json::to_value(reasoning).unwrap_or(Value::Null),
        );
    }
    if let Some(provider) = decision.provider.clone() {
        object.insert("provider".to_string(), Value::String(provider));
    }
    if let Some(model) = decision.model.clone() {
        object.insert("model".to_string(), Value::String(model));
    }
    object.insert("seatSide".to_string(), Value::String(side.to_string()));
    object.insert(
        "runtimeSource".to_string(),
        Value::String("restflow-bridge".to_string()),
    );
    Value::Object(object)
}

fn merge_detail_maps(
    left: &HashMap<String, Value>,
    right: &HashMap<String, Value>,
) -> HashMap<String, Value> {
    let mut merged = left.clone();
    for (key, value) in right {
        if !value.is_null() {
            merged.insert(key.clone(), value.clone());
        }
    }
    merged
}

fn map_from_pairs<const N: usize>(pairs: [(&str, Value); N]) -> HashMap<String, Value> {
    pairs
        .into_iter()
        .filter(|(_, value)| !value.is_null())
        .map(|(key, value)| (key.to_string(), value))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::claude_env_lock;
    use std::os::unix::fs::PermissionsExt;

    fn temp_runtime_config(name: &str) -> RuntimeConfig {
        let unique = format!("{}-{}", name, Uuid::new_v4());
        let root = std::env::temp_dir().join(unique);
        RuntimeConfig {
            session_data_path: root.join("sessions.json"),
            auth_data_path: root.join("restflow.db"),
        }
    }

    fn write_test_claude_script(name: &str, body: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("{name}-{}.sh", Uuid::new_v4()));
        std::fs::write(&path, body).unwrap();
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path, permissions).unwrap();
        path
    }

    #[tokio::test]
    async fn creates_and_reads_a_session() {
        let runtime = HumanAgentPlaygroundRuntime::new(temp_runtime_config("create-session"))
            .await
            .unwrap();

        let session = runtime
            .create_session(CreateSessionInput {
                game_id: "gomoku".to_string(),
                ..CreateSessionInput::default()
            })
            .await
            .unwrap();

        assert_eq!(session.game_id, "gomoku");
        assert_eq!(
            runtime.get_session(&session.id).await.unwrap().id,
            session.id
        );
        assert_eq!(runtime.list_sessions().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn returns_ready_when_expected_turn_matches_current_turn() {
        let runtime = HumanAgentPlaygroundRuntime::new(temp_runtime_config("wait-for-turn"))
            .await
            .unwrap();
        let session = runtime
            .create_session(CreateSessionInput::default())
            .await
            .unwrap();

        let result = runtime
            .wait_for_turn(&session.id, "red", None, Some(100))
            .await
            .unwrap();

        assert_eq!(result.status, "ready");
        assert_eq!(result.session.id, session.id);
    }

    #[tokio::test]
    async fn persists_runtime_settings_updates() {
        let runtime = HumanAgentPlaygroundRuntime::new(temp_runtime_config("runtime-settings"))
            .await
            .unwrap();
        let mut settings = runtime.get_ai_runtime_settings().await.unwrap().settings;
        let gemini = settings
            .providers
            .iter_mut()
            .find(|provider| provider.provider_id == AiRuntimeProviderId::Gemini)
            .unwrap();
        gemini.default_model = Some("gemini-2.5-pro".to_string());
        gemini.preferred_source = Some("cli".to_string());

        let saved = runtime.update_ai_runtime_settings(settings).await.unwrap();
        let persisted = runtime.get_ai_runtime_settings().await.unwrap().settings;

        assert_eq!(saved, persisted);
        assert_eq!(
            persisted
                .providers
                .iter()
                .find(|provider| provider.provider_id == AiRuntimeProviderId::Gemini)
                .and_then(|provider| provider.preferred_source.as_deref()),
            Some("cli")
        );
    }

    #[tokio::test]
    async fn returns_config_missing_when_claude_code_is_not_logged_in() {
        let _lock = claude_env_lock();
        let script = write_test_claude_script(
            "claude-not-logged-in",
            r#"#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo '{"loggedIn":false}'
  exit 0
fi
exit 1
"#,
        );
        unsafe {
            std::env::set_var("RESTFLOW_CLAUDE_BIN", &script);
        }

        let runtime = HumanAgentPlaygroundRuntime::new(temp_runtime_config("claude-login-state"))
            .await
            .unwrap();
        let session = runtime
            .create_session(CreateSessionInput {
                game_id: "chess".to_string(),
                ..CreateSessionInput::default()
            })
            .await
            .unwrap();

        let error = runtime
            .update_ai_seat_launcher(
                &session.id,
                "black",
                UpdateAiSeatLauncherInput {
                    launcher: AiLauncherId::ClaudeCode,
                    model: Some("claude-code-sonnet".to_string()),
                    auto_play: Some(true),
                    advanced: None,
                },
            )
            .await
            .unwrap_err();

        assert_eq!(error.code(), Some("config_missing"));
        assert!(
            error
                .message()
                .contains("Claude Code is installed, but you are not signed in")
        );

        unsafe {
            std::env::remove_var("RESTFLOW_CLAUDE_BIN");
        }
    }

    #[tokio::test]
    async fn updates_multiple_ai_seat_launchers_in_one_call() {
        let _lock = claude_env_lock();
        let script = write_test_claude_script(
            "claude-ready-batch",
            r#"#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo '{"loggedIn":true}'
  exit 0
fi
echo '{"action":{"from":"e7","to":"e5"}}'
"#,
        );
        unsafe {
            std::env::set_var("RESTFLOW_CLAUDE_BIN", &script);
        }

        let runtime = HumanAgentPlaygroundRuntime::new(temp_runtime_config("batch-seat-launchers"))
            .await
            .unwrap();
        let session = runtime
            .create_session(CreateSessionInput {
                game_id: "chess".to_string(),
                ..CreateSessionInput::default()
            })
            .await
            .unwrap();

        let updated = runtime
            .update_ai_seat_launchers(
                &session.id,
                UpdateAiSeatLaunchersInput {
                    seats: HashMap::from([
                        (
                            "white".to_string(),
                            UpdateAiSeatLauncherInput {
                                launcher: AiLauncherId::Human,
                                model: None,
                                auto_play: None,
                                advanced: None,
                            },
                        ),
                        (
                            "black".to_string(),
                            UpdateAiSeatLauncherInput {
                                launcher: AiLauncherId::ClaudeCode,
                                model: Some("claude-code-sonnet".to_string()),
                                auto_play: Some(true),
                                advanced: None,
                            },
                        ),
                    ]),
                },
            )
            .await
            .unwrap();

        assert_eq!(
            updated
                .ai_seats
                .as_ref()
                .and_then(|seats| seats.get("white"))
                .map(|seat| (seat.launcher, seat.enabled)),
            Some((AiLauncherId::Human, false))
        );
        assert_eq!(
            updated
                .ai_seats
                .as_ref()
                .and_then(|seats| seats.get("black"))
                .and_then(|seat| seat.model.as_deref()),
            Some("claude-code-sonnet")
        );

        unsafe {
            std::env::remove_var("RESTFLOW_CLAUDE_BIN");
        }
    }

    #[tokio::test]
    async fn does_not_partially_apply_batch_launcher_updates_when_one_side_is_invalid() {
        let _lock = claude_env_lock();
        let script = write_test_claude_script(
            "claude-ready-invalid-batch",
            r#"#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo '{"loggedIn":true}'
  exit 0
fi
echo '{"action":{"from":"e7","to":"e5"}}'
"#,
        );
        unsafe {
            std::env::set_var("RESTFLOW_CLAUDE_BIN", &script);
        }

        let runtime =
            HumanAgentPlaygroundRuntime::new(temp_runtime_config("batch-seat-invalid"))
                .await
                .unwrap();
        let session = runtime
            .create_session(CreateSessionInput {
                game_id: "chess".to_string(),
                ..CreateSessionInput::default()
            })
            .await
            .unwrap();

        let error = runtime
            .update_ai_seat_launchers(
                &session.id,
                UpdateAiSeatLaunchersInput {
                    seats: HashMap::from([
                        (
                            "black".to_string(),
                            UpdateAiSeatLauncherInput {
                                launcher: AiLauncherId::ClaudeCode,
                                model: Some("claude-code-sonnet".to_string()),
                                auto_play: Some(true),
                                advanced: None,
                            },
                        ),
                        (
                            "blue".to_string(),
                            UpdateAiSeatLauncherInput {
                                launcher: AiLauncherId::Human,
                                model: None,
                                auto_play: None,
                                advanced: None,
                            },
                        ),
                    ]),
                },
            )
            .await
            .unwrap_err();

        assert_eq!(error.code(), Some("invalid_side"));
        let latest = runtime.get_session(&session.id).await.unwrap();
        assert_eq!(
            latest
                .ai_seats
                .as_ref()
                .and_then(|seats| seats.get("black"))
                .map(|seat| (seat.launcher, seat.enabled)),
            Some((AiLauncherId::Human, false))
        );

        unsafe {
            std::env::remove_var("RESTFLOW_CLAUDE_BIN");
        }
    }
}
