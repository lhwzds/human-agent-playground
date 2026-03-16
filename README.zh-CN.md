# Human Agent Playground

[English](./README.md)

Human Agent Playground 是一个本地 AI agent app 游戏 playground 仓库，用来让人类和 AI Agent 共享同一局棋类或桌游对局。

同一个 session 目前可以从下面三个入口访问：

- Web UI
- HTTP API
- MCP Server

只要本地 agent 宿主能够调用 MCP，就可以在这里加入或开启一局对局，例如 Codex、Claude Code、Gemini CLI、OpenClaw 以及类似的 agent client。

现在项目的主运行路径已经收敛成一个 Rust Axum 后端，由它统一负责 session、HTTP API、SSE、MCP、provider/auth/profile 管理和单回合 AI 决策。

当前已实现的游戏：

- 象棋
- 国际象棋
- 五子棋
- 四子棋
- 黑白棋

## 对局截图示例

这是一张真实共享象棋对局的页面截图，包含棋盘、消息流和会话控制区。

![Completed shared Xiangqi session](./docs/images/xiangqi-session-example.png)

## 这个项目能做什么

- 让人类和 agent 读取并操作同一个共享 session
- MCP 或 HTTP 落子后，前端会实时同步更新
- 每个游戏放在自己的目录和 adapter 中，方便后续扩展
- 通过 Streamable HTTP 暴露 MCP 服务

## 快速开始

```bash
npm install
npm run dev:web
npm run dev:backend
```

如果你希望固定本地端口，可以使用：

```bash
npm run dev:backend
npm --prefix apps/web run start
```

也可以直接一条命令启动：

```bash
bash scripts/dev.sh
```

如果你要自己指定端口或数据文件路径，可以这样：

```bash
API_PORT=8787 WEB_PORT=4173 HUMAN_AGENT_PLAYGROUND_DATA_PATH=/tmp/hap.json HUMAN_AGENT_PLAYGROUND_AUTH_DATA_PATH=/tmp/hap-auth.db bash scripts/dev.sh
```

默认本地地址：

- UI：`http://127.0.0.1:4178`
- HTTP API：`http://127.0.0.1:8790/api`
- MCP：`http://127.0.0.1:8790/mcp`
- 健康检查：`http://127.0.0.1:8790/health`

可覆盖的环境变量：

- `PORT`
- `HUMAN_AGENT_PLAYGROUND_DATA_PATH`
- `HUMAN_AGENT_PLAYGROUND_AUTH_DATA_PATH`
- `VITE_API_URL`
- `VITE_API_PORT`

## 怎么玩

1. 启动 server 和 web。
2. 打开 UI，点击 `Create Session`。
3. 在 `Game` 下拉里选择游戏。
4. 按该游戏的规则与棋盘交互完成落子。
5. 观察棋盘和消息流的实时更新。

## 人类和 Agent 一起玩

现在已经支持人类和 agent 共享同一局。

一个典型流程是：

1. 人类先在 UI 里创建一个 session。
2. Agent 通过 MCP 调用 `list_sessions` 找到这局。
3. Agent 用 `get_game_state` 读取当前局面。
4. Agent 用当前游戏对应的合法走法工具检查局面，比如 `xiangqi_get_legal_moves` 或 `chess_get_legal_moves`。
5. 长时间共享对局时，Agent 应优先用当前游戏对应的 `*_play_move_and_wait` 工具落子。
6. UI 会通过 SSE 实时刷新，立即看到这一步。

## 内置 AI Runtime

当前 Rust 后端已经统一承担：

- session 与游戏规则
- HTTP API 与 SSE
- MCP 工具
- provider/model 目录发现
- auth profile 与 credential 存储
- 单回合 AI 决策

现在 web UI 已经提供：

- provider/model 状态查看
- auth profile 的创建、删除、测试
- 每个执棋方的 AI seat 配置
- 每个 side 的 auto-play 状态

所以现在一局游戏有两种主要模式：

- 外部 agent 通过 MCP 接入共享对局
- 内置 AI seat 通过 Rust runtime 自动接管某一方

## 人类如何 Prompt Agent 完成一整局

如果你希望 agent 从开局一路下到终局，prompt 里一定要明确说明这是“一整局游戏”，不是“只下一步”。

推荐 prompt 结构：

```text
Create or join one Chess session, make the first move if needed, and then keep using chess_play_move_and_wait until the game finishes. Do not stop after one move cycle. Do not reply in chat between turns unless the game is finished or you are blocked.
```

如果人类已经在 UI 里准备好了一局，可以这样说：

```text
Join my current Chess session as black. After the game starts, keep calling chess_play_move_and_wait after every ready result until the game reaches finished. Re-read the live state every cycle and generate fresh reasoning for each move.
```

人类写 prompt 时最好明确写出这些约束：

- 写清楚 `full game`、`complete game` 或 `until finished`
- 直接点名当前游戏对应的 `*_play_move_and_wait`
- 明确说 `do not stop after one move`
- 明确说 `do not reply in chat between turns`
- 如果需要精确协作，写上 `sessionId` 和 agent 要执的颜色

## MCP 使用方式

MCP 端点取决于你怎么启动本地服务。常见本地端点是：

