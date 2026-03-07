import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { registerPlatformTools } from './mcp/register-platform-tools.js'
import { registerXiangqiTools } from './mcp/register-xiangqi-tools.js'

async function main() {
  const server = new McpServer({
    name: 'human-agent-playground',
    version: '0.1.0',
  })

  registerPlatformTools(server)
  registerXiangqiTools(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Human Agent Playground MCP server is running on stdio')
}

main().catch((error) => {
  console.error('Human Agent Playground MCP server failed:', error)
  process.exit(1)
})
