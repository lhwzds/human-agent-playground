import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'

import type { GameSession } from '@human-agent-playground/core'

import type { GameService } from '../game-service.js'

function textResult(title: string, payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `${title}\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    structuredContent: {
      payload,
    },
  }
}

export function registerXiangqiTools(server: McpServer, service: GameService) {
  server.registerTool(
    'xiangqi_get_legal_moves',
    {
      description:
        'List legal Xiangqi moves for a session. Provide `from` to narrow the result to one piece, or omit it to inspect the whole position.',
      inputSchema: {
        sessionId: z.string().uuid().describe('The Xiangqi session id to inspect'),
        from: z
          .string()
          .regex(/^[a-i](10|[1-9])$/)
          .optional()
          .describe('Optional source square such as e3 or h10'),
      },
    },
    async ({ sessionId, from }) => {
      const moves = {
        moves: await service.getLegalMoves(sessionId, from ? { from } : undefined),
      }
      return textResult('Xiangqi legal moves', moves)
    },
  )

  server.registerTool(
    'xiangqi_play_move',
    {
      description:
        'Play one Xiangqi move for the current side to move. Always inspect the state or legal moves before using this.',
      inputSchema: {
        sessionId: z.string().uuid().describe('The Xiangqi session id to update'),
        from: z.string().regex(/^[a-i](10|[1-9])$/).describe('Source square'),
        to: z.string().regex(/^[a-i](10|[1-9])$/).describe('Target square'),
      },
    },
    async ({ sessionId, from, to }) => {
      const session = await service.playMove(sessionId, { from, to })
      return textResult('Updated Xiangqi game state', session)
    },
  )
}
