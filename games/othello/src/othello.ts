import type {
  OthelloBoard,
  OthelloCoordinates,
  OthelloDisc,
  OthelloGameState,
  OthelloLegalMove,
  OthelloMove,
  OthelloPoint,
  OthelloSide,
} from './types'

export const OTHELLO_BOARD_SIZE = 8
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const DIRECTIONS = [
  { row: -1, col: -1 },
  { row: -1, col: 0 },
  { row: -1, col: 1 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
] as const

const DISC_DISPLAYS: Record<OthelloSide, string> = {
  black: '●',
  white: '○',
}

function createEmptyBoard(): OthelloBoard {
  return Array.from({ length: OTHELLO_BOARD_SIZE }, () =>
    Array.from({ length: OTHELLO_BOARD_SIZE }, () => null),
  )
}

function cloneBoard(board: OthelloBoard): OthelloBoard {
  return board.map((row) => row.map((disc) => (disc ? { ...disc } : null)))
}

function isInsideBoard(row: number, col: number): boolean {
  return row >= 0 && row < OTHELLO_BOARD_SIZE && col >= 0 && col < OTHELLO_BOARD_SIZE
}

function createDisc(side: OthelloSide): OthelloDisc {
  return {
    side,
    display: DISC_DISPLAYS[side],
  }
}

function getOpposingSide(side: OthelloSide): OthelloSide {
  return side === 'black' ? 'white' : 'black'
}

export function pointToCoordinates(point: OthelloPoint): OthelloCoordinates {
  const match = /^([a-h])([1-8])$/.exec(point)
  if (!match) {
    throw new Error(`Invalid Othello point: ${point}`)
  }

  return {
    row: OTHELLO_BOARD_SIZE - Number(match[2]),
    col: FILES.indexOf(match[1] as (typeof FILES)[number]),
  }
}

export function coordinatesToPoint(row: number, col: number): OthelloPoint {
  if (!isInsideBoard(row, col)) {
    throw new Error(`Invalid Othello coordinates: ${row},${col}`)
  }

  return `${FILES[col]}${OTHELLO_BOARD_SIZE - row}` as OthelloPoint
}

function collectDirectionFlips(
  board: OthelloBoard,
  origin: OthelloCoordinates,
  side: OthelloSide,
  rowDelta: number,
  colDelta: number,
): OthelloCoordinates[] {
  const flips: OthelloCoordinates[] = []
  let row = origin.row + rowDelta
  let col = origin.col + colDelta
  const opposingSide = getOpposingSide(side)

  while (isInsideBoard(row, col)) {
    const disc = board[row][col]
    if (!disc) {
      return []
    }

    if (disc.side === opposingSide) {
      flips.push({ row, col })
      row += rowDelta
      col += colDelta
      continue
    }

    return disc.side === side && flips.length > 0 ? flips : []
  }

  return []
}

function collectLegalMove(
  board: OthelloBoard,
  point: OthelloPoint,
  side: OthelloSide,
): OthelloLegalMove | null {
  const { row, col } = pointToCoordinates(point)
  if (board[row][col]) {
    return null
  }

  const flips = DIRECTIONS.flatMap((direction) =>
    collectDirectionFlips(board, { row, col }, side, direction.row, direction.col),
  )

  if (flips.length === 0) {
    return null
  }

  return {
    point,
    flips: flips.map((coordinates) => coordinatesToPoint(coordinates.row, coordinates.col)),
  }
}

function countDiscs(board: OthelloBoard) {
  let blackCount = 0
  let whiteCount = 0

  for (const row of board) {
    for (const disc of row) {
      if (disc?.side === 'black') {
        blackCount += 1
      } else if (disc?.side === 'white') {
        whiteCount += 1
      }
    }
  }

  return { blackCount, whiteCount }
}

function buildGameState(
  board: OthelloBoard,
  turn: OthelloSide,
  lastMove: OthelloMove | null,
  moveCount: number,
  status: 'active' | 'finished',
): OthelloGameState {
  const counts = countDiscs(board)
  const winner =
    status === 'finished'
      ? counts.blackCount === counts.whiteCount
        ? null
        : counts.blackCount > counts.whiteCount
          ? 'black'
          : 'white'
      : null

  return {
    kind: 'othello',
    board,
    turn,
    status,
    winner,
    lastMove,
    moveCount,
    blackCount: counts.blackCount,
    whiteCount: counts.whiteCount,
  }
}

function getAllLegalMoves(board: OthelloBoard, side: OthelloSide): OthelloLegalMove[] {
  const moves: OthelloLegalMove[] = []

  for (let row = 0; row < OTHELLO_BOARD_SIZE; row += 1) {
    for (let col = 0; col < OTHELLO_BOARD_SIZE; col += 1) {
      const point = coordinatesToPoint(row, col)
      const move = collectLegalMove(board, point, side)
      if (move) {
        moves.push(move)
      }
    }
  }

  return moves
}

function createMove(point: OthelloPoint, side: OthelloSide, flips: OthelloPoint[]): OthelloMove {
  return {
    point,
    side,
    disc: createDisc(side),
    notation: point,
    flippedPoints: flips,
  }
}

export function createInitialOthelloGame(): OthelloGameState {
  const board = createEmptyBoard()
  board[3][3] = createDisc('black')
  board[3][4] = createDisc('white')
  board[4][3] = createDisc('white')
  board[4][4] = createDisc('black')

  return buildGameState(board, 'black', null, 0, 'active')
}

export function listLegalMoves(
  state: OthelloGameState,
  point?: OthelloPoint,
): OthelloLegalMove[] {
  if (state.status === 'finished') {
    return []
  }

  if (point) {
    const move = collectLegalMove(state.board, point, state.turn)
    return move ? [move] : []
  }

  return getAllLegalMoves(state.board, state.turn)
}

export function playOthelloMove(state: OthelloGameState, point: OthelloPoint): OthelloGameState {
  if (state.status === 'finished') {
    throw new Error('Cannot play a move after the Othello game has finished')
  }

  const legalMove = collectLegalMove(state.board, point, state.turn)
  if (!legalMove) {
    throw new Error(`Point ${point} is not a legal Othello move`)
  }

  const board = cloneBoard(state.board)
  const { row, col } = pointToCoordinates(point)
  board[row][col] = createDisc(state.turn)

  for (const flippedPoint of legalMove.flips) {
    const flippedCoordinates = pointToCoordinates(flippedPoint)
    board[flippedCoordinates.row][flippedCoordinates.col] = createDisc(state.turn)
  }

  const opponent = getOpposingSide(state.turn)
  const opponentMoves = getAllLegalMoves(board, opponent)
  const currentMoves = opponentMoves.length === 0 ? getAllLegalMoves(board, state.turn) : []
  const nextTurn = opponentMoves.length > 0 ? opponent : state.turn
  const status = opponentMoves.length === 0 && currentMoves.length === 0 ? 'finished' : 'active'

  return buildGameState(
    board,
    nextTurn,
    createMove(point, state.turn, legalMove.flips),
    state.moveCount + 1,
    status,
  )
}
