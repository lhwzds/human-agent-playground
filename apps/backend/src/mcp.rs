use std::borrow::Cow;
use std::sync::Arc;

use hap_models::{CreateSessionInput, DecisionExplanation, SessionActorKind, SessionChannel};
use hap_runtime::HumanAgentPlaygroundRuntime;
use rmcp::handler::server::tool::schema_for_type;
use rmcp::model::{
    CallToolRequestParams, CallToolResult, Content, Implementation, JsonObject, ListToolsResult,
    Meta, PaginatedRequestParams, ServerCapabilities, ServerInfo, Tool, ToolAnnotations,
};
use rmcp::schemars::JsonSchema;
use rmcp::service::{RequestContext, RoleServer};
use rmcp::{ErrorData as McpError, ServerHandler};
use schemars::JsonSchema as SchemarsJsonSchema;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

const TOOL_META_KEY: &str = "human-agent-playground/tool";

#[derive(Clone)]
pub struct HumanAgentPlaygroundMcpServer {
    runtime: Arc<HumanAgentPlaygroundRuntime>,
    tool_catalog: Arc<Vec<ToolCatalogEntry>>,
}

#[derive(Clone)]
struct ToolCatalogEntry {
    name: &'static str,
    title: &'static str,
    description: &'static str,
    category: &'static str,
    game_id: Option<&'static str>,
    tags: &'static [&'static str],
    annotations: ToolAnnotations,
    input_schema: Arc<JsonObject>,
    kind: ToolKind,
}

