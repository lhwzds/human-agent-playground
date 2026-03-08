import * as z from 'zod/v4'

import type { GameService } from '../game-service.js'
import { textResult, type ToolCatalogEntry } from './tool-catalog.js'

export function createXiangqiToolCatalog(service: GameService): ToolCatalogEntry[] {
  return [
    {
      name: 'xiangqi_get_legal_moves',
      title: 'Xiangqi Legal Moves',
      description:
        'List legal Xiangqi moves for a session. Provide `from` to narrow the result to one piece, or omit it to inspect the whole position.',
      category: 'gameplay',
      gameId: 'xiangqi',
      tags: ['xiangqi', 'moves', 'legal', 'read'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Xiangqi session id to inspect'),
        from: z
          .string()
          .regex(/^[a-i](10|[1-9])$/)
          .optional()
          .describe('Optional source square such as e3 or h10'),
      },
      annotations: {
        title: 'Xiangqi Legal Moves',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, from } = z
          .object({
            sessionId: z.string().uuid(),
            from: z
              .string()
              .regex(/^[a-i](10|[1-9])$/)
              .optional(),
          })
          .parse(input)

        const moves = {
          moves: await service.getLegalMoves(sessionId, from ? { from } : undefined),
        }
        return textResult('Xiangqi legal moves', moves)
      },
    },
    {
      name: 'xiangqi_play_move',
      title: 'Play Xiangqi Move',
      description:
        'Play one Xiangqi move for the current side to move. Always inspect the state or legal moves before using this.',
      category: 'gameplay',
      gameId: 'xiangqi',
      tags: ['xiangqi', 'moves', 'play', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Xiangqi session id to update'),
        from: z.string().regex(/^[a-i](10|[1-9])$/).describe('Source square'),
        to: z.string().regex(/^[a-i](10|[1-9])$/).describe('Target square'),
      },
      annotations: {
        title: 'Play Xiangqi Move',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, from, to } = z
          .object({
            sessionId: z.string().uuid(),
            from: z.string().regex(/^[a-i](10|[1-9])$/),
            to: z.string().regex(/^[a-i](10|[1-9])$/),
          })
          .parse(input)

        const session = await service.playMove(sessionId, { from, to })
        return textResult('Updated Xiangqi game state', session)
      },
    },
  ]
}
