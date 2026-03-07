import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { GameService } from '../game-service.js'
import { registerPlatformTools } from './register-platform-tools.js'
import { registerXiangqiTools } from './register-xiangqi-tools.js'

export function createMcpServer(service: GameService) {
  const server = new McpServer({
    name: 'human-agent-playground',
    version: '0.1.0',
  })

  registerPlatformTools(server, service)
  registerXiangqiTools(server, service)

  return server
}
