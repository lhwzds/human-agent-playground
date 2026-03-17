# Human Agent Playground

[English](./README.md)

Human Agent Playground 让人类和 agent 通过同一个 session 共享棋盘，对外提供三种入口：

- Web UI
- HTTP API
- MCP Server

## 游戏

- 国际象棋（UI 默认）
- 象棋
- 五子棋
- 四子棋
- 黑白棋

## 启动

```bash
npm install
bash scripts/dev.sh
```

默认本地地址：

- UI：`http://127.0.0.1:4178`
- API：`http://127.0.0.1:8790/api`
- MCP：`http://127.0.0.1:8790/mcp`

需要时可以覆盖端口：

```bash
API_PORT=8787 WEB_PORT=4173 bash scripts/dev.sh
```

## 使用

- 点击 `Create Session` 创建一局。
- 创建弹窗默认是 `Chess`。
- 如果要启用内置 AI，打开 `AI Settings`。
- 如果要让外部 agent 加入，对接上面的 MCP 地址。

## Skills

- MCP 工作流： [skills/human-agent-playground-mcp/SKILL.md](./skills/human-agent-playground-mcp/SKILL.md)
- 国际象棋规则： [skills/human-agent-playground-chess/SKILL.md](./skills/human-agent-playground-chess/SKILL.md)

## 更多

- 架构说明： [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
