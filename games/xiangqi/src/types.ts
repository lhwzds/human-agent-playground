import { sessionStatusSchema } from '@human-agent-playground/core'
import { z } from 'zod'

export const sideSchema = z.enum(['red', 'black'])
export type Side = z.infer<typeof sideSchema>

export const xiangqiPieceTypeSchema = z.enum([
  'general',
  'advisor',
  'elephant',
  'horse',
  'rook',
  'cannon',
  'soldier',
])
export type XiangqiPieceType = z.infer<typeof xiangqiPieceTypeSchema>

export const xiangqiPieceSchema = z.object({
  side: sideSchema,
  type: xiangqiPieceTypeSchema,
  fenChar: z.string().length(1),
  display: z.string().min(1),
})
export type XiangqiPiece = z.infer<typeof xiangqiPieceSchema>

export const squareSchema = z
  .string()
  .regex(/^[a-i](10|[1-9])$/)
export type Square = z.infer<typeof squareSchema>

export const xiangqiMoveSchema = z.object({
  from: squareSchema,
  to: squareSchema,
  side: sideSchema,
  piece: xiangqiPieceSchema,
  captured: xiangqiPieceSchema.nullable(),
  notation: z.string().min(4),
})
export type XiangqiMove = z.infer<typeof xiangqiMoveSchema>

export const xiangqiGameStateSchema = z.object({
  kind: z.literal('xiangqi'),
  fen: z.string().min(1),
  board: z.array(z.array(xiangqiPieceSchema.nullable())),
  turn: sideSchema,
  status: sessionStatusSchema,
  winner: sideSchema.nullable(),
  lastMove: xiangqiMoveSchema.nullable(),
  moveCount: z.number().int().nonnegative(),
  isCheck: z.boolean(),
})
export type XiangqiGameState = z.infer<typeof xiangqiGameStateSchema>

export const playMoveInputSchema = z.object({
  from: squareSchema,
  to: squareSchema,
})
export type PlayMoveInput = z.infer<typeof playMoveInputSchema>

export interface BoardCoordinates {
  row: number
  col: number
}

export type XiangqiBoard = Array<Array<XiangqiPiece | null>>
