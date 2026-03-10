import { sessionStatusSchema } from '@human-agent-playground/core'
import { z } from 'zod'

export const gomokuSideSchema = z.enum(['black', 'white'])
export type GomokuSide = z.infer<typeof gomokuSideSchema>

export const gomokuStoneSchema = z.object({
  side: gomokuSideSchema,
  display: z.string().min(1),
})
export type GomokuStone = z.infer<typeof gomokuStoneSchema>

export const gomokuPointSchema = z
  .string()
  .regex(/^[a-o](1[0-5]|[1-9])$/)
export type GomokuPoint = z.infer<typeof gomokuPointSchema>

export const gomokuLegalMoveSchema = z.object({
  point: gomokuPointSchema,
})
export type GomokuLegalMove = z.infer<typeof gomokuLegalMoveSchema>

export const gomokuMoveSchema = z.object({
  point: gomokuPointSchema,
  side: gomokuSideSchema,
  stone: gomokuStoneSchema,
  notation: z.string().min(2),
})
export type GomokuMove = z.infer<typeof gomokuMoveSchema>

export const gomokuGameStateSchema = z.object({
  kind: z.literal('gomoku'),
  board: z.array(z.array(gomokuStoneSchema.nullable())),
  turn: gomokuSideSchema,
  status: sessionStatusSchema,
  winner: gomokuSideSchema.nullable(),
  lastMove: gomokuMoveSchema.nullable(),
  moveCount: z.number().int().nonnegative(),
  winningLine: z.array(gomokuPointSchema).nullable(),
})
export type GomokuGameState = z.infer<typeof gomokuGameStateSchema>

export const playGomokuMoveInputSchema = z.object({
  point: gomokuPointSchema,
})
export type PlayGomokuMoveInput = z.infer<typeof playGomokuMoveInputSchema>

export interface GomokuCoordinates {
  row: number
  col: number
}

export type GomokuBoard = Array<Array<GomokuStone | null>>
