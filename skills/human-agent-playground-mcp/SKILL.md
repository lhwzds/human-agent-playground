---
name: human-agent-playground-mcp
description: Use this skill when you need to connect to the Human Agent Playground MCP server, create or join a shared board-game session, inspect legal moves, and play moves that stay synchronized with the web UI.
---

# Human Agent Playground MCP

Use this skill when the task is to operate the local Human Agent Playground through MCP instead of calling internal code directly.

If the task also needs Chess rule knowledge, notation help, or special-move reminders, pair this skill with [../human-agent-playground-chess/SKILL.md](../human-agent-playground-chess/SKILL.md).

## What this server exposes

The MCP endpoint depends on how the local server was started.

Common local endpoints are:

- `http://127.0.0.1:8787/mcp`
- `http://127.0.0.1:8790/mcp`
- `http://127.0.0.1:8794/mcp`

Always use the endpoint the user actually started.

This is a multi-game playground. Current built-in games include:

- `xiangqi`
- `chess`
- `gomoku`
- `connect-four`
- `othello`

## Context

This project is a shared human-agent board-game table, not a one-shot command runner.

- The human may act in the web UI while the agent acts through MCP.
- Both sides write into the same session and see the same board state.
- In turn-based shared play, one move cycle is:
  1. wait for your turn
  2. re-read the live state
  3. inspect legal moves
  4. play exactly one move
- The move cycle is not complete until the move is played or the agent explicitly decides to stop.

For hosts that support long-running MCP task execution, the correct behavior is to keep calling MCP tools inside the same run. Do not treat `wait_for_turn` as the end of the task.

Once a game has started, the objective is not "make one move." The objective is "keep the session running correctly until the game is finished or the user stops it."

## Why these rules exist

- `wait_for_turn` exists so the wait happens inside the MCP server instead of client-side sleep polling.
- The web UI and MCP are two views over the same session, so the agent must always re-read state after waiting.
- If the agent replies in chat immediately after `wait_for_turn` returns `ready`, the turn loop is broken and the user has to prompt again.
- If the user asked for a complete game, the agent should not stop after one move cycle. It should keep chaining the next move cycle until the game finishes or the user interrupts it.
- `search_tools` exists because the server now exposes multiple game-specific tool families.
- Game-specific legal move tools are the source of truth for move legality, so the agent must not invent moves from memory.
- `reasoning` must be generated for the current position because the server stores reasoning but does not author it for the agent.
- Cached explanations are misleading because they describe a generic idea instead of the actual current board.
- Multi-move plans are unsafe in shared play because the human can change the position before the later moves happen.

## Recommended workflow

1. Confirm the playground server is running.
2. Use `list_games` to confirm the target `gameId`.
3. Use `search_tools` when you need to discover tools by category, game id, tags, or free-text query.
4. Use `list_sessions` to discover an existing shared session when a human is already using the UI.
5. If no suitable session exists, call `create_session` with the desired `gameId`.
6. Use `get_game_state` before making decisions.
7. If the task is turn-based shared play, use `wait_for_turn` instead of client-side sleep loops.
8. Use the game-specific legal move tool before every move.
9. In long-running shared play, prefer the game-specific `*_play_move_and_wait` tool so the play-and-wait cycle stays inside one MCP tool call.
10. Use the game-specific `*_play_move` tool only when you intentionally want separate low-level control over play and wait.
11. Re-check `get_game_state` after the move when you need confirmation or a summary.

## Tool guide

Platform tools:

- `list_games`
- `list_sessions`
- `search_tools`
- `create_session`
- `get_game_state`
- `wait_for_turn`
- `reset_session`

Game-specific tool families:

- Xiangqi:
  - `xiangqi_get_legal_moves`
  - `xiangqi_play_move`
  - `xiangqi_play_move_and_wait`
- Chess:
  - `chess_get_legal_moves`
  - `chess_play_move`
  - `chess_play_move_and_wait`
- Gomoku:
  - `gomoku_get_legal_moves`
  - `gomoku_play_move`
  - `gomoku_play_move_and_wait`
- Connect Four:
  - `connect_four_get_legal_moves`
  - `connect_four_play_move`
  - `connect_four_play_move_and_wait`
- Othello:
  - `othello_get_legal_moves`
  - `othello_play_move`
  - `othello_play_move_and_wait`

## Shared play rules

- Prefer joining an existing session when the user is coordinating with a human in the web UI.
- Always report the `sessionId` you are using when coordination matters.
- Treat the web UI and MCP as two views over the same session, not as separate games.
- The web UI updates live after MCP moves, so a human can watch the same board while the agent plays.
- Prefer `search_tools` before guessing tool names on servers that expose many game-specific tools.
- In turn-based shared play, prefer `wait_for_turn` over client-side `sleep` polling.
- In long-running shared play, prefer the matching `*_play_move_and_wait` tool over manually chaining `*_play_move` and `wait_for_turn`.
- Treat one `*_play_move_and_wait` call as one full move cycle: your move, one opponent reply, then your turn again.
- When `wait_for_turn` returns `ready`, stop waiting immediately, re-read the state, and decide one move now.
- Use these waits as foreground blocking MCP calls. Do not wrap them in a detached terminal loop, background watcher, or shell polling script when the user explicitly asked for real-time blocking play.
- If the host enforces a per-request MCP timeout, make it greater than the tool `timeoutMs`. For long local interactive play in this project, prefer `600000` ms on the client when the user wants up to ten minutes of waiting.

