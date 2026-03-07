# Architecture

## Design Goal

Human Agent Playground should support multiple tabletop games without forcing the UI, HTTP API, or MCP layer to be rewritten per game.

The platform should let:

- a human play through the web UI
- one or more agents play through MCP
- sessions switch between human-vs-agent, human-vs-human, and agent-vs-agent modes

## Structure

### Platform Layer

`packages/core`

- session input schema
- session mode enum
- game catalog contract
- shared platform-level types

`apps/server`

- persistent session storage
- game catalog endpoint
- session creation and move APIs
- MCP tools that proxy into the same session store

`apps/web`

- game selector
- mode selector
- shared session inspector
- game-specific board renderers

### Game Layer

`games/<game-id>`

Each game folder should own:

- game metadata
- state schema
- action schema
- rules engine
- rendering helpers
- tests

Today:

- `games/xiangqi`

Future examples:

- `games/go`
- `games/chess`
- `games/poker`

## Session Model

A session should carry:

- `gameId`
- `mode`
- `state`
- timestamps
- optional automation / agent runner metadata later

This makes one MCP connection enough. The agent does not need a per-game MCP server. It only needs the shared playground MCP, then it chooses the game by session.

## Agent-Vs-Agent Mode

The current codebase already stores the `mode` on each session.
The built-in auto-runner is not implemented yet.

Recommended next step:

1. Add an `agent runner` service in `apps/server`
2. Let one session bind zero, one, or two agent endpoints
3. Add a tick endpoint or background loop:
   - read current game state
   - ask the assigned agent for the next action
   - validate via the game adapter
   - persist the next state
   - notify UI watchers

## MCP Strategy

Keep one MCP server for the whole platform.

That MCP server should expose platform-level tools:

- `list_games`
- `list_sessions`
- `create_session`
- `get_game_state`
- `get_legal_moves`
- `play_move`
- `reset_session`

Later it can also expose:

- `attach_agent`
- `run_agent_turn`
- `watch_session`
- `create_match_series`

## UI Strategy

The UI should stay platform-first:

- top-level game switcher
- top-level mode switcher
- session list
- per-game renderer panel

That allows the same product shell to host many games while only swapping the inner renderer and action vocabulary.
