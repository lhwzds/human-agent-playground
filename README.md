# Human Agent Playground

Human Agent Playground is a TypeScript monorepo for shared board-game sessions between humans and AI agents.

One session can be used from:

- a web UI
- an HTTP API
- an MCP server

Current game: Xiangqi.

## UI Preview

![Human Agent Playground web UI](./docs/images/playground-ui.png)

## What It Does

- Keeps one shared game session for both humans and agents
- Updates the web UI live when moves arrive from MCP or HTTP
- Organizes each game under its own folder and adapter
- Exposes MCP over Streamable HTTP

## Quick Start

```bash
npm install
npm run dev:server
npm run dev:web
```

Fixed local ports:

```bash
npm --prefix apps/server run start
npm --prefix apps/web run start
```

Default local endpoints:

- UI: `http://127.0.0.1:4173`
- HTTP API: `http://127.0.0.1:8787/api`
- MCP: `http://127.0.0.1:8787/mcp`
- Health: `http://127.0.0.1:8787/health`

Override with:

- `PORT`
- `HUMAN_AGENT_PLAYGROUND_DATA_PATH`
- `VITE_API_URL`

## How To Play

1. Start the server and web app.
2. Open the UI and click `Create Session`.
3. Select a piece to inspect legal moves.
4. Click a highlighted square to play.
5. Watch the side panel for turn, last move, and activity.

## Human + Agent Shared Play

Humans and agents already play in the same session.

Typical flow:

1. A human creates a session in the UI.
2. An agent connects to MCP and calls `list_sessions`.
3. The agent reads the board with `get_game_state`.
4. The agent checks moves with `xiangqi_get_legal_moves`.
5. The agent plays with `xiangqi_play_move`.
6. The UI updates live through SSE.

## MCP Usage

MCP endpoint:

- `http://127.0.0.1:8787/mcp`

Example client config:

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

Current MCP tools:

- `list_games`
- `list_sessions`
- `create_session`
- `get_game_state`
- `xiangqi_get_legal_moves`
- `xiangqi_play_move`
- `reset_session`

Recommended tool order:

1. `list_games`
2. `list_sessions` or `create_session`
3. `get_game_state`
4. `xiangqi_get_legal_moves`
5. `xiangqi_play_move`

## Repo Layout

```text
apps/
  server/          HTTP API + MCP server
  web/             React + Vite UI
packages/
  core/            shared session contracts
games/
  xiangqi/         Xiangqi rules, state, adapter, tests
docs/
  ARCHITECTURE.md  platform notes
skills/
  human-agent-playground-mcp/
```

## Validation

```bash
npm test
npm run check
npm run build
```

## More

- Architecture: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Agent skill: [skills/human-agent-playground-mcp/SKILL.md](./skills/human-agent-playground-mcp/SKILL.md)
