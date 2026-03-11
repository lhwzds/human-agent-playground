import * as z from 'zod/v4'

import type { GameService } from '../game-service.js'
import { textResult, type ToolCatalogEntry } from './tool-catalog.js'

const othelloPointSchema = z.string().regex(/^[a-h][1-8]$/)

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

export function createOthelloToolCatalog(service: GameService): ToolCatalogEntry[] {
  return [
    {
      name: 'othello_get_legal_moves',
      title: 'Othello Legal Moves',
      description:
        'List legal Othello placements for a session. Omit `point` to inspect every legal square, or provide `point` to verify one candidate move and the discs it would flip.',
      category: 'gameplay',
      gameId: 'othello',
      tags: ['othello', 'moves', 'legal', 'read'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Othello session id to inspect'),
        point: othelloPointSchema.optional().describe('Optional candidate point such as d3 or f5'),
      },
      annotations: {
        title: 'Othello Legal Moves',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, point } = z
          .object({
            sessionId: z.string().uuid(),
            point: othelloPointSchema.optional(),
          })
          .parse(input)

        const moves = {
          moves: await service.getLegalMoves(sessionId, point ? { point } : undefined),
        }
        return textResult('Othello legal moves', moves)
      },
    },
    {
      name: 'othello_play_move',
      title: 'Play Othello Move',
      description:
        'Play exactly one Othello move for the current side to move. Re-read the latest state first, inspect legal points, and submit a fresh reasoning summary for this exact placement. IMPORTANT: in a long-running turn loop, this tool call is the response. NEVER stop to send a chat reply before moving. NEVER send cached explanations or a multi-move plan.',
      category: 'gameplay',
      gameId: 'othello',
      tags: ['othello', 'moves', 'play', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Othello session id to update'),
        point: othelloPointSchema.describe('Target point for the disc placement'),
        reasoning: reasoningSchema.describe('Required reasoning summary shown in the shared timeline for this exact move'),
      },
      annotations: {
        title: 'Play Othello Move',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, point, reasoning } = z
          .object({
            sessionId: z.string().uuid(),
            point: othelloPointSchema,
            reasoning: reasoningSchema,
          })
          .parse(input)

        const session = await service.playMove(sessionId, {
          point,
          actorKind: 'agent',
          channel: 'mcp',
          reasoning,
        })
        return textResult(
          'Updated Othello game state. IMPORTANT: if you are in a turn loop, continue with MCP tool calls. NEVER reply in chat until this move cycle is complete.',
          session,
        )
      },
    },
    {
      name: 'othello_play_move_and_wait',
      title: 'Play Othello Move And Wait',
      description:
        'Play exactly one Othello move for the current side to move, then keep waiting inside the MCP server until the opponent completes exactly one reply and it is that same side’s turn again, the game finishes, or the timeout expires. Prefer this in long-running human-agent shared play because it keeps play and wait inside one MCP tool call. IMPORTANT: when this returns ready, re-read the state and call the next move tool immediately. If the user asked for a full game, keep repeating this cycle until the game finishes. NEVER treat the move submission as the end of the run.',
      category: 'gameplay',
      gameId: 'othello',
      tags: ['othello', 'moves', 'play', 'wait', 'turn', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Othello session id to update'),
        point: othelloPointSchema.describe('Target point for the disc placement'),
        timeoutMs: z
          .number()
          .int()
          .min(1_000)
          .max(300_000)
          .default(60_000)
          .describe('Maximum time to wait for this side to move again after the move is played'),
        reasoning: reasoningSchema.describe('Required reasoning summary shown in the shared timeline for this exact move'),
      },
      annotations: {
        title: 'Play Othello Move And Wait',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, point, timeoutMs, reasoning } = z
          .object({
            sessionId: z.string().uuid(),
            point: othelloPointSchema,
            timeoutMs: z.number().int().min(1_000).max(300_000).default(60_000),
            reasoning: reasoningSchema,
          })
          .parse(input)

        const result = await service.playMoveAndWait(
          sessionId,
          {
            point,
            actorKind: 'agent',
            channel: 'mcp',
            reasoning,
          },
          {
            timeoutMs,
          },
        )

        return textResult(
          'Played one Othello move and waited until the opponent replied and the turn came back. IMPORTANT: if the status is ready, re-read the state and call the next move tool immediately. If the user asked for a full game, repeat this cycle until the game finishes. NEVER send a chat reply before you either play the next move or decide to stop.',
          result,
        )
      },
    },
  ]
}