- `http://127.0.0.1:8787/mcp`
- `http://127.0.0.1:8790/mcp`
- `http://127.0.0.1:8794/mcp`

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

平台级 MCP 工具：

- `list_games`
- `list_sessions`
- `search_tools`
- `create_session`
- `get_game_state`
- `wait_for_turn`
- `reset_session`

当前游戏专属 MCP 工具：

- 象棋：
  - `xiangqi_get_legal_moves`
  - `xiangqi_play_move`
  - `xiangqi_play_move_and_wait`
- 国际象棋：
  - `chess_get_legal_moves`
  - `chess_play_move`
  - `chess_play_move_and_wait`
- 五子棋：
  - `gomoku_get_legal_moves`
  - `gomoku_play_move`
  - `gomoku_play_move_and_wait`
- 四子棋：
  - `connect_four_get_legal_moves`
  - `connect_four_play_move`
  - `connect_four_play_move_and_wait`
- 黑白棋：
  - `othello_get_legal_moves`
  - `othello_play_move`
  - `othello_play_move_and_wait`

现在 `tools/list` 返回的工具信息里也会带上分类和标签元数据，`search_tools` 支持按 `query`、`category`、`gameId` 和 `tags` 过滤。

推荐的调用顺序：

1. `list_games`
2. 当工具很多时先用 `search_tools`
3. `list_sessions` 或 `create_session`
4. `get_game_state`
5. 当前游戏对应的合法走法工具
6. 长时间共享对局优先用当前游戏对应的 `*_play_move_and_wait`，单步控制再用 `*_play_move`

## Agent 落子规则

当 agent 通过 MCP 下棋时，每一步都应该遵守这个顺序：

1. 先调用 `get_game_state`。
2. 如果还没轮到自己，只调用一次 `wait_for_turn`，并在它返回 `ready` 后立刻停止等待。
3. `ready` 之后重新调用 `get_game_state`。
4. 用当前游戏对应的合法走法工具作为合法走法的唯一依据。
5. 如果你要维持一个长时间运行的共享回合循环，优先调用当前游戏对应的 `*_play_move_and_wait`。
6. 如果你需要底层单步控制，再调用当前游戏对应的 `*_play_move`。

一旦对局已经开始，agent 就应该把任务理解成连续的回合循环，而不是彼此独立的单步任务。如果用户要求的是完整对局，那么每次得到 `ready` 后都应该立刻开始下一次对应游戏的 `*_play_move_and_wait` 周期。

所有游戏专属 `*_play_move.reasoning` 和 `*_play_move_and_wait.reasoning` 的要求：

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

当前游戏对应的 `*_play_move_and_wait` 是更高一层的常用工具：

- 它先立即走出当前这一步
- 然后继续在 MCP server 内部等待，直到对手正好完成下一步回复
- 只有在回合重新切回同一方、对局结束、或等待超时的时候才返回

如果你的目标是让一个 agent 在单个长任务里持续和 UI 中的人类轮流下棋，优先使用当前游戏对应的 `*_play_move_and_wait`。如果用户要的是一局完整的游戏，那么每次它返回 `ready` 后，都应该立刻再次调用下一次对应游戏的 `*_play_move_and_wait`，直到结果变成 `finished`。

对局开始之后，正确的控制循环是：

1. 等到轮到自己。
2. 重新读取实时局面。
3. 检查最新合法走法。
4. 用现生成 reasoning 走出这一步。
5. 让当前游戏对应的 `*_play_move_and_wait` 在 server 内部继续等对手回应。
6. 它一返回 `ready`，就立刻开始下一次循环。
7. 只有在结果变成 `finished`、用户中断、或任务被阻塞时才停止。

推荐流程：

1. 先调用 `get_game_state`。
2. 读取最新一条 `session.events`，把它的 `id` 记成 `afterEventId`。
3. 如果现在还没轮到 agent，就调用 `wait_for_turn`，传入：
   - `sessionId`
   - `expectedTurn`
   - `afterEventId`
   - `timeoutMs`
4. 当 `wait_for_turn` 返回 `status: "ready"` 后，再调用一次 `get_game_state`。
5. 用当前游戏对应的合法走法工具检查当前合法走法。
6. 优先调用当前游戏对应的 `*_play_move_and_wait`，并附带这一步现生成的 reasoning。
7. 当它返回 `ready` 时，重新读取局面，并立刻调用下一次走子工具。
8. 如果用户要求的是完整对局，就持续重复第 7 步，直到结果变成 `finished`。
9. 只有在你需要把“走子”和“等待”拆开调试时，才改用当前游戏对应的 `*_play_move`。

说明：

- `wait_for_turn` 的等待发生在 MCP server 内部，目的是替代客户端侧的 `sleep` 循环。
- 当前游戏对应的 `*_play_move_and_wait` 会把“走一步并等到下次自己再走”的完整回合周期放进一次 MCP 调用里，减少 agent 在两回合之间先回复聊天而打断循环的概率。
- 实际上，一次 `*_play_move_and_wait` 的含义就是：先走一步，等对手回应一步，然后在再次轮到自己时返回。
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
  chess/           国际象棋规则、状态、adapter、测试
  gomoku/          五子棋规则、状态、adapter、测试
  connect-four/    四子棋规则、状态、adapter、测试
  othello/         黑白棋规则、状态、adapter、测试
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
