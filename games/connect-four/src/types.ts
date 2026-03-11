import { sessionStatusSchema } from '@human-agent-playground/core'
import { z } from 'zod'

export const connectFourSideSchema = z.enum(['red', 'yellow'])
export type ConnectFourSide = z.infer<typeof connectFourSideSchema>

export const connectFourDiscSchema = z.object({
  side: connectFourSideSchema,
  display: z.string().min(1),
})
export type ConnectFourDisc = z.infer<typeof connectFourDiscSchema>

export const connectFourPointSchema = z.string().regex(/^[a-g][1-6]$/)
export type ConnectFourPoint = z.infer<typeof connectFourPointSchema>

export const connectFourColumnSchema = z.number().int().min(1).max(7)
export type ConnectFourColumn = z.infer<typeof connectFourColumnSchema>

export const connectFourLegalMoveSchema = z.object({
  column: connectFourColumnSchema,
  point: connectFourPointSchema,
})
export type ConnectFourLegalMove = z.infer<typeof connectFourLegalMoveSchema>

export const connectFourMoveSchema = z.object({
  column: connectFourColumnSchema,
  row: z.number().int().min(1).max(6),
  point: connectFourPointSchema,
  side: connectFourSideSchema,
  disc: connectFourDiscSchema,
  notation: z.string().min(1),
})
export type ConnectFourMove = z.infer<typeof connectFourMoveSchema>

export const connectFourGameStateSchema = z.object({
  kind: z.literal('connect-four'),
  board: z.array(z.array(connectFourDiscSchema.nullable())),
  turn: connectFourSideSchema,
  status: sessionStatusSchema,
  winner: connectFourSideSchema.nullable(),
  lastMove: connectFourMoveSchema.nullable(),
  moveCount: z.number().int().nonnegative(),
  winningLine: z.array(connectFourPointSchema).nullable(),
})
export type ConnectFourGameState = z.infer<typeof connectFourGameStateSchema>

export const playConnectFourMoveInputSchema = z.object({
  column: connectFourColumnSchema,
})
export type PlayConnectFourMoveInput = z.infer<typeof playConnectFourMoveInputSchema>

export interface ConnectFourCoordinates {
  row: number
  col: number
}

export type ConnectFourBoard = Array<Array<ConnectFourDisc | null>>
