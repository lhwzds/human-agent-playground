import * as z from 'zod/v4'

import type { GameService } from '../game-service.js'
import { textResult, type ToolCatalogEntry } from './tool-catalog.js'

const chessSquareSchema = z.string().regex(/^[a-h][1-8]$/)
const chessPromotionSchema = z.enum(['queen', 'rook', 'bishop', 'knight'])
const reasoningSchema = z.object({
  summary: z.string().min(1).describe('Required move-specific summary generated from the current position'),
  reasoningSteps: z
    .array(z.string().min(1))
    .min(1)
    .describe('Required short reasoning steps that explain why this move was chosen now'),
  consideredAlternatives: z
    .array(
      z.object({
        action: z.string().min(1),
        summary: z.string().min(1),
        rejectedBecause: z.string().min(1).optional(),
      }),
    )
    .optional()
    .describe('Optional alternative moves considered before the final move'),
  confidence: z.number().min(0).max(1).nullable().optional().describe('Optional confidence score'),
})

export function createChessToolCatalog(service: GameService): ToolCatalogEntry[] {
  return [
    {
      name: 'chess_get_legal_moves',
      title: 'Chess Legal Moves',
      description:
        'List legal Chess moves for a session. Omit `from` to inspect every legal move, or provide one square to inspect the legal moves from that square only.',
      category: 'gameplay',
      gameId: 'chess',
      tags: ['chess', 'moves', 'legal', 'read'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Chess session id to inspect'),
        from: chessSquareSchema.optional().describe('Optional square such as e2'),
      },
      annotations: {
        title: 'Chess Legal Moves',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, from } = z
          .object({
            sessionId: z.string().uuid(),
            from: chessSquareSchema.optional(),
          })
          .parse(input)

        const moves = {
          moves: await service.getLegalMoves(sessionId, from ? { from } : undefined),
        }
        return textResult('Chess legal moves', moves)
      },
    },
    {
      name: 'chess_play_move',
      title: 'Play Chess Move',
      description:
        'Play exactly one Chess move for the side to move. Re-read the latest state first, inspect legal moves, and submit a fresh reasoning summary for this exact move. IMPORTANT: in a long-running turn loop, this tool call is the response. NEVER stop to send a chat reply before moving. NEVER send cached explanations or a multi-move plan.',
      category: 'gameplay',
      gameId: 'chess',
      tags: ['chess', 'moves', 'play', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Chess session id to update'),
        from: chessSquareSchema.describe('Source square such as e2'),
        to: chessSquareSchema.describe('Target square such as e4'),
        promotion: chessPromotionSchema.optional().describe('Optional promotion piece when a pawn promotes'),
        reasoning: reasoningSchema.describe('Required reasoning summary shown in the shared timeline for this exact move'),
      },
      annotations: {
        title: 'Play Chess Move',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, from, to, promotion, reasoning } = z
          .object({
            sessionId: z.string().uuid(),
            from: chessSquareSchema,
            to: chessSquareSchema,
            promotion: chessPromotionSchema.optional(),
            reasoning: reasoningSchema,
          })
          .parse(input)

        const session = await service.playMove(sessionId, {
          from,
          to,
          promotion,
          actorKind: 'agent',
          channel: 'mcp',
          reasoning,
        })

        return textResult(
          'Updated Chess game state. IMPORTANT: if you are in a turn loop, continue with MCP tool calls. NEVER reply in chat until this move cycle is complete.',
          session,
        )
      },
    },
    {
      name: 'chess_play_move_and_wait',
      title: 'Play Chess Move And Wait',
      description:
        'Play exactly one Chess move for the current side to move, then keep waiting inside the MCP server until the opponent completes exactly one reply and it is that same side’s turn again, the game finishes, or the timeout expires. Prefer this in long-running human-agent shared play because it keeps play and wait inside one MCP tool call. Use it as one foreground blocking MCP call, not inside a detached terminal loop or background polling script. IMPORTANT: your MCP client request timeout must be greater than timeoutMs. For long local interactive play, prefer 600000 ms when you want up to ten minutes of waiting. IMPORTANT: when this returns ready, re-read the state and call the next move tool immediately. If the user asked for a full game, keep repeating this cycle until the game finishes. NEVER treat the move submission as the end of the run.',
      category: 'gameplay',
      gameId: 'chess',
      tags: ['chess', 'moves', 'play', 'wait', 'turn', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Chess session id to update'),
        from: chessSquareSchema.describe('Source square such as e2'),
        to: chessSquareSchema.describe('Target square such as e4'),
        promotion: chessPromotionSchema.optional().describe('Optional promotion piece when a pawn promotes'),
        timeoutMs: z
          .number()
          .int()
          .min(1_000)
          .max(600_000)
          .default(60_000)
          .describe('Maximum time to wait for this side to move again after the move is played'),
        reasoning: reasoningSchema.describe('Required reasoning summary shown in the shared timeline for this exact move'),
      },
      annotations: {
        title: 'Play Chess Move And Wait',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, from, to, promotion, timeoutMs, reasoning } = z
          .object({
            sessionId: z.string().uuid(),
            from: chessSquareSchema,
            to: chessSquareSchema,
            promotion: chessPromotionSchema.optional(),
            timeoutMs: z.number().int().min(1_000).max(600_000).default(60_000),
            reasoning: reasoningSchema,
          })
          .parse(input)

        const result = await service.playMoveAndWait(
          sessionId,
          {
            from,
            to,
            promotion,
            actorKind: 'agent',
            channel: 'mcp',
            reasoning,
          },
          {
            timeoutMs,
          },
        )

        return textResult(
          'Played one Chess move and waited until the opponent replied and the turn came back. IMPORTANT: this tool is for one foreground blocking MCP call, not a detached background process. Your MCP client request timeout must be greater than timeoutMs; prefer 600000 ms for long local play. If the status is ready, re-read the state and call the next move tool immediately. If the user asked for a full game, repeat this cycle until the game finishes. NEVER send a chat reply before you either play the next move or decide to stop.',
          result,
        )
      },
    },
  ]
}
