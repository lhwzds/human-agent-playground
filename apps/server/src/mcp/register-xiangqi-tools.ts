import * as z from 'zod/v4'

import type { GameService } from '../game-service.js'
import { textResult, type ToolCatalogEntry } from './tool-catalog.js'

export function createXiangqiToolCatalog(service: GameService): ToolCatalogEntry[] {
  return [
    {
      name: 'xiangqi_get_legal_moves',
      title: 'Xiangqi Legal Moves',
      description:
        'List legal Xiangqi moves for a session. Use this as the source of truth for Xiangqi move legality. Provide `from` to narrow the result to one piece, or omit it to inspect the whole position.',
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
        'Play exactly one Xiangqi move for the current side to move. Re-read the latest state first, inspect legal moves, and submit a fresh reasoning summary for this exact move. IMPORTANT: in a long-running turn loop, this tool call is the response. NEVER stop to send a chat reply before moving. NEVER send cached explanations or a multi-move plan.',
      category: 'gameplay',
      gameId: 'xiangqi',
      tags: ['xiangqi', 'moves', 'play', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Xiangqi session id to update'),
        from: z.string().regex(/^[a-i](10|[1-9])$/).describe('Source square'),
        to: z.string().regex(/^[a-i](10|[1-9])$/).describe('Target square'),
        reasoning: z
          .object({
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
          .describe('Required reasoning summary shown in the shared timeline for this exact move'),
      },
      annotations: {
        title: 'Play Xiangqi Move',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, from, to, reasoning } = z
          .object({
            sessionId: z.string().uuid(),
            from: z.string().regex(/^[a-i](10|[1-9])$/),
            to: z.string().regex(/^[a-i](10|[1-9])$/),
            reasoning: z
              .object({
                summary: z.string().min(1),
                reasoningSteps: z.array(z.string().min(1)).min(1),
                consideredAlternatives: z
                  .array(
                    z.object({
                      action: z.string().min(1),
                      summary: z.string().min(1),
                      rejectedBecause: z.string().min(1).optional(),
                    }),
                  )
                  .optional(),
                confidence: z.number().min(0).max(1).nullable().optional(),
              })
              .describe('Fresh current-position reasoning for this move'),
          })
          .parse(input)

        const session = await service.playMove(sessionId, {
          from,
          to,
          actorKind: 'agent',
          channel: 'mcp',
          reasoning,
        })
        return textResult(
          'Updated Xiangqi game state. IMPORTANT: if you are in a turn loop, continue with MCP tool calls. NEVER reply in chat until this move cycle is complete.',
          session,
        )
      },
    },
    {
      name: 'xiangqi_play_move_and_wait',
      title: 'Play Xiangqi Move And Wait',
      description:
        'Play exactly one Xiangqi move for the current side to move, then keep waiting inside the MCP server until the opponent completes exactly one reply and it is that same side’s turn again, the game finishes, or the timeout expires. Prefer this in long-running human-agent shared play because it keeps play and wait inside one MCP tool call. IMPORTANT: when this returns ready, re-read the state and call the next move tool immediately. If the user asked for a full game, keep repeating this cycle until the game finishes. NEVER treat the move submission as the end of the run.',
      category: 'gameplay',
      gameId: 'xiangqi',
      tags: ['xiangqi', 'moves', 'play', 'wait', 'turn', 'write'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The Xiangqi session id to update'),
        from: z.string().regex(/^[a-i](10|[1-9])$/).describe('Source square'),
        to: z.string().regex(/^[a-i](10|[1-9])$/).describe('Target square'),
        timeoutMs: z
          .number()
          .int()
          .min(1_000)
          .max(300_000)
          .default(60_000)
          .describe('Maximum time to wait for this side to move again after the move is played'),
        reasoning: z
          .object({
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
          .describe('Required reasoning summary shown in the shared timeline for this exact move'),
      },
      annotations: {
        title: 'Play Xiangqi Move And Wait',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId, from, to, timeoutMs, reasoning } = z
          .object({
            sessionId: z.string().uuid(),
            from: z.string().regex(/^[a-i](10|[1-9])$/),
            to: z.string().regex(/^[a-i](10|[1-9])$/),
            timeoutMs: z.number().int().min(1_000).max(300_000).default(60_000),
            reasoning: z
              .object({
                summary: z.string().min(1),
                reasoningSteps: z.array(z.string().min(1)).min(1),
                consideredAlternatives: z
                  .array(
                    z.object({
                      action: z.string().min(1),
                      summary: z.string().min(1),
                      rejectedBecause: z.string().min(1).optional(),
                    }),
                  )
                  .optional(),
                confidence: z.number().min(0).max(1).nullable().optional(),
              })
              .describe('Fresh current-position reasoning for this move'),
          })
          .parse(input)

        const result = await service.playMoveAndWait(
          sessionId,
          {
            from,
            to,
            actorKind: 'agent',
            channel: 'mcp',
            reasoning,
          },
          {
            timeoutMs,
          },
        )

        return textResult(
          'Played one Xiangqi move and waited until the opponent replied and the turn came back. IMPORTANT: if the status is ready, re-read the state and call the next move tool immediately. If the user asked for a full game, repeat this cycle until the game finishes. NEVER send a chat reply before you either play the next move or decide to stop.',
          result,
        )
      },
    },
  ]
}
