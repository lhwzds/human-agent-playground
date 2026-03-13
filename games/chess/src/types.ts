import { sessionStatusSchema } from '@human-agent-playground/core'
import { z } from 'zod'

export const chessSideSchema = z.enum(['white', 'black'])
export type ChessSide = z.infer<typeof chessSideSchema>

export const chessWinnerSchema = z.union([chessSideSchema, z.literal('draw')]).nullable()
export type ChessWinner = z.infer<typeof chessWinnerSchema>

export const chessPieceTypeSchema = z.enum(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'])
export type ChessPieceType = z.infer<typeof chessPieceTypeSchema>

export const chessPromotionSchema = z.enum(['queen', 'rook', 'bishop', 'knight'])
export type ChessPromotion = z.infer<typeof chessPromotionSchema>

export const chessPieceSchema = z.object({
  side: chessSideSchema,
  type: chessPieceTypeSchema,
  display: z.string().min(1),
})
export type ChessPiece = z.infer<typeof chessPieceSchema>

export const chessSquareSchema = z.string().regex(/^[a-h][1-8]$/)
export type ChessSquare = z.infer<typeof chessSquareSchema>

export const chessLegalMoveSchema = z.object({
  from: chessSquareSchema,
  to: chessSquareSchema,
  side: chessSideSchema,
  piece: chessPieceTypeSchema,
  san: z.string().min(1),
  notation: z.string().min(1),
  flags: z.string().min(1),
  captured: chessPieceTypeSchema.nullable(),
  promotion: chessPromotionSchema.nullable(),
})
export type ChessLegalMove = z.infer<typeof chessLegalMoveSchema>

export const chessMoveSchema = z.object({
  from: chessSquareSchema,
  to: chessSquareSchema,
  side: chessSideSchema,
  piece: chessPieceSchema,
  san: z.string().min(1),
  notation: z.string().min(1),
  flags: z.string().min(1),
  captured: chessPieceSchema.nullable(),
  promotion: chessPieceSchema.nullable(),
})
export type ChessMove = z.infer<typeof chessMoveSchema>

export const chessGameStateSchema = z.object({
  kind: z.literal('chess'),
  fen: z.string().min(1),
  board: z.array(z.array(chessPieceSchema.nullable())),
  turn: chessSideSchema,
  status: sessionStatusSchema,
  winner: chessWinnerSchema,
  isCheck: z.boolean(),
  lastMove: chessMoveSchema.nullable(),
  moveCount: z.number().int().nonnegative(),
})
export type ChessGameState = z.infer<typeof chessGameStateSchema>

export const playChessMoveInputSchema = z.object({
  from: chessSquareSchema,
  to: chessSquareSchema,
  promotion: chessPromotionSchema.optional(),
})
export type PlayChessMoveInput = z.infer<typeof playChessMoveInputSchema>

export interface ChessCoordinates {
  row: number
  col: number
}

export type ChessBoard = Array<Array<ChessPiece | null>>