#[derive(Clone, Copy)]
enum ToolKind {
    ListGames,
    ListSessions,
    SearchTools,
    CreateSession,
    GetGameState,
    WaitForTurn,
    ResetSession,
    XiangqiGetLegalMoves,
    XiangqiPlayMove,
    XiangqiPlayMoveAndWait,
    ChessGetLegalMoves,
    ChessPlayMove,
    ChessPlayMoveAndWait,
    GomokuGetLegalMoves,
    GomokuPlayMove,
    GomokuPlayMoveAndWait,
    ConnectFourGetLegalMoves,
    ConnectFourPlayMove,
    ConnectFourPlayMoveAndWait,
    OthelloGetLegalMoves,
    OthelloPlayMove,
    OthelloPlayMoveAndWait,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
struct EmptyParams {}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct SearchToolsInput {
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    game_id: Option<String>,
    #[serde(default)]
    tags: Option<Vec<String>>,
    #[serde(default)]
    limit: Option<u32>,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct CreateSessionToolInput {
    #[serde(default)]
    game_id: Option<String>,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct SessionIdInput {
    session_id: String,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct WaitForTurnToolInput {
    session_id: String,
    expected_turn: String,
    #[serde(default)]
    after_event_id: Option<String>,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct XiangqiLegalMovesInput {
    session_id: String,
    #[serde(default)]
    from: Option<String>,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct XiangqiPlayMoveInput {
    session_id: String,
    from: String,
    to: String,
    reasoning: DecisionExplanation,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct XiangqiPlayMoveAndWaitInput {
    session_id: String,
    from: String,
    to: String,
    #[serde(default)]
    timeout_ms: Option<u64>,
    reasoning: DecisionExplanation,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct ChessLegalMovesInput {
    session_id: String,
    #[serde(default)]
    from: Option<String>,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct ChessPlayMoveInput {
    session_id: String,
    from: String,
    to: String,
    #[serde(default)]
    promotion: Option<String>,
    reasoning: DecisionExplanation,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct ChessPlayMoveAndWaitInput {
    session_id: String,
    from: String,
    to: String,
    #[serde(default)]
    promotion: Option<String>,
    #[serde(default)]
    timeout_ms: Option<u64>,
    reasoning: DecisionExplanation,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct PointQueryInput {
    session_id: String,
    #[serde(default)]
    point: Option<String>,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct PointMoveInput {
    session_id: String,
    point: String,
    reasoning: DecisionExplanation,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct PointMoveAndWaitInput {
    session_id: String,
    point: String,
    #[serde(default)]
    timeout_ms: Option<u64>,
    reasoning: DecisionExplanation,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct ConnectFourQueryInput {
    session_id: String,
    #[serde(default)]
    column: Option<u8>,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct ConnectFourMoveInput {
    session_id: String,
    column: u8,
    reasoning: DecisionExplanation,
}

#[derive(Debug, Deserialize, SchemarsJsonSchema)]
#[serde(rename_all = "camelCase")]
struct ConnectFourMoveAndWaitInput {
    session_id: String,
    column: u8,
    #[serde(default)]
    timeout_ms: Option<u64>,
    reasoning: DecisionExplanation,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ToolSearchResult {
    name: String,
    title: String,
    description: String,
    category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    game_id: Option<String>,
    tags: Vec<String>,
}

impl HumanAgentPlaygroundMcpServer {
    pub fn new(runtime: Arc<HumanAgentPlaygroundRuntime>) -> Self {
        Self {
            runtime,
            tool_catalog: Arc::new(build_tool_catalog()),
        }
    }

    fn build_tool(&self, entry: &ToolCatalogEntry) -> Tool {
        let mut tool = Tool::new(entry.name, entry.description, entry.input_schema.clone())
            .annotate(entry.annotations.clone());
        tool.title = Some(entry.title.to_string());
        let mut meta = Meta::new();
        meta.0.insert(
            TOOL_META_KEY.to_string(),
            serde_json::to_value(serialize_tool_catalog_entry(entry)).unwrap_or(Value::Null),
        );
        tool.meta = Some(meta);
        tool
    }

    async fn execute_tool(
        &self,
        request: CallToolRequestParams,
    ) -> Result<CallToolResult, McpError> {
        let args = request.arguments;
        let Some(entry) = self
            .tool_catalog
            .iter()
            .find(|entry| entry.name == request.name.as_ref())
        else {
            return Err(McpError::invalid_params("tool not found", None));
        };

        match entry.kind {
            ToolKind::ListGames => {
                Ok(text_result("Available games", json!({ "games": self.runtime.list_games() })))
            }
            ToolKind::ListSessions => match self.runtime.list_sessions().await {
                Ok(sessions) => Ok(text_result("Active sessions", json!({ "sessions": sessions }))),
                Err(error) => Ok(error_result(error)),
            },
            ToolKind::SearchTools => {
                let input: SearchToolsInput = parse_params(args)?;
                let results = search_tool_catalog(
                    self.tool_catalog.as_slice(),
                    input.query.as_deref(),
                    input.category.as_deref(),
                    input.game_id.as_deref(),
                    input.tags.as_deref().unwrap_or(&[]),
                    input.limit.unwrap_or(10),
                );
                Ok(text_result(
                    "Matching tools",
                    json!({
                        "categories": list_tool_categories(self.tool_catalog.as_slice()),
                        "tools": results,
                    }),
                ))
            }
            ToolKind::CreateSession => {
                let input: CreateSessionToolInput = parse_params(args)?;
                match self
                    .runtime
                    .create_session(CreateSessionInput {
                        game_id: input.game_id.unwrap_or_else(|| "xiangqi".to_string()),
                        actor_kind: Some(SessionActorKind::Agent),
                        channel: Some(SessionChannel::Mcp),
                        actor_name: None,
                        seat_launchers: None,
                    })
                    .await
                {
                    Ok(session) => Ok(text_result("Created session", serde_json::to_value(session).unwrap_or(Value::Null))),
                    Err(error) => Ok(error_result(error)),
                }
            }
            ToolKind::GetGameState => {
                let input: SessionIdInput = parse_params(args)?;
                match self.runtime.get_session(&input.session_id).await {
                    Ok(session) => Ok(text_result("Current game state", serde_json::to_value(session).unwrap_or(Value::Null))),
                    Err(error) => Ok(error_result(error)),
                }
            }
            ToolKind::WaitForTurn => {
                let input: WaitForTurnToolInput = parse_params(args)?;
                match self
                    .runtime
                    .wait_for_turn(
                        &input.session_id,
                        &input.expected_turn,
                        input.after_event_id.as_deref(),
                        input.timeout_ms,
                    )
                    .await
                {
                    Ok(result) => Ok(text_result(
                        "Wait for turn result. IMPORTANT: this tool is for one foreground blocking MCP call, not a detached background process. If the status is ready, NEVER reply in chat yet. Fetch the current state now and continue with MCP tool calls until you have either played exactly one move or decided to stop. IMPORTANT: your MCP client request timeout must be greater than timeoutMs; prefer 600000 ms for long local shared-play waits.",
                        json!({
                            "status": result.status,
                            "session": result.session,
                            "event": result.event,
                        }),
                    )),
                    Err(error) => Ok(error_result(error)),
                }
            }
            ToolKind::ResetSession => {
                let input: SessionIdInput = parse_params(args)?;
                match self
                    .runtime
                    .reset_session(
                        &input.session_id,
                        json!({
                            "actorKind": SessionActorKind::Agent,
                            "channel": SessionChannel::Mcp,
                        }),
                    )
                    .await
                {
                    Ok(session) => Ok(text_result("Reset session", serde_json::to_value(session).unwrap_or(Value::Null))),
                    Err(error) => Ok(error_result(error)),
                }
            }
            ToolKind::XiangqiGetLegalMoves => {
                let input: XiangqiLegalMovesInput = parse_params(args)?;
                let query = input.from.map(|from| json!({ "from": from }));
                match self.runtime.get_legal_moves(&input.session_id, query).await {
                    Ok(moves) => Ok(text_result("Xiangqi legal moves", json!({ "moves": moves }))),
                    Err(error) => Ok(error_result(error)),
                }
            }
            ToolKind::XiangqiPlayMove => self.play_move_result(
                "Updated Xiangqi game state. IMPORTANT: if you are in a turn loop, continue with MCP tool calls. NEVER reply in chat until this move cycle is complete.",
                args,
                |input: XiangqiPlayMoveInput| {
                    json!({
                        "from": input.from,
                        "to": input.to,
                        "actorKind": SessionActorKind::Agent,
                        "channel": SessionChannel::Mcp,
                        "reasoning": input.reasoning,
                    })
                },
                |input: &XiangqiPlayMoveInput| &input.session_id,
            ).await,
            ToolKind::XiangqiPlayMoveAndWait => self.play_move_and_wait_result(
                "Played one Xiangqi move and waited until the opponent replied and the turn came back. IMPORTANT: this tool is for one foreground blocking MCP call, not a detached background process. Your MCP client request timeout must be greater than timeoutMs; prefer 600000 ms for long local play. If the status is ready, re-read the state and call the next move tool immediately. If the user asked for a full game, repeat this cycle until the game finishes. NEVER send a chat reply before you either play the next move or decide to stop.",
                args,
                |input: XiangqiPlayMoveAndWaitInput| {
                    (
                        input.session_id,
                        json!({
                            "from": input.from,
                            "to": input.to,
                            "actorKind": SessionActorKind::Agent,
                            "channel": SessionChannel::Mcp,
                            "reasoning": input.reasoning,
                        }),
                        input.timeout_ms,
                    )
                },
            ).await,
            ToolKind::ChessGetLegalMoves => {
                let input: ChessLegalMovesInput = parse_params(args)?;
                let query = input.from.map(|from| json!({ "from": from }));
                match self.runtime.get_legal_moves(&input.session_id, query).await {
                    Ok(moves) => Ok(text_result("Chess legal moves", json!({ "moves": moves }))),
                    Err(error) => Ok(error_result(error)),
                }
            }
            ToolKind::ChessPlayMove => self.play_move_result(
                "Updated Chess game state. IMPORTANT: if you are in a turn loop, continue with MCP tool calls. NEVER reply in chat until this move cycle is complete.",
                args,
                |input: ChessPlayMoveInput| {
                    let mut payload = serde_json::Map::new();
                    payload.insert("from".to_string(), Value::String(input.from));
                    payload.insert("to".to_string(), Value::String(input.to));
                    if let Some(promotion) = input.promotion {
                        payload.insert("promotion".to_string(), Value::String(promotion));
                    }
                    payload.insert("actorKind".to_string(), serde_json::to_value(SessionActorKind::Agent).unwrap_or(Value::Null));
                    payload.insert("channel".to_string(), serde_json::to_value(SessionChannel::Mcp).unwrap_or(Value::Null));
                    payload.insert("reasoning".to_string(), serde_json::to_value(input.reasoning).unwrap_or(Value::Null));
                    Value::Object(payload)
                },
                |input: &ChessPlayMoveInput| &input.session_id,
            ).await,
            ToolKind::ChessPlayMoveAndWait => self.play_move_and_wait_result(
                "Played one Chess move and waited until the opponent replied and the turn came back. IMPORTANT: this tool is for one foreground blocking MCP call, not a detached background process. Your MCP client request timeout must be greater than timeoutMs; prefer 600000 ms for long local play. If the status is ready, re-read the state and call the next move tool immediately. If the user asked for a full game, repeat this cycle until the game finishes. NEVER send a chat reply before you either play the next move or decide to stop.",
                args,
                |input: ChessPlayMoveAndWaitInput| {
                    let mut payload = serde_json::Map::new();
                    payload.insert("from".to_string(), Value::String(input.from));
                    payload.insert("to".to_string(), Value::String(input.to));
                    if let Some(promotion) = input.promotion {
                        payload.insert("promotion".to_string(), Value::String(promotion));
                    }
                    payload.insert("actorKind".to_string(), serde_json::to_value(SessionActorKind::Agent).unwrap_or(Value::Null));
                    payload.insert("channel".to_string(), serde_json::to_value(SessionChannel::Mcp).unwrap_or(Value::Null));
                    payload.insert("reasoning".to_string(), serde_json::to_value(input.reasoning).unwrap_or(Value::Null));
                    (input.session_id, Value::Object(payload), input.timeout_ms)
                },
            ).await,
            ToolKind::GomokuGetLegalMoves => {
                let input: PointQueryInput = parse_params(args)?;
                let query = input.point.map(|point| json!({ "point": point }));
                match self.runtime.get_legal_moves(&input.session_id, query).await {
                    Ok(moves) => Ok(text_result("Gomoku legal moves", json!({ "moves": moves }))),
                    Err(error) => Ok(error_result(error)),
                }
            }
            ToolKind::GomokuPlayMove => self.play_move_result(
                "Updated Gomoku game state. IMPORTANT: if you are in a turn loop, continue with MCP tool calls. NEVER reply in chat until this move cycle is complete.",
                args,
                |input: PointMoveInput| {
                    json!({
                        "point": input.point,
                        "actorKind": SessionActorKind::Agent,
                        "channel": SessionChannel::Mcp,
                        "reasoning": input.reasoning,
                    })
                },
                |input: &PointMoveInput| &input.session_id,
            ).await,
            ToolKind::GomokuPlayMoveAndWait => self.play_move_and_wait_result(
                "Played one Gomoku move and waited until the opponent replied and the turn came back. IMPORTANT: this tool is for one foreground blocking MCP call, not a detached background process. Your MCP client request timeout must be greater than timeoutMs; prefer 600000 ms for long local play. If the status is ready, re-read the state and call the next move tool immediately. If the user asked for a full game, repeat this cycle until the game finishes. NEVER send a chat reply before you either play the next move or decide to stop.",
                args,
                |input: PointMoveAndWaitInput| {
                    (
                        input.session_id,
                        json!({
                            "point": input.point,
                            "actorKind": SessionActorKind::Agent,
                            "channel": SessionChannel::Mcp,
                            "reasoning": input.reasoning,
                        }),
                        input.timeout_ms,
                    )
                },
            ).await,
            ToolKind::ConnectFourGetLegalMoves => {
                let input: ConnectFourQueryInput = parse_params(args)?;
                let query = input.column.map(|column| json!({ "column": column }));
                match self.runtime.get_legal_moves(&input.session_id, query).await {
                    Ok(moves) => Ok(text_result("Connect Four legal moves", json!({ "moves": moves }))),
                    Err(error) => Ok(error_result(error)),
                }
            }
            ToolKind::ConnectFourPlayMove => self.play_move_result(
                "Updated Connect Four game state. IMPORTANT: if you are in a turn loop, continue with MCP tool calls. NEVER reply in chat until this move cycle is complete.",
                args,
                |input: ConnectFourMoveInput| {
                    json!({
                        "column": input.column,
                        "actorKind": SessionActorKind::Agent,
                        "channel": SessionChannel::Mcp,
                        "reasoning": input.reasoning,
                    })
                },
                |input: &ConnectFourMoveInput| &input.session_id,
            ).await,
            ToolKind::ConnectFourPlayMoveAndWait => self.play_move_and_wait_result(
                "Played one Connect Four move and waited until the opponent replied and the turn came back. IMPORTANT: this tool is for one foreground blocking MCP call, not a detached background process. Your MCP client request timeout must be greater than timeoutMs; prefer 600000 ms for long local play. If the status is ready, re-read the state and call the next move tool immediately. If the user asked for a full game, repeat this cycle until the game finishes. NEVER send a chat reply before you either play the next move or decide to stop.",
                args,
                |input: ConnectFourMoveAndWaitInput| {
                    (
                        input.session_id,
                        json!({
                            "column": input.column,
                            "actorKind": SessionActorKind::Agent,
                            "channel": SessionChannel::Mcp,
                            "reasoning": input.reasoning,
                        }),
                        input.timeout_ms,
                    )
                },
            ).await,
            ToolKind::OthelloGetLegalMoves => {
                let input: PointQueryInput = parse_params(args)?;
                let query = input.point.map(|point| json!({ "point": point }));
                match self.runtime.get_legal_moves(&input.session_id, query).await {
                    Ok(moves) => Ok(text_result("Othello legal moves", json!({ "moves": moves }))),
                    Err(error) => Ok(error_result(error)),
                }
            }
            ToolKind::OthelloPlayMove => self.play_move_result(
                "Updated Othello game state. IMPORTANT: if you are in a turn loop, continue with MCP tool calls. NEVER reply in chat until this move cycle is complete.",
                args,
                |input: PointMoveInput| {
                    json!({
                        "point": input.point,
                        "actorKind": SessionActorKind::Agent,
                        "channel": SessionChannel::Mcp,
                        "reasoning": input.reasoning,
                    })
                },
                |input: &PointMoveInput| &input.session_id,
            ).await,
            ToolKind::OthelloPlayMoveAndWait => self.play_move_and_wait_result(
                "Played one Othello move and waited until the opponent replied and the turn came back. IMPORTANT: this tool is for one foreground blocking MCP call, not a detached background process. Your MCP client request timeout must be greater than timeoutMs; prefer 600000 ms for long local play. If the status is ready, re-read the state and call the next move tool immediately. If the user asked for a full game, repeat this cycle until the game finishes. NEVER send a chat reply before you either play the next move or decide to stop.",
                args,
                |input: PointMoveAndWaitInput| {
                    (
                        input.session_id,
                        json!({
                            "point": input.point,
                            "actorKind": SessionActorKind::Agent,
                            "channel": SessionChannel::Mcp,
                            "reasoning": input.reasoning,
                        }),
                        input.timeout_ms,
                    )
                },
            ).await,
        }
    }

    async fn play_move_result<T, F, G>(
        &self,
        title: &str,
        args: Option<JsonObject>,
        build_input: F,
        get_session_id: G,
    ) -> Result<CallToolResult, McpError>
    where
        T: DeserializeOwned,
        F: FnOnce(T) -> Value,
        G: Fn(&T) -> &str,
    {
        let params: T = parse_params(args)?;
        let session_id = get_session_id(&params).to_string();
        match self
            .runtime
            .play_move(&session_id, build_input(params))
            .await
        {
            Ok(session) => Ok(text_result(
                title,
                serde_json::to_value(session).unwrap_or(Value::Null),
            )),
            Err(error) => Ok(error_result(error)),
        }
    }

    async fn play_move_and_wait_result<T, F>(
        &self,
        title: &str,
        args: Option<JsonObject>,
        build_input: F,
    ) -> Result<CallToolResult, McpError>
    where
        T: DeserializeOwned,
        F: FnOnce(T) -> (String, Value, Option<u64>),
    {
        let params: T = parse_params(args)?;
        let (session_id, move_input, timeout_ms) = build_input(params);
        match self
            .runtime
            .play_move_and_wait(&session_id, move_input, timeout_ms)
            .await
        {
            Ok(result) => Ok(text_result(
                title,
                json!({
                    "status": result.status,
                    "session": result.session,
                    "event": result.event,
                    "playedSession": result.played_session,
                    "playedEvent": result.played_event,
                }),
            )),
            Err(error) => Ok(error_result(error)),
        }
    }
}

impl ServerHandler for HumanAgentPlaygroundMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: Default::default(),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: "human-agent-playground".to_string(),
                title: Some("Human Agent Playground MCP Server".to_string()),
                version: env!("CARGO_PKG_VERSION").to_string(),
                icons: None,
                website_url: None,
            },
            instructions: Some(
                "Human Agent Playground MCP Server - Shared sessions for Xiangqi, Chess, Gomoku, Connect Four, and Othello. Use list_games and list_sessions to discover sessions, create_session to start one, get_game_state to inspect the board, wait_for_turn for blocking shared-play loops, and the game-specific *_play_move or *_play_move_and_wait tools to play exactly one move."
                    .to_string(),
            ),
        }
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult {
            meta: None,
            next_cursor: None,
            tools: self
                .tool_catalog
                .iter()
                .map(|entry| self.build_tool(entry))
                .collect(),
        })
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, McpError> {
        self.execute_tool(request).await
    }
}

fn parse_params<T: DeserializeOwned>(args: Option<JsonObject>) -> Result<T, McpError> {
    serde_json::from_value(Value::Object(args.unwrap_or_default()))
        .map_err(|error| McpError::invalid_params(format!("Invalid parameters: {error}"), None))
}

fn text_result(title: &str, payload: Value) -> CallToolResult {
    let pretty = serde_json::to_string_pretty(&payload).unwrap_or_else(|_| payload.to_string());
    let mut result = CallToolResult::success(vec![Content::text(format!("{title}\n{pretty}"))]);
    result.structured_content = Some(json!({ "payload": payload }));
    result
}

fn error_result(error: hap_runtime::RuntimeError) -> CallToolResult {
    let payload = json!({
        "error": {
            "message": error.message(),
            "code": error.code(),
            "details": error.details(),
        }
    });
    let mut result = CallToolResult::error(vec![Content::text(error.message().to_string())]);
    result.structured_content = Some(payload);
    result
}

fn build_tool_catalog() -> Vec<ToolCatalogEntry> {
    vec![
        tool::<EmptyParams>(
            "list_games",
            "List Games",
            "List the game adapters currently exposed by the playground server.",
            "catalog",
            None,
            &["platform", "games", "discovery"],
            ToolKind::ListGames,
            true,
            false,
            true,
            false,
        ),
        tool::<EmptyParams>(
            "list_sessions",
            "List Sessions",
            "List active playground sessions. Use this to discover shared human-agent matches and their game ids.",
            "catalog",
            None,
            &["platform", "sessions", "discovery"],
            ToolKind::ListSessions,
            true,
            false,
            true,
            false,
        ),
        tool::<SearchToolsInput>(
            "search_tools",
            "Search Tools",
            "Search the playground MCP tool catalog by query, category, game id, or tags. Use this when the server exposes many tools.",
            "catalog",
            None,
            &["platform", "tools", "search", "discovery"],
            ToolKind::SearchTools,
            true,
            false,
            true,
            false,
        ),
        tool::<CreateSessionToolInput>(
            "create_session",
            "Create Session",
            "Create a new shared session for one game.",
            "session",
            None,
            &["platform", "sessions", "create"],
            ToolKind::CreateSession,
            false,
            false,
            false,
            false,
        ),
        tool::<SessionIdInput>(
            "get_game_state",
            "Get Game State",
            "Get the current board, turn, move history summary, winner, and status for a session.",
            "session",
            None,
            &["platform", "sessions", "state", "read"],
            ToolKind::GetGameState,
            true,
            false,
            true,
            false,
        ),
        tool::<WaitForTurnToolInput>(
            "wait_for_turn",
            "Wait For Turn",
            "Wait until a session advances and it becomes the expected side’s turn, or until the game finishes or the timeout expires. This tool is intended for one foreground blocking MCP call, not a detached terminal loop, background watcher, or shell polling script. IMPORTANT: your MCP client request timeout must be higher than timeoutMs. For long local shared play, prefer a client request timeout of 600000 ms when you want up to ten minutes of waiting. IMPORTANT: when this returns ready, do not send a chat reply first. NEVER answer the user before you continue with MCP tool calls. Stop waiting, re-read the latest state, and continue until you either play exactly one move or decide to stop.",
            "session",
            None,
            &["platform", "sessions", "wait", "turn"],
            ToolKind::WaitForTurn,
            true,
            false,
            false,
            false,
        ),
        tool::<SessionIdInput>(
            "reset_session",
            "Reset Session",
            "Reset a session back to that game’s default opening position.",
            "session",
            None,
            &["platform", "sessions", "reset"],
            ToolKind::ResetSession,
            false,
            true,
            true,
            false,
        ),
        tool::<XiangqiLegalMovesInput>(
            "xiangqi_get_legal_moves",
            "Xiangqi Legal Moves",
            "List legal Xiangqi moves for a session. Use this as the source of truth for Xiangqi move legality. Provide `from` to narrow the result to one piece, or omit it to inspect the whole position.",
            "gameplay",
            Some("xiangqi"),
            &["xiangqi", "moves", "legal", "read"],
            ToolKind::XiangqiGetLegalMoves,
            true,
            false,
            true,
            false,
        ),
        tool::<XiangqiPlayMoveInput>(
            "xiangqi_play_move",
            "Play Xiangqi Move",
            "Play exactly one Xiangqi move for the current side to move. Re-read the latest state first, inspect legal moves, and submit a fresh reasoning summary for this exact move. IMPORTANT: in a long-running turn loop, this tool call is the response. NEVER stop to send a chat reply before moving. NEVER send cached explanations or a multi-move plan.",
            "gameplay",
            Some("xiangqi"),
            &["xiangqi", "moves", "play", "write"],
            ToolKind::XiangqiPlayMove,
            false,
            true,
            false,
            false,
        ),
        tool::<XiangqiPlayMoveAndWaitInput>(
            "xiangqi_play_move_and_wait",
            "Play Xiangqi Move And Wait",
            "Play exactly one Xiangqi move for the current side to move, then keep waiting inside the MCP server until the opponent completes exactly one reply and it is that same side’s turn again, the game finishes, or the timeout expires. Prefer this in long-running human-agent shared play because it keeps play and wait inside one MCP tool call. Use it as one foreground blocking MCP call, not inside a detached terminal loop or background polling script. IMPORTANT: your MCP client request timeout must be greater than timeoutMs. For long local interactive play, prefer 600000 ms when you want up to ten minutes of waiting. IMPORTANT: when this returns ready, re-read the state and call the next move tool immediately. If the user asked for a full game, keep repeating this cycle until the game finishes. NEVER treat the move submission as the end of the run.",
            "gameplay",
            Some("xiangqi"),
            &["xiangqi", "moves", "play", "wait", "turn", "write"],
            ToolKind::XiangqiPlayMoveAndWait,
            false,
            true,
            false,
            false,
        ),
        tool::<ChessLegalMovesInput>(
            "chess_get_legal_moves",
            "Chess Legal Moves",
            "List legal Chess moves for a session. Omit `from` to inspect every legal move, or provide one square to inspect the legal moves from that square only.",
            "gameplay",
            Some("chess"),
            &["chess", "moves", "legal", "read"],
            ToolKind::ChessGetLegalMoves,
            true,
            false,
            true,
            false,
        ),
        tool::<ChessPlayMoveInput>(
            "chess_play_move",
            "Play Chess Move",
            "Play exactly one Chess move for the side to move. Re-read the latest state first, inspect legal moves, and submit a fresh reasoning summary for this exact move. IMPORTANT: in a long-running turn loop, this tool call is the response. NEVER stop to send a chat reply before moving. NEVER send cached explanations or a multi-move plan.",
            "gameplay",
            Some("chess"),
            &["chess", "moves", "play", "write"],
            ToolKind::ChessPlayMove,
            false,
            true,
            false,
            false,
        ),
        tool::<ChessPlayMoveAndWaitInput>(
            "chess_play_move_and_wait",
            "Play Chess Move And Wait",
            "Play exactly one Chess move for the current side to move, then keep waiting inside the MCP server until the opponent completes exactly one reply and it is that same side’s turn again, the game finishes, or the timeout expires. Prefer this in long-running human-agent shared play because it keeps play and wait inside one MCP tool call. Use it as one foreground blocking MCP call, not inside a detached terminal loop or background polling script. IMPORTANT: your MCP client request timeout must be greater than timeoutMs. For long local interactive play, prefer 600000 ms when you want up to ten minutes of waiting. IMPORTANT: when this returns ready, re-read the state and call the next move tool immediately. If the user asked for a full game, keep repeating this cycle until the game finishes. NEVER treat the move submission as the end of the run.",
            "gameplay",
            Some("chess"),
            &["chess", "moves", "play", "wait", "turn", "write"],
            ToolKind::ChessPlayMoveAndWait,
            false,
            true,
            false,
            false,
        ),
        tool::<PointQueryInput>(
            "gomoku_get_legal_moves",
            "Gomoku Legal Moves",
            "List legal Gomoku placements for a session. Omit `point` to inspect every open intersection, or provide `point` to verify one candidate placement.",
            "gameplay",
            Some("gomoku"),
            &["gomoku", "moves", "legal", "read"],
            ToolKind::GomokuGetLegalMoves,
            true,
            false,
            true,
            false,
        ),
        tool::<PointMoveInput>(
            "gomoku_play_move",
            "Play Gomoku Move",
            "Play exactly one Gomoku move for the current side to move. Re-read the latest state first, inspect legal points, and submit a fresh reasoning summary for this exact placement. IMPORTANT: in a long-running turn loop, this tool call is the response. NEVER stop to send a chat reply before moving. NEVER send cached explanations or a multi-move plan.",
            "gameplay",
            Some("gomoku"),
            &["gomoku", "moves", "play", "write"],
            ToolKind::GomokuPlayMove,
            false,
            true,
            false,
            false,
        ),
        tool::<PointMoveAndWaitInput>(
            "gomoku_play_move_and_wait",
            "Play Gomoku Move And Wait",
            "Play exactly one Gomoku move for the current side to move, then keep waiting inside the MCP server until the opponent completes exactly one reply and it is that same side’s turn again, the game finishes, or the timeout expires. Prefer this in long-running human-agent shared play because it keeps play and wait inside one MCP tool call. Use it as one foreground blocking MCP call, not inside a detached terminal loop or background polling script. IMPORTANT: your MCP client request timeout must be greater than timeoutMs. For long local interactive play, prefer 600000 ms when you want up to ten minutes of waiting. IMPORTANT: when this returns ready, re-read the state and call the next move tool immediately. If the user asked for a full game, keep repeating this cycle until the game finishes. NEVER treat the move submission as the end of the run.",
            "gameplay",
            Some("gomoku"),
            &["gomoku", "moves", "play", "wait", "turn", "write"],
            ToolKind::GomokuPlayMoveAndWait,
            false,
            true,
            false,
            false,
        ),
        tool::<ConnectFourQueryInput>(
            "connect_four_get_legal_moves",
            "Connect Four Legal Moves",
            "List legal Connect Four drops for a session. Omit `column` to inspect every playable column, or provide `column` to verify one candidate drop.",
            "gameplay",
            Some("connect-four"),
            &["connect-four", "moves", "legal", "read"],
            ToolKind::ConnectFourGetLegalMoves,
            true,
            false,
            true,
            false,
        ),
        tool::<ConnectFourMoveInput>(
            "connect_four_play_move",
            "Play Connect Four Move",
            "Drop exactly one Connect Four disc in the current column. Re-read the latest state first, inspect legal columns, and submit a fresh reasoning summary for this exact drop. IMPORTANT: in a long-running turn loop, this tool call is the response. NEVER stop to send a chat reply before moving. NEVER send cached explanations or a multi-move plan.",
            "gameplay",
            Some("connect-four"),
            &["connect-four", "moves", "play", "write"],
            ToolKind::ConnectFourPlayMove,
            false,
            true,
            false,
            false,
        ),
        tool::<ConnectFourMoveAndWaitInput>(
            "connect_four_play_move_and_wait",
            "Play Connect Four Move And Wait",
            "Play exactly one Connect Four move for the current side to move, then keep waiting inside the MCP server until the opponent completes exactly one reply and it is that same side’s turn again, the game finishes, or the timeout expires. Prefer this in long-running human-agent shared play because it keeps play and wait inside one MCP tool call. Use it as one foreground blocking MCP call, not inside a detached terminal loop or background polling script. IMPORTANT: your MCP client request timeout must be greater than timeoutMs. For long local interactive play, prefer 600000 ms when you want up to ten minutes of waiting. IMPORTANT: when this returns ready, re-read the state and call the next move tool immediately. If the user asked for a full game, keep repeating this cycle until the game finishes. NEVER treat the move submission as the end of the run.",
            "gameplay",
            Some("connect-four"),
            &["connect-four", "moves", "play", "wait", "turn", "write"],
            ToolKind::ConnectFourPlayMoveAndWait,
            false,
            true,
            false,
            false,
        ),
        tool::<PointQueryInput>(
            "othello_get_legal_moves",
            "Othello Legal Moves",
            "List legal Othello placements for a session. Omit `point` to inspect every legal square, or provide `point` to verify one candidate move and the discs it would flip.",
            "gameplay",
            Some("othello"),
            &["othello", "moves", "legal", "read"],
            ToolKind::OthelloGetLegalMoves,
            true,
            false,
            true,
            false,
        ),
        tool::<PointMoveInput>(
            "othello_play_move",
            "Play Othello Move",
            "Play exactly one Othello move for the current side to move. Re-read the latest state first, inspect legal points, and submit a fresh reasoning summary for this exact placement. IMPORTANT: in a long-running turn loop, this tool call is the response. NEVER stop to send a chat reply before moving. NEVER send cached explanations or a multi-move plan.",
            "gameplay",
            Some("othello"),
            &["othello", "moves", "play", "write"],
            ToolKind::OthelloPlayMove,
            false,
            true,
            false,
            false,
        ),
        tool::<PointMoveAndWaitInput>(
            "othello_play_move_and_wait",
            "Play Othello Move And Wait",
            "Play exactly one Othello move for the current side to move, then keep waiting inside the MCP server until the opponent completes exactly one reply and it is that same side’s turn again, the game finishes, or the timeout expires. Prefer this in long-running human-agent shared play because it keeps play and wait inside one MCP tool call. Use it as one foreground blocking MCP call, not inside a detached terminal loop or background polling script. IMPORTANT: your MCP client request timeout must be greater than timeoutMs. For long local interactive play, prefer 600000 ms when you want up to ten minutes of waiting. IMPORTANT: when this returns ready, re-read the state and call the next move tool immediately. If the user asked for a full game, keep repeating this cycle until the game finishes. NEVER treat the move submission as the end of the run.",
            "gameplay",
            Some("othello"),
            &["othello", "moves", "play", "wait", "turn", "write"],
            ToolKind::OthelloPlayMoveAndWait,
            false,
            true,
            false,
            false,
        ),
    ]
}

#[allow(clippy::too_many_arguments)]
fn tool<T>(
    name: &'static str,
    title: &'static str,
    description: &'static str,
    category: &'static str,
    game_id: Option<&'static str>,
    tags: &'static [&'static str],
    kind: ToolKind,
    read_only: bool,
    destructive: bool,
    idempotent: bool,
    open_world: bool,
) -> ToolCatalogEntry
where
    T: JsonSchema + 'static,
{
    ToolCatalogEntry {
        name,
        title,
        description,
        category,
        game_id,
        tags,
        annotations: ToolAnnotations::with_title(title)
            .read_only(read_only)
            .destructive(destructive)
            .idempotent(idempotent)
            .open_world(open_world),
        input_schema: schema_for_type::<T>(),
        kind,
    }
}

fn serialize_tool_catalog_entry(entry: &ToolCatalogEntry) -> ToolSearchResult {
    ToolSearchResult {
        name: entry.name.to_string(),
        title: entry.title.to_string(),
        description: entry.description.to_string(),
        category: entry.category.to_string(),
        game_id: entry.game_id.map(str::to_string),
        tags: entry.tags.iter().map(|tag| (*tag).to_string()).collect(),
    }
}

fn list_tool_categories(entries: &[ToolCatalogEntry]) -> Vec<String> {
    let mut categories = entries
        .iter()
        .map(|entry| entry.category.to_string())
        .collect::<Vec<_>>();
    categories.sort();
    categories.dedup();
    categories
}

fn search_tool_catalog(
    entries: &[ToolCatalogEntry],
    query: Option<&str>,
    category: Option<&str>,
    game_id: Option<&str>,
    tags: &[String],
    limit: u32,
) -> Vec<ToolSearchResult> {
    let normalized_query = query
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let normalized_category = category
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let normalized_game_id = game_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let normalized_tags = tags
        .iter()
        .map(|tag| tag.trim().to_lowercase())
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();
    let limit = limit.clamp(1, 50) as usize;

    let mut matches = entries
        .iter()
        .filter_map(|entry| {
            score_tool_catalog_entry(
                entry,
                normalized_query.as_deref(),
                normalized_category.as_deref(),
                normalized_game_id.as_deref(),
                &normalized_tags,
            )
            .map(|score| (entry, score))
        })
        .collect::<Vec<_>>();

    matches.sort_by(|left, right| {
        right
            .1
            .cmp(&left.1)
            .then_with(|| left.0.category.cmp(right.0.category))
            .then_with(|| left.0.name.cmp(right.0.name))
    });

    matches
        .into_iter()
        .take(limit)
        .map(|(entry, _)| serialize_tool_catalog_entry(entry))
        .collect()
}

fn score_tool_catalog_entry(
    entry: &ToolCatalogEntry,
    query: Option<&str>,
    category: Option<&str>,
    game_id: Option<&str>,
    tags: &[String],
) -> Option<i32> {
    let entry_category = entry.category.to_lowercase();
    let entry_game_id = entry.game_id.map(str::to_lowercase);
    let entry_tags = entry
        .tags
        .iter()
        .map(|tag| tag.to_lowercase())
        .collect::<Vec<_>>();

    if let Some(category) = category
        && entry_category != category
    {
        return None;
    }

    if let Some(game_id) = game_id
        && entry_game_id.as_deref() != Some(game_id)
    {
        return None;
    }

    if !tags.is_empty() && !tags.iter().all(|tag| entry_tags.contains(tag)) {
        return None;
    }

    let Some(query) = query else {
        return Some(1);
    };

    let haystacks = [
        Cow::Borrowed(entry.name),
        Cow::Borrowed(entry.title),
        Cow::Borrowed(entry.description),
        Cow::Owned(entry_category),
        Cow::Owned(entry_game_id.unwrap_or_default()),
    ]
    .into_iter()
    .chain(entry_tags.iter().cloned().map(Cow::Owned))
    .collect::<Vec<_>>();

    let mut score = 0;
    for value in haystacks {
        if value == query {
            score += 30;
        } else if value.starts_with(query) {
            score += 15;
        } else if value.contains(query) {
            score += 5;
        }
    }

    (score > 0).then_some(score)
}
