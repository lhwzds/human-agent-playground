---
name: human-agent-playground-mcp
description: Use this skill when you need to connect to the Human Agent Playground MCP server, create or join a shared Xiangqi session, inspect legal moves, and play moves that stay synchronized with the web UI.
---

# Human Agent Playground MCP

Use this skill when the task is to operate the local Human Agent Playground through MCP instead of calling internal code directly.

## What this server exposes

The local MCP endpoint is:

- `http://127.0.0.1:8787/mcp`

The current game implementation is Xiangqi. Shared sessions are visible from both the web UI and MCP tools.

## Recommended workflow

1. Confirm the playground server is running.
2. Use `list_games` to confirm that `xiangqi` is available.
3. Use `search_tools` when you need to discover tools by category, game id, tags, or free-text query.
4. Use `list_sessions` to discover an existing shared session when a human is already using the UI.
5. If no suitable session exists, call `create_session` with `gameId: "xiangqi"`.
6. Use `get_game_state` before making decisions.
7. If the task is turn-based shared play, use `wait_for_turn` instead of client-side sleep loops.
8. Use `xiangqi_get_legal_moves` before every move. Provide `from` when you want to inspect one piece.
9. Choose a move from the returned legal move set and call `xiangqi_play_move` with fresh reasoning for that exact move.
10. Re-check `get_game_state` after the move when you need confirmation or a summary.

## Tool guide

- `list_games`: discover supported game ids
- `list_sessions`: discover active shared sessions
- `search_tools`: search tool metadata by query, category, game id, or tags
- `create_session`: create a new session for one game
- `get_game_state`: read board state, turn, winner, last move, and history summary
- `wait_for_turn`: block inside the MCP server until the session advances to the expected turn
- `xiangqi_get_legal_moves`: inspect legal Xiangqi moves
- `xiangqi_play_move`: play one legal Xiangqi move
- `reset_session`: reset a session to the default opening position

## Shared play rules

- Prefer joining an existing session when the user is coordinating with a human in the web UI.
- Always report the `sessionId` you are using when coordination matters.
- Treat the web UI and MCP as two views over the same session, not as separate games.
- The web UI updates live after MCP moves, so a human can watch the same board while the agent plays.
- Prefer `search_tools` before guessing tool names on servers that expose many game-specific tools.
- In turn-based shared play, prefer `wait_for_turn` over client-side `sleep` polling.
- When `wait_for_turn` returns `ready`, stop waiting immediately, re-read the state, and decide one move now.

## Guardrails

- Never invent Xiangqi coordinates. Use squares like `a4`, `e3`, or `h10`.
- Never play a move without checking `xiangqi_get_legal_moves` first. Treat it as the source of truth for rules.
- Do not assume a session is new. Read `get_game_state` before acting.
- Use `reset_session` only when the user explicitly wants to restart the game.
- Never queue multiple future moves.
- Every `xiangqi_play_move` call must include freshly written reasoning for the current position.
- The server stores agent reasoning but does not author it on the agent's behalf.
- The reasoning must explain only the current move, not a whole future line.
- Include at least one `reasoningSteps` item in every agent move.

## Practical patterns

### Join a human's session

1. Call `list_sessions`.
2. Pick the Xiangqi session the user is referring to.
3. Call `get_game_state`.
4. If it is not your turn, store the latest event id and call `wait_for_turn`.
5. When `wait_for_turn` returns `ready`, call `get_game_state` again.
6. Call `xiangqi_get_legal_moves`.
7. Play exactly one move with `xiangqi_play_move`, including fresh move-specific reasoning.

### Start a fresh session

1. Call `create_session` with `gameId: "xiangqi"`.
2. Share the returned `sessionId`.
3. Call `get_game_state`.
4. Begin normal move inspection and play.

### Long-running turn loop in one agent run

Use this pattern when the host can keep one task or one reply alive for repeated MCP calls:

1. Call `get_game_state`.
2. Read the latest `session.events` item and save its `id` as `afterEventId`.
3. If the current turn is not the agent's side, call `wait_for_turn`.
4. When `wait_for_turn` returns:
   - `ready`: continue and make one move
   - `finished`: stop
   - `timeout`: decide whether to stop or wait again
5. Re-read `get_game_state`.
6. Call `xiangqi_get_legal_moves`.
7. Play exactly one move with `xiangqi_play_move`, including fresh reasoning for that move.
8. Repeat only while the host still allows the same task to continue running.
