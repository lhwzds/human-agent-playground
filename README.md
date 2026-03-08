# Human Agent Playground

[中文说明](./README.zh-CN.md)

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
- `search_tools`
- `create_session`
- `get_game_state`
- `wait_for_turn`
- `xiangqi_get_legal_moves`
- `xiangqi_play_move`
- `reset_session`

Tool metadata now includes category and tags in `tools/list`, and `search_tools` can filter by `query`, `category`, `gameId`, and `tags`.

Recommended tool order:

1. `list_games`
2. `search_tools` when the server exposes many tools
3. `list_sessions` or `create_session`
4. `get_game_state`
5. `xiangqi_get_legal_moves`
6. `xiangqi_play_move`

## Turn-Based Shared Play Without External Polling

`wait_for_turn` is a blocking MCP tool for turn-based shared play.

Use it when one side is controlled by a human in the UI and the other side is controlled by an agent in one long-running MCP session.

Recommended flow:

1. Call `get_game_state`.
2. Read the latest `session.events` entry and keep its `id` as `afterEventId`.
3. If it is not the agent's turn yet, call `wait_for_turn` with:
   - `sessionId`
   - `expectedTurn`
   - `afterEventId`
   - `timeoutMs`
4. When `wait_for_turn` returns `status: "ready"`, call `get_game_state` again.
5. Inspect legal moves with `xiangqi_get_legal_moves`.
6. Play exactly one move with `xiangqi_play_move`.
7. Repeat the same pattern in the same long-running agent run.

Notes:

- `wait_for_turn` waits inside the MCP server. It is meant to replace client-side `sleep` loops.
- This pattern works best in hosts that allow one reply or one task to keep running while it repeatedly calls MCP tools.
- The tool may return:
  - `ready`: the expected side may move now
  - `finished`: the game ended while waiting
  - `timeout`: no matching turn arrived before the timeout

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
