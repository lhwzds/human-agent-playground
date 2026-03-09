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

也可以直接一条命令启动：

```bash
bash scripts/dev.sh
```

如果你要自己指定端口或数据文件路径，可以这样：

```bash
API_PORT=8787 WEB_PORT=4173 HUMAN_AGENT_PLAYGROUND_DATA_PATH=/tmp/hap.json bash scripts/dev.sh
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
5. 观察棋盘和消息流的实时更新。

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
- `wait_for_turn`
- `xiangqi_get_legal_moves`
- `xiangqi_play_move`
- `xiangqi_play_move_and_wait`
- `reset_session`

现在 `tools/list` 返回的工具信息里也会带上分类和标签元数据，`search_tools` 支持按 `query`、`category`、`gameId` 和 `tags` 过滤。

推荐的调用顺序：

1. `list_games`
2. 当工具很多时先用 `search_tools`
3. `list_sessions` 或 `create_session`
4. `get_game_state`
5. `xiangqi_get_legal_moves`
6. 长时间共享对局优先用 `xiangqi_play_move_and_wait`，单步控制再用 `xiangqi_play_move`

## Agent 落子规则

当 agent 通过 MCP 下棋时，每一步都应该遵守这个顺序：

1. 先调用 `get_game_state`。
2. 如果还没轮到自己，只调用一次 `wait_for_turn`，并在它返回 `ready` 后立刻停止等待。
3. `ready` 之后重新调用 `get_game_state`。
4. 用 `xiangqi_get_legal_moves` 作为合法走法的唯一依据。
5. 如果你要维持一个长时间运行的共享回合循环，优先调用 `xiangqi_play_move_and_wait`。
6. 如果你需要底层单步控制，再调用 `xiangqi_play_move`。

`xiangqi_play_move.reasoning` 和 `xiangqi_play_move_and_wait.reasoning` 的要求：

- `reasoning.summary` 必须解释“为什么现在走这一步”。
- `reasoning.reasoningSteps` 必须至少包含 1 条针对当前局面的简短推理步骤。
- server 只负责存储 reasoning，不会替 agent 生成 reasoning。
- 不要复用固定模板解释。
- 不要把未来多步计划伪装成已经决定好的结论。
- 在没有重新读局面并走出这一步之前，不要再次调用 `wait_for_turn`。
- IMPORTANT：`wait_for_turn` 一旦返回 `ready`，就要立刻继续 MCP 调用。
- NEVER：在你真正走出这 1 步或者明确决定停止之前，不要先回复聊天。

## 不依赖外部轮询的轮流对局

`wait_for_turn` 是这个模式的底层阻塞式 MCP 工具。

`xiangqi_play_move_and_wait` 是更高一层的常用工具：

- 它先立即走出当前这一步
- 然后继续在 MCP server 内部等待，直到对手正好完成下一步回复
- 只有在回合重新切回同一方、对局结束、或等待超时的时候才返回

如果你的目标是让一个 agent 在单个长任务里持续和 UI 中的人类轮流下棋，优先使用 `xiangqi_play_move_and_wait`。
如果用户要的是一局完整的游戏，那么每次它返回 `ready` 后，都应该立刻再次调用下一次 `xiangqi_play_move_and_wait`，直到结果变成 `finished`。

它专门用来支持这种模式：

- 人类在 UI 中下棋
- Agent 在同一个长时间运行的 MCP 会话里等待自己的回合
- 不需要客户端自己写 `sleep` 轮询

推荐流程：

1. 先调用 `get_game_state`。
2. 读取最新一条 `session.events`，把它的 `id` 记成 `afterEventId`。
3. 如果现在还没轮到 agent，就调用 `wait_for_turn`，传入：
   - `sessionId`
   - `expectedTurn`
   - `afterEventId`
   - `timeoutMs`
4. 当 `wait_for_turn` 返回 `status: "ready"` 后，再调用一次 `get_game_state`。
5. 用 `xiangqi_get_legal_moves` 检查当前合法走法。
6. 优先调用 `xiangqi_play_move_and_wait`，并附带这一步现生成的 reasoning。
7. 当它返回 `ready` 时，重新读取局面，并立刻调用下一次走子工具。
8. 如果用户要求的是完整对局，就持续重复第 7 步，直到结果变成 `finished`。
9. 只有在你需要把“走子”和“等待”拆开调试时，才改用 `xiangqi_play_move`。

说明：

- `wait_for_turn` 的等待发生在 MCP server 内部，目的是替代客户端侧的 `sleep` 循环。
- `xiangqi_play_move_and_wait` 会把“走一步并等到下次自己再走”的完整回合周期放进一次 MCP 调用里，减少 agent 在两回合之间先回复聊天而打断循环的概率。
- 实际上，一次 `xiangqi_play_move_and_wait` 的含义就是：先走一步，等对手回应一步，然后在再次轮到自己时返回。
- 这种模式最适合能够让单个回复或单个任务持续运行并连续调用 MCP 工具的 agent 宿主。
- 这个工具可能返回三种结果：
  - `ready`：已经轮到指定一方
  - `finished`：等待过程中对局结束
  - `timeout`：在超时前没有等到目标回合

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
