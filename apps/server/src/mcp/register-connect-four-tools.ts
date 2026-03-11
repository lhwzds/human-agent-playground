import * as z from 'zod/v4'

import type { GameService } from '../game-service.js'
import { textResult, type ToolCatalogEntry } from './tool-catalog.js'

const connectFourColumnSchema = z.number().int().min(1).max(7)

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

export function createConnectFourToolCatalog(service: GameService): ToolCatalogEntry[] {
  return [
    {
      name: 'connect_four_get_legal_moves',
      title: 'Connect Four Legal Moves',
      description:
        'List legal Connect Four drops for a session. Omit `column` to inspect every playable column, or provide `column` to verify one candidate drop.',
      category: 'gameplay',
      gameId: 'connect-four',
      tags: ['connect-four', 'moves', 'legal', 'read'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Connect Four session id to inspect'),
        column: connectFourColumnSchema.optional().describe('Optional candidate column between 1 and 7'),
      },
      annotations: {
        title: 'Connect Four Legal Moves',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, column } = z
          .object({
            sessionId: z.string().uuid(),
            column: connectFourColumnSchema.optional(),
          })
          .parse(input)

        const moves = {
          moves: await service.getLegalMoves(sessionId, typeof column === 'number' ? { column } : undefined),
        }
        return textResult('Connect Four legal moves', moves)
      },
    },
    {
      name: 'connect_four_play_move',
      title: 'Play Connect Four Move',
      description:
        'Drop exactly one Connect Four disc in the current column. Re-read the latest state first, inspect legal columns, and submit a fresh reasoning summary for this exact drop. IMPORTANT: in a long-running turn loop, this tool call is the response. NEVER stop to send a chat reply before moving. NEVER send cached explanations or a multi-move plan.',
      category: 'gameplay',
      gameId: 'connect-four',
      tags: ['connect-four', 'moves', 'play', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Connect Four session id to update'),
        column: connectFourColumnSchema.describe('Target column between 1 and 7'),
        reasoning: reasoningSchema.describe('Required reasoning summary shown in the shared timeline for this exact move'),
      },
      annotations: {
        title: 'Play Connect Four Move',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, column, reasoning } = z
          .object({
            sessionId: z.string().uuid(),
            column: connectFourColumnSchema,
            reasoning: reasoningSchema,
          })
          .parse(input)

        const session = await service.playMove(sessionId, {
          column,
          actorKind: 'agent',
          channel: 'mcp',
          reasoning,
        })

        return textResult(
          'Updated Connect Four game state. IMPORTANT: if you are in a turn loop, continue with MCP tool calls. NEVER reply in chat until this move cycle is complete.',
          session,
        )
      },
    },
    {
      name: 'connect_four_play_move_and_wait',
      title: 'Play Connect Four Move And Wait',
      description:
        'Play exactly one Connect Four move for the current side to move, then keep waiting inside the MCP server until the opponent completes exactly one reply and it is that same side’s turn again, the game finishes, or the timeout expires. Prefer this in long-running human-agent shared play because it keeps play and wait inside one MCP tool call. IMPORTANT: when this returns ready, re-read the state and call the next move tool immediately. If the user asked for a full game, keep repeating this cycle until the game finishes. NEVER treat the move submission as the end of the run.',
      category: 'gameplay',
      gameId: 'connect-four',
      tags: ['connect-four', 'moves', 'play', 'wait', 'turn', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Connect Four session id to update'),
        column: connectFourColumnSchema.describe('Target column between 1 and 7'),
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
        title: 'Play Connect Four Move And Wait',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, column, timeoutMs, reasoning } = z
          .object({
            sessionId: z.string().uuid(),
            column: connectFourColumnSchema,
            timeoutMs: z.number().int().min(1_000).max(300_000).default(60_000),
            reasoning: reasoningSchema,
          })
          .parse(input)

        const result = await service.playMoveAndWait(
          sessionId,
          {
            column,
            actorKind: 'agent',
            channel: 'mcp',
            reasoning,
          },
          {
            timeoutMs,
          },
        )

        return textResult(
          'Played one Connect Four move and waited until the opponent replied and the turn came back. IMPORTANT: if the status is ready, re-read the state and call the next move tool immediately. If the user asked for a full game, repeat this cycle until the game finishes. NEVER send a chat reply before you either play the next move or decide to stop.',
          result,
        )
      },
    },
  ]
}
