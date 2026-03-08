import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { GameService } from '../game-service.js'
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
  toolCatalog.push(...createXiangqiToolCatalog(service))

  registerToolCatalog(server, toolCatalog)

  return server
}
