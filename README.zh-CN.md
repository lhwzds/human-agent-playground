# Human Agent Playground

[English](./README.md)

Human Agent Playground 是一个 TypeScript monorepo，用来支持人类和 AI Agent 共享同一局棋类或桌游对局。

同一个 session 目前可以从下面三个入口访问：

- Web UI
- HTTP API
- MCP Server

当前已实现的游戏：象棋。

## 界面预览

![Human Agent Playground web UI](./docs/images/playground-ui.png)

## 这个项目能做什么

- 让人类和 agent 读取并操作同一个共享 session
- MCP 或 HTTP 落子后，前端会实时同步更新
- 每个游戏放在自己的目录和 adapter 中，方便后续扩展
- 通过 Streamable HTTP 暴露 MCP 服务

## 快速开始

```bash
npm install
npm run dev:server
npm run dev:web
```

如果你希望固定本地端口，可以使用：

```bash
npm --prefix apps/server run start
npm --prefix apps/web run start
```

默认本地地址：

- UI：`http://127.0.0.1:4173`
- HTTP API：`http://127.0.0.1:8787/api`
- MCP：`http://127.0.0.1:8787/mcp`
- 健康检查：`http://127.0.0.1:8787/health`

可覆盖的环境变量：

- `PORT`
- `HUMAN_AGENT_PLAYGROUND_DATA_PATH`
- `VITE_API_URL`

## 怎么玩

1. 启动 server 和 web。
2. 打开 UI，点击 `Create Session`。
3. 点击一个棋子，查看它当前可走的合法位置。
4. 再点击高亮目标格完成落子。
5. 右侧面板会显示当前轮次、最近一步和活动记录。

## 人类和 Agent 一起玩

现在已经支持人类和 agent 共享同一局。

一个典型流程是：

1. 人类先在 UI 里创建一个 session。
2. Agent 通过 MCP 调用 `list_sessions` 找到这局。
3. Agent 用 `get_game_state` 读取当前局面。
4. Agent 用 `xiangqi_get_legal_moves` 检查合法走法。
5. Agent 用 `xiangqi_play_move` 落子。
6. UI 会通过 SSE 实时刷新，立即看到这一步。

## MCP 使用方式

MCP 端点：

- `http://127.0.0.1:8787/mcp`

一个简单的客户端配置示例：

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

当前 MCP 工具：

- `list_games`
- `list_sessions`
- `search_tools`
- `create_session`
- `get_game_state`
- `xiangqi_get_legal_moves`
- `xiangqi_play_move`
- `reset_session`

现在 `tools/list` 返回的工具信息里也会带上分类和标签元数据，`search_tools` 支持按 `query`、`category`、`gameId` 和 `tags` 过滤。

推荐的调用顺序：

1. `list_games`
2. 当工具很多时先用 `search_tools`
3. `list_sessions` 或 `create_session`
4. `get_game_state`
5. `xiangqi_get_legal_moves`
6. `xiangqi_play_move`

## 仓库结构

```text
apps/
  server/          HTTP API + MCP server
  web/             React + Vite UI
packages/
  core/            共享 session 契约
games/
  xiangqi/         象棋规则、状态、adapter、测试
docs/
  ARCHITECTURE.md  架构说明
skills/
  human-agent-playground-mcp/
```

## 验证命令

```bash
npm test
npm run check
npm run build
```

## 更多内容

- 架构说明：[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Agent skill：[skills/human-agent-playground-mcp/SKILL.md](./skills/human-agent-playground-mcp/SKILL.md)
