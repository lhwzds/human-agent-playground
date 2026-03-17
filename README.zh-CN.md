# Human Agent Playground

[English](./README.md)

Human Agent Playground 是一个本地共享棋盘 playground，让人类和 agent 通过同一个 session 一起下棋。当前入口有三种：

- Web UI
- HTTP API
- MCP Server

项目现在运行在一个 Rust Axum 后端上。

## 游戏

- 国际象棋
- 象棋
- 五子棋
- 四子棋
- 黑白棋

当前 UI 默认推荐演示游戏是国际象棋。

## 快速开始

```bash
npm install
bash scripts/dev.sh
```

默认本地地址：

- UI：`http://127.0.0.1:4178`
- API：`http://127.0.0.1:8790/api`
- MCP：`http://127.0.0.1:8790/mcp`

需要时可以覆盖端口和数据路径：

```bash
API_PORT=8787 \
WEB_PORT=4173 \
HUMAN_AGENT_PLAYGROUND_DATA_PATH=/tmp/hap.json \
HUMAN_AGENT_PLAYGROUND_AUTH_DATA_PATH=/tmp/hap-auth.db \
bash scripts/dev.sh
```

## UI 使用

1. 打开 UI。
2. 点击 `Create Session`。
3. 创建弹窗默认是 `Chess`。
4. 如果你想启用内置 AI，打开 `AI Settings`。

## MCP

示例配置：

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

平台工具：

- `list_games`
- `list_sessions`
- `search_tools`
- `create_session`
- `get_game_state`
- `wait_for_turn`
- `reset_session`

游戏工具命名统一为：

- `chess_*`
- `xiangqi_*`
- `gomoku_*`
- `connect_four_*`
- `othello_*`

共享回合循环优先使用 `*_play_move_and_wait`。

## Skills

- MCP 工作流： [skills/human-agent-playground-mcp/SKILL.md](./skills/human-agent-playground-mcp/SKILL.md)
- 国际象棋规则： [skills/human-agent-playground-chess/SKILL.md](./skills/human-agent-playground-chess/SKILL.md)

## 仓库结构

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

## 更多

- 架构说明： [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
