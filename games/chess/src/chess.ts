import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'

import type {
  ChessBoard,
  ChessCoordinates,
  ChessGameState,
  ChessLegalMove,
  ChessMove,
  ChessPiece,
  ChessPieceType,
  ChessPromotion,
  ChessSide,
  ChessSquare,
} from './types'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const PIECE_TYPE_BY_SYMBOL: Record<PieceSymbol, ChessPieceType> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}
const SYMBOL_BY_PIECE_TYPE: Record<ChessPieceType, PieceSymbol> = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
}
const PIECE_DISPLAYS: Record<ChessSide, Record<ChessPieceType, string>> = {
  white: {
    king: '♔',
    queen: '♕',
    rook: '♖',
    bishop: '♗',
    knight: '♘',
    pawn: '♙',
  },
  black: {
    king: '♚',
    queen: '♛',
    rook: '♜',
    bishop: '♝',
    knight: '♞',
    pawn: '♟',
  },
}

function colorToSide(color: Color): ChessSide {
  return color === 'w' ? 'white' : 'black'
}

function sideToColor(side: ChessSide): Color {
  return side === 'white' ? 'w' : 'b'
}

function getOpposingSide(side: ChessSide): ChessSide {
  return side === 'white' ? 'black' : 'white'
}

function symbolToPieceType(symbol: PieceSymbol): ChessPieceType {
  return PIECE_TYPE_BY_SYMBOL[symbol]
}

function createPiece(side: ChessSide, type: ChessPieceType): ChessPiece {
  return {
    side,
    type,
    display: PIECE_DISPLAYS[side][type],
  }
}

function createBoard(engine: Chess): ChessBoard {
  return engine.board().map((row) =>
    row.map((squarePiece) => {
      if (!squarePiece) {
        return null
      }

      return createPiece(colorToSide(squarePiece.color), symbolToPieceType(squarePiece.type))
    }),
  )
}

export function squareToCoordinates(square: ChessSquare): ChessCoordinates {
  const match = /^([a-h])([1-8])$/.exec(square)
  if (!match) {
    throw new Error(`Invalid Chess square: ${square}`)
  }

  return {
    row: 8 - Number(match[2]),
    col: FILES.indexOf(match[1] as (typeof FILES)[number]),
  }
}

export function coordinatesToSquare(row: number, col: number): ChessSquare {
  if (row < 0 || row > 7 || col < 0 || col > 7) {
    throw new Error(`Invalid Chess coordinates: ${row},${col}`)
  }

  return `${FILES[col]}${8 - row}` as ChessSquare
}

function normalizePromotion(value: PieceSymbol | undefined): ChessPromotion | null {
  if (!value) {
    return null
  }

  return symbolToPieceType(value) as ChessPromotion
}

function createLegalMove(move: Move): ChessLegalMove {
  return {
    from: move.from as ChessSquare,
    to: move.to as ChessSquare,
    side: colorToSide(move.color),
    piece: symbolToPieceType(move.piece),
    san: move.san,
    notation: move.lan,
    flags: move.flags,
    captured: move.captured ? symbolToPieceType(move.captured) : null,
    promotion: normalizePromotion(move.promotion),
  }
}

function createLastMove(move: Move): ChessMove {
  const side = colorToSide(move.color)
  const piece = createPiece(side, symbolToPieceType(move.piece))
  const captured = move.captured
    ? createPiece(getOpposingSide(side), symbolToPieceType(move.captured))
    : null
  const promotion = move.promotion
    ? createPiece(side, symbolToPieceType(move.promotion))
    : null

  return {
    from: move.from as ChessSquare,
    to: move.to as ChessSquare,
    side,
    piece,
    san: move.san,
    notation: move.lan,
    flags: move.flags,
    captured,
    promotion,
  }
}

function buildGameState(engine: Chess, lastMove: ChessMove | null, moveCount: number): ChessGameState {
  const isFinished = engine.isGameOver()
  let winner: ChessSide | 'draw' | null = null

  if (isFinished) {
    winner = engine.isCheckmate() ? getOpposingSide(colorToSide(engine.turn())) : 'draw'
  }

  return {
    kind: 'chess',
    fen: engine.fen(),
    board: createBoard(engine),
    turn: colorToSide(engine.turn()),
    status: isFinished ? 'finished' : 'active',
    winner,
    isCheck: engine.isCheck(),
    lastMove,
    moveCount,
  }
}

function loadEngine(state: ChessGameState) {
  return new Chess(state.fen)
}

function resolveMove(
  moves: Move[],
  from: ChessSquare,
  to: ChessSquare,
  promotion?: ChessPromotion,
): Move {
  const candidates = moves.filter((move) => move.from === from && move.to === to)
  if (candidates.length === 0) {
    throw new Error(`Move ${from} -> ${to} is not legal in the current Chess position`)
  }

  if (promotion) {
    const symbol = SYMBOL_BY_PIECE_TYPE[promotion]
    const exact = candidates.find((move) => move.promotion === symbol)
    if (!exact) {
      throw new Error(`Promotion ${promotion} is not legal for ${from} -> ${to}`)
    }

    return exact
  }

  return candidates.find((move) => move.promotion === 'q') ?? candidates[0]
}

export function createInitialChessGame(): ChessGameState {
  const engine = new Chess()
  return buildGameState(engine, null, 0)
}

export function listLegalMoves(
  state: ChessGameState,
  from?: ChessSquare,
): ChessLegalMove[] {
  if (state.status === 'finished') {
    return []
  }

  const engine = loadEngine(state)
  const moves = from
    ? engine.moves({ square: from as Square, verbose: true })
    : engine.moves({ verbose: true })

  return moves.map(createLegalMove)
}

export function playChessMove(
  state: ChessGameState,
  from: ChessSquare,
  to: ChessSquare,
  promotion?: ChessPromotion,
): ChessGameState {
  if (state.status === 'finished') {
    throw new Error('Cannot play a move after the Chess game has finished')
  }

  const engine = loadEngine(state)
  const move = resolveMove(
    engine.moves({ square: from as Square, verbose: true }),
    from,
    to,
    promotion,
  )

  const executed = engine.move({
    from,
    to,
    promotion: move.promotion,
  })

  if (!executed) {
    throw new Error(`Move ${from} -> ${to} could not be played`)
  }

  return buildGameState(engine, createLastMove(executed), state.moveCount + 1)
}
