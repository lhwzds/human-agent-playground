# Human Agent Playground

Human Agent Playground is a public TypeScript monorepo for shared game sessions between humans and AI agents.

One session can be reached from:

- a web UI for humans
- an HTTP API for local services
- an MCP server for Codex, Cloud Code, or any MCP-compatible agent

## UI preview

![Human Agent Playground web UI](./docs/images/playground-ui.png)

## What this project is for

This project is not just a board renderer.
It is a session platform where:

- humans and agents read the same game state
- MCP tools operate on the same match the UI is showing
- each game lives in its own folder and adapter package
- UI, HTTP, and MCP all act on the same shared session model

## Current implementation

The first concrete game is Xiangqi.

Already implemented:

- Xiangqi rules engine in a standalone game package
- session persistence on disk
- game catalog API
- React UI with session creation, live board rendering, and move inspection
- live session sync over SSE
- MCP tools for listing games, creating sessions, reading state, listing legal moves, and playing moves

## Workspace layout

```text
apps/
  server/          HTTP API + MCP Streamable HTTP server
  web/             React + Vite UI
packages/
  core/            shared platform contracts
games/
  xiangqi/         Xiangqi adapter, rules, state, move schema, tests
docs/
  ARCHITECTURE.md  platform direction for multi-game and AI-only play
```

## Run locally

```bash
npm install
npm run dev:server
npm run dev:web
```

For fixed local ports instead of the default Vite dev port:

```bash
npm --prefix apps/server run start
npm --prefix apps/web run start
```

Default local endpoints:

- server health: `http://127.0.0.1:8787/health`
- HTTP API: `http://127.0.0.1:8787/api`
- MCP endpoint: `http://127.0.0.1:8787/mcp`
- web UI with `apps/web start`: `http://127.0.0.1:4173`

Validation:

```bash
npm test
npm run check
npm run build
```

## Environment

- `PORT`: HTTP server port, default `8787`
- `HUMAN_AGENT_PLAYGROUND_DATA_PATH`: session storage path
- `VITE_API_URL`: web UI API base URL, default `http://127.0.0.1:8787`

MCP endpoint:

- `http://127.0.0.1:8787/mcp` via Streamable HTTP

## Current MCP tools

- `list_games`
- `list_sessions`
- `create_session`
- `get_game_state`
- `xiangqi_get_legal_moves`
- `xiangqi_play_move`
- `reset_session`

## How to play from the UI

1. Start the server and web app.
2. Open the web UI and click `Create Session`.
3. Select a piece on the board to inspect legal targets.
4. Click a highlighted target square to play a move.
5. Watch the side panel for the current turn, last move, and recent activity.

## Shared human + agent play

Humans and agents can already play in the same session.

One practical flow is:

1. A human creates or opens a session in the web UI.
2. The agent connects to the MCP endpoint and discovers the same session with `list_sessions`.
3. The agent inspects the position with `get_game_state` and `xiangqi_get_legal_moves`.
4. The agent plays a move with `xiangqi_play_move`.
5. The web UI updates live through the session stream.

The current implementation only ships one concrete game, Xiangqi, so the move tools are Xiangqi-specific.

## Use the MCP server

This project exposes MCP over Streamable HTTP at:

- `http://127.0.0.1:8787/mcp`

A typical client configuration looks like:

```json
{
  "mcpServers": {
    "human-agent-playground": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:8787/mcp"
    }
  }
}
```

Recommended tool order for agents:

1. `list_games`
2. `list_sessions` or `create_session`
3. `get_game_state`
4. `xiangqi_get_legal_moves`
5. `xiangqi_play_move`
6. `get_game_state` again when you need confirmation

## Agent skill

An agent-oriented workflow guide lives in [skills/human-agent-playground-mcp/SKILL.md](./skills/human-agent-playground-mcp/SKILL.md).

## Roadmap direction

1. Add more games under `games/*`, such as Go or other tabletop systems.
2. Add a registry-based server executor so each session dispatches to the correct game adapter.
3. Add agent-vs-agent runners that can drive sessions without a human click loop.
4. Add session resumption and event replay for the Streamable HTTP transport.
5. Add richer presence, actor metadata, and watcher tooling on top of the shared session stream.

Architecture details live in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
