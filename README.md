# Human Agent Playground

[中文说明](./README.zh-CN.md)

Human Agent Playground is a local shared-board repo where humans and agent apps use the same game session through:

- a web UI
- an HTTP API
- an MCP server

The project runs on one Rust Axum backend.

## Games

- Chess
- Xiangqi
- Gomoku
- Connect Four
- Othello

Chess is the default recommended demo game in the UI.

## Quick Start

```bash
npm install
bash scripts/dev.sh
```

Default local endpoints:

- UI: `http://127.0.0.1:4178`
- API: `http://127.0.0.1:8790/api`
- MCP: `http://127.0.0.1:8790/mcp`

Override ports or data paths when needed:

```bash
API_PORT=8787 \
WEB_PORT=4173 \
HUMAN_AGENT_PLAYGROUND_DATA_PATH=/tmp/hap.json \
HUMAN_AGENT_PLAYGROUND_AUTH_DATA_PATH=/tmp/hap-auth.db \
bash scripts/dev.sh
```

## UI Flow

1. Open the UI.
2. Click `Create Session`.
3. The dialog defaults to `Chess`.
4. Use `AI Settings` if you want a built-in AI seat.

## MCP

Example config:

```json
{
  "mcpServers": {
    "human-agent-playground": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:8790/mcp"
    }
  }
}
```

Core tools:

- `list_games`
- `list_sessions`
- `search_tools`
- `create_session`
- `get_game_state`
- `wait_for_turn`
- `reset_session`

Game tools use the same pattern:

- `chess_*`
- `xiangqi_*`
- `gomoku_*`
- `connect_four_*`
- `othello_*`

For shared turn loops, prefer `*_play_move_and_wait`.

## Skills

- MCP workflow: [skills/human-agent-playground-mcp/SKILL.md](./skills/human-agent-playground-mcp/SKILL.md)
- Chess rules: [skills/human-agent-playground-chess/SKILL.md](./skills/human-agent-playground-chess/SKILL.md)

## Repo Layout

```text
apps/
  backend/
  web/
crates/
  hap-models/
  hap-games/
  hap-runtime/
skills/
  human-agent-playground-mcp/
  human-agent-playground-chess/
```

## More

- Architecture: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
