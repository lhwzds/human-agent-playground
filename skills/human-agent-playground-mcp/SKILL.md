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
3. Use `list_sessions` to discover an existing shared session when a human is already using the UI.
4. If no suitable session exists, call `create_session` with `gameId: "xiangqi"`.
5. Use `get_game_state` before making decisions.
6. Use `xiangqi_get_legal_moves` before every move. Provide `from` when you want to inspect one piece.
7. Choose a move from the returned legal move set and call `xiangqi_play_move`.
8. Re-check `get_game_state` after the move when you need confirmation or a summary.

## Tool guide

- `list_games`: discover supported game ids
- `list_sessions`: discover active shared sessions
- `create_session`: create a new session for one game
- `get_game_state`: read board state, turn, winner, last move, and history summary
- `xiangqi_get_legal_moves`: inspect legal Xiangqi moves
- `xiangqi_play_move`: play one legal Xiangqi move
- `reset_session`: reset a session to the default opening position

## Shared play rules

- Prefer joining an existing session when the user is coordinating with a human in the web UI.
- Always report the `sessionId` you are using when coordination matters.
- Treat the web UI and MCP as two views over the same session, not as separate games.
- The web UI updates live after MCP moves, so a human can watch the same board while the agent plays.

## Guardrails

- Never invent Xiangqi coordinates. Use squares like `a4`, `e3`, or `h10`.
- Never play a move without checking `xiangqi_get_legal_moves` first.
- Do not assume a session is new. Read `get_game_state` before acting.
- Use `reset_session` only when the user explicitly wants to restart the game.

## Practical patterns

### Join a human's session

1. Call `list_sessions`.
2. Pick the Xiangqi session the user is referring to.
3. Call `get_game_state`.
4. Call `xiangqi_get_legal_moves`.
5. Play exactly one move with `xiangqi_play_move`.

### Start a fresh session

1. Call `create_session` with `gameId: "xiangqi"`.
2. Share the returned `sessionId`.
3. Call `get_game_state`.
4. Begin normal move inspection and play.