## Guardrails

- Never invent coordinates. Use the notation that belongs to the current game.
- Never play a move without checking the matching legal move tool first. Treat it as the source of truth for rules.
- Do not assume a session is new. Read `get_game_state` before acting.
- Use `reset_session` only when the user explicitly wants to restart the game.
- Never queue multiple future moves.
- Every game-specific `*_play_move` or `*_play_move_and_wait` call must include freshly written reasoning for the current position.
- The server stores agent reasoning but does not author it on the agent's behalf.
- The reasoning must explain only the current move, not a whole future line.
- Include at least one `reasoningSteps` item in every agent move.
- IMPORTANT: when `wait_for_turn` returns `ready`, continue with MCP tool calls immediately.
- NEVER send a chat reply before you have either played exactly one move or explicitly decided to stop.
- NEVER treat `wait_for_turn` returning `ready` as permission to stop the current run.
- NEVER open a detached terminal loop or background watcher just to keep waiting for the next turn when the user asked for real-time MCP blocking behavior.
- IMPORTANT: `wait_for_turn` and every matching `*_play_move_and_wait` call should be used as a single foreground blocking MCP call.
- IMPORTANT: when you want one tool call to cover both the move and the next wait, use the matching `*_play_move_and_wait`.
- NEVER treat `*_play_move_and_wait` returning after the move is submitted as acceptable behavior; it must wait for the next cycle or a terminal result.
- IMPORTANT: if the user asked for a complete game, start the next `*_play_move_and_wait` cycle immediately after every `ready` result.
- NEVER stop after one successful cycle when the user explicitly asked for a full game.
- IMPORTANT: when the user asks for a longer wait, raise both the tool `timeoutMs` and the MCP client request timeout together. For a ten-minute wait, use `600000` ms on the client and a matching or lower value in the tool call.

## Practical patterns

### Once the game has started

After a session exists and the side assignment is clear, use this mental model:

1. The current tool call is only one cycle in a longer match.
2. `*_play_move_and_wait` means:
   - play one move now
   - wait for exactly one opponent reply inside the MCP server
   - return only when it is your turn again, the game has finished, or the timeout has expired
3. A `ready` result is not a stopping point. It means the next cycle must begin now.
4. If the user asked for a complete game, keep chaining the next `*_play_move_and_wait` call immediately after every `ready` result until `finished`.
5. Do not chat between cycles. Re-read the live state, inspect legal moves, generate fresh reasoning, and continue.

### How humans should prompt the agent

Good prompts explicitly say all of the following:

- this is one full game
- keep using the matching `*_play_move_and_wait` tool
- do not stop after one move
- do not answer in chat between turns
- stop only when the game is `finished` or blocked

Example prompt:

```text
Create or join one Chess session, make the first move if needed, and then keep using chess_play_move_and_wait until the game finishes. Do not stop after one move cycle. Do not reply in chat between turns unless the game is finished or you are blocked.
```

### Join a human's session

1. Call `list_sessions`.
2. Pick the session the user is referring to.
3. Call `get_game_state`.
4. If it is not your turn, store the latest event id and call `wait_for_turn`.
5. When `wait_for_turn` returns `ready`, call `get_game_state` again.
6. Call the game-specific legal move tool.
7. Prefer the game-specific `*_play_move_and_wait` tool with fresh move-specific reasoning.
8. Use the game-specific `*_play_move` tool only when you need low-level debugging control.

### Start a fresh session

1. Call `create_session` with the desired `gameId`.
2. Share the returned `sessionId`.
3. Call `get_game_state`.
4. Begin normal move inspection and play.

### Long-running turn loop in one agent run

Use this pattern when the host can keep one task or one reply alive for repeated MCP calls:

1. Call `get_game_state`.
2. Read the latest `session.events` item and save its `id` as `afterEventId`.
3. If the current turn is not the agent's side, call `wait_for_turn`.
4. When `wait_for_turn` returns:
   - `ready`: continue with MCP immediately and make one move
   - `finished`: stop
   - `timeout`: decide whether to stop or wait again
5. Re-read `get_game_state`.
6. Call the matching legal move tool.
7. Prefer the matching `*_play_move_and_wait`, including fresh reasoning for that move, so the tool itself covers the next wait.
8. Treat one `*_play_move_and_wait` result with `status: "ready"` as: your move was played, the opponent answered once, and it is your turn again now.
9. Re-read `get_game_state`, inspect fresh legal moves, and call the next `*_play_move_and_wait` immediately.
10. If the user asked for a complete game, keep repeating step 9 until the result becomes `finished`.
11. Use `*_play_move` only if you intentionally want to split play and wait into separate MCP calls.
12. NEVER answer in chat between step 4 and step 10.
13. NEVER replace this foreground blocking pattern with a detached terminal loop or background watcher when the user explicitly asked for real-time MCP waiting.
