import { sessionStatusSchema } from '@human-agent-playground/core'
import { z } from 'zod'

export const othelloSideSchema = z.enum(['black', 'white'])
export type OthelloSide = z.infer<typeof othelloSideSchema>

export const othelloDiscSchema = z.object({
  side: othelloSideSchema,
  display: z.string().min(1),
})
export type OthelloDisc = z.infer<typeof othelloDiscSchema>

export const othelloPointSchema = z.string().regex(/^[a-h][1-8]$/)
export type OthelloPoint = z.infer<typeof othelloPointSchema>

export const othelloLegalMoveSchema = z.object({
  point: othelloPointSchema,
  flips: z.array(othelloPointSchema),
})
export type OthelloLegalMove = z.infer<typeof othelloLegalMoveSchema>

export const othelloMoveSchema = z.object({
  point: othelloPointSchema,
  side: othelloSideSchema,
  disc: othelloDiscSchema,
  notation: z.string().min(2),
  flippedPoints: z.array(othelloPointSchema),
})
export type OthelloMove = z.infer<typeof othelloMoveSchema>

export const othelloGameStateSchema = z.object({
  kind: z.literal('othello'),
  board: z.array(z.array(othelloDiscSchema.nullable())),
  turn: othelloSideSchema,
  status: sessionStatusSchema,
  winner: othelloSideSchema.nullable(),
  lastMove: othelloMoveSchema.nullable(),
  moveCount: z.number().int().nonnegative(),
  blackCount: z.number().int().nonnegative(),
  whiteCount: z.number().int().nonnegative(),
})
export type OthelloGameState = z.infer<typeof othelloGameStateSchema>

export const playOthelloMoveInputSchema = z.object({
  point: othelloPointSchema,
})
export type PlayOthelloMoveInput = z.infer<typeof playOthelloMoveInputSchema>

export interface OthelloCoordinates {
  row: number
  col: number
}

export type OthelloBoard = Array<Array<OthelloDisc | null>>
