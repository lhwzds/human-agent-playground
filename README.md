# Human Agent Playground

Human Agent Playground is a public TypeScript monorepo for shared game sessions between humans and AI agents.

One session can be reached from:

- a web UI for humans
- an HTTP API for local services
- an MCP server for Codex, Cloud Code, or any MCP-compatible agent

## What this project is for

This project is not just a board renderer.
It is a session platform where:

- humans and agents read the same game state
- MCP tools operate on the same match the UI is showing
- each game lives in its own folder and adapter package
- future modes can include human-vs-agent, human-vs-human, and agent-vs-agent

## Current implementation

The first concrete game is Xiangqi.

Already implemented:

- Xiangqi rules engine in a standalone game package
- session persistence on disk
- game catalog API
- React UI with session creation, game mode selection, and move inspection
- MCP tools for listing games, creating sessions, reading state, listing legal moves, and playing moves

## Workspace layout

```text
apps/
  server/          HTTP API + MCP stdio server
  web/             React + Vite UI
packages/
  core/            shared platform contracts
games/
  xiangqi/         Xiangqi adapter, rules, state, move schema, tests
docs/
  ARCHITECTURE.md  platform direction for multi-game and AI-only play
```

## Commands

```bash
npm install
npm run dev:server
npm run dev:web
npm run dev:mcp
```

Validation:

```bash
npm test
npm run check
npm run build
```

## Environment

- `PORT`: HTTP server port, default `8787`
- `HUMAN_AGENT_PLAYGROUND_DATA_PATH`: session storage path
- `HUMAN_AGENT_PLAYGROUND_SERVER_URL`: MCP proxy target, default `http://127.0.0.1:8787`
- `VITE_API_URL`: web UI API base URL, default `http://127.0.0.1:8787`

## Current MCP tools

- `list_games`
- `list_sessions`
- `create_session`
- `get_game_state`
- `get_legal_moves`
- `play_move`
- `reset_session`

## Roadmap direction

1. Add more games under `games/*`, such as Go or other tabletop systems.
2. Add a registry-based server executor so each session dispatches to the correct game adapter.
3. Add agent-vs-agent runners that can drive sessions without a human click loop.
4. Add streamable HTTP MCP transport for remote clients.
5. Add live session sync with SSE or WebSocket instead of polling.

Architecture details live in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
