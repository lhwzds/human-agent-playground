import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { GameService } from '../game-service.js'
import { createChessToolCatalog } from './register-chess-tools.js'
import { createConnectFourToolCatalog } from './register-connect-four-tools.js'
import { createGomokuToolCatalog } from './register-gomoku-tools.js'
import { createOthelloToolCatalog } from './register-othello-tools.js'
import { createPlatformToolCatalog } from './register-platform-tools.js'
import { createXiangqiToolCatalog } from './register-xiangqi-tools.js'
import { registerToolCatalog, type ToolCatalogEntry } from './tool-catalog.js'

export function createMcpServer(service: GameService) {
  const server = new McpServer({
    name: 'human-agent-playground',
    version: '0.1.0',
  })

  const toolCatalog: ToolCatalogEntry[] = []
  const getAllTools = () => toolCatalog

  toolCatalog.push(...createPlatformToolCatalog(service, getAllTools))
  toolCatalog.push(...createChessToolCatalog(service))
  toolCatalog.push(...createConnectFourToolCatalog(service))
  toolCatalog.push(...createGomokuToolCatalog(service))
  toolCatalog.push(...createOthelloToolCatalog(service))
  toolCatalog.push(...createXiangqiToolCatalog(service))

  registerToolCatalog(server, toolCatalog)

  return server
}
