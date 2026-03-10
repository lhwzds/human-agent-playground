import * as z from 'zod/v4'

import type { GameService } from '../game-service.js'
import { textResult, type ToolCatalogEntry } from './tool-catalog.js'

const gomokuPointSchema = z.string().regex(/^[a-o](1[0-5]|[1-9])$/)

const reasoningSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe('Required move-specific summary generated from the current position'),
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

export function createGomokuToolCatalog(service: GameService): ToolCatalogEntry[] {
  return [
    {
      name: 'gomoku_get_legal_moves',
      title: 'Gomoku Legal Moves',
      description:
        'List legal Gomoku placements for a session. Omit `point` to inspect every open intersection, or provide `point` to verify one candidate placement.',
      category: 'gameplay',
      gameId: 'gomoku',
      tags: ['gomoku', 'moves', 'legal', 'read'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Gomoku session id to inspect'),
        point: gomokuPointSchema.optional().describe('Optional candidate point such as h8 or o15'),
      },
      annotations: {
        title: 'Gomoku Legal Moves',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, point } = z
          .object({
            sessionId: z.string().uuid(),
            point: gomokuPointSchema.optional(),
          })
          .parse(input)

        const moves = {
          moves: await service.getLegalMoves(sessionId, point ? { point } : undefined),
        }
        return textResult('Gomoku legal moves', moves)
      },
    },
    {
      name: 'gomoku_play_move',
      title: 'Play Gomoku Move',
      description:
        'Play exactly one Gomoku move for the current side to move. Re-read the latest state first, inspect legal points, and submit a fresh reasoning summary for this exact placement. IMPORTANT: in a long-running turn loop, this tool call is the response. NEVER stop to send a chat reply before moving. NEVER send cached explanations or a multi-move plan.',
      category: 'gameplay',
      gameId: 'gomoku',
      tags: ['gomoku', 'moves', 'play', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Gomoku session id to update'),
        point: gomokuPointSchema.describe('Target point for the stone placement'),
        reasoning: reasoningSchema.describe('Required reasoning summary shown in the shared timeline for this exact move'),
      },
      annotations: {
        title: 'Play Gomoku Move',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, point, reasoning } = z
          .object({
            sessionId: z.string().uuid(),
            point: gomokuPointSchema,
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
          'Updated Gomoku game state. IMPORTANT: if you are in a turn loop, continue with MCP tool calls. NEVER reply in chat until this move cycle is complete.',
          session,
        )
      },
    },
    {
      name: 'gomoku_play_move_and_wait',
      title: 'Play Gomoku Move And Wait',
      description:
        'Play exactly one Gomoku move for the current side to move, then keep waiting inside the MCP server until the opponent completes exactly one reply and it is that same side’s turn again, the game finishes, or the timeout expires. Prefer this in long-running human-agent shared play because it keeps play and wait inside one MCP tool call. IMPORTANT: when this returns ready, re-read the state and call the next move tool immediately. If the user asked for a full game, keep repeating this cycle until the game finishes. NEVER treat the move submission as the end of the run.',
      category: 'gameplay',
      gameId: 'gomoku',
      tags: ['gomoku', 'moves', 'play', 'wait', 'turn', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Gomoku session id to update'),
        point: gomokuPointSchema.describe('Target point for the stone placement'),
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
        title: 'Play Gomoku Move And Wait',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, point, timeoutMs, reasoning } = z
          .object({
            sessionId: z.string().uuid(),
            point: gomokuPointSchema,
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
          'Played one Gomoku move and waited until the opponent replied and the turn came back. IMPORTANT: if the status is ready, re-read the state and call the next move tool immediately. If the user asked for a full game, repeat this cycle until the game finishes. NEVER send a chat reply before you either play the next move or decide to stop.',
          result,
        )
      },
    },
  ]
}
