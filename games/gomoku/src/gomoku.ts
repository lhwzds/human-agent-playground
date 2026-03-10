import type {
  GomokuBoard,
  GomokuCoordinates,
  GomokuGameState,
  GomokuLegalMove,
  GomokuMove,
  GomokuPoint,
  GomokuSide,
  GomokuStone,
} from './types'

export const GOMOKU_BOARD_SIZE = 15
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o'] as const
const DIRECTIONS = [
  { row: 1, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 1 },
  { row: 1, col: -1 },
] as const

const STONE_DISPLAYS: Record<GomokuSide, string> = {
  black: '●',
  white: '○',
}

function createEmptyBoard(): GomokuBoard {
  return Array.from({ length: GOMOKU_BOARD_SIZE }, () =>
    Array.from({ length: GOMOKU_BOARD_SIZE }, () => null),
  )
}

function cloneBoard(board: GomokuBoard): GomokuBoard {
  return board.map((row) => row.map((stone) => (stone ? { ...stone } : null)))
}

function isInsideBoard(row: number, col: number): boolean {
  return row >= 0 && row < GOMOKU_BOARD_SIZE && col >= 0 && col < GOMOKU_BOARD_SIZE
}

function createStone(side: GomokuSide): GomokuStone {
  return {
    side,
    display: STONE_DISPLAYS[side],
  }
}

function getOpposingSide(side: GomokuSide): GomokuSide {
  return side === 'black' ? 'white' : 'black'
}

export function pointToCoordinates(point: GomokuPoint): GomokuCoordinates {
  const match = /^([a-o])(1[0-5]|[1-9])$/.exec(point)
  if (!match) {
    throw new Error(`Invalid Gomoku point: ${point}`)
  }

  const file = match[1]
  const rank = Number(match[2])
  return {
    row: GOMOKU_BOARD_SIZE - rank,
    col: FILES.indexOf(file as (typeof FILES)[number]),
  }
}

export function coordinatesToPoint(row: number, col: number): GomokuPoint {
  if (!isInsideBoard(row, col)) {
    throw new Error(`Invalid Gomoku coordinates: ${row},${col}`)
  }

  return `${FILES[col]}${GOMOKU_BOARD_SIZE - row}` as GomokuPoint
}

function collectDirection(
  board: GomokuBoard,
  origin: GomokuCoordinates,
  side: GomokuSide,
  rowDelta: number,
  colDelta: number,
): GomokuCoordinates[] {
  const points: GomokuCoordinates[] = []
  let row = origin.row + rowDelta
  let col = origin.col + colDelta

  while (isInsideBoard(row, col) && board[row][col]?.side === side) {
    points.push({ row, col })
    row += rowDelta
    col += colDelta
  }

  return points
}

function findWinningLine(
  board: GomokuBoard,
  origin: GomokuCoordinates,
  side: GomokuSide,
): GomokuPoint[] | null {
  for (const direction of DIRECTIONS) {
    const backward = collectDirection(board, origin, side, -direction.row, -direction.col).reverse()
    const forward = collectDirection(board, origin, side, direction.row, direction.col)
    const line = [...backward, origin, ...forward]

    if (line.length >= 5) {
      return line.map((coordinates) => coordinatesToPoint(coordinates.row, coordinates.col))
    }
  }

  return null
}

function isBoardFull(board: GomokuBoard): boolean {
  return board.every((row) => row.every((stone) => stone !== null))
}

function createMove(point: GomokuPoint, side: GomokuSide): GomokuMove {
  return {
    point,
    side,
    stone: createStone(side),
    notation: point,
  }
}

function buildGameState(
  board: GomokuBoard,
  turn: GomokuSide,
  lastMove: GomokuMove | null,
  moveCount: number,
  winningLine: GomokuPoint[] | null,
): GomokuGameState {
  const winner = winningLine ? lastMove?.side ?? null : null
  const isDraw = !winner && isBoardFull(board)

  return {
    kind: 'gomoku',
    board,
    turn,
    status: winner || isDraw ? 'finished' : 'active',
    winner,
    lastMove,
    moveCount,
    winningLine,
  }
}

export function createInitialGomokuGame(): GomokuGameState {
  return buildGameState(createEmptyBoard(), 'black', null, 0, null)
}

export function listLegalMoves(
  state: GomokuGameState,
  point?: GomokuPoint,
): GomokuLegalMove[] {
  if (state.status === 'finished') {
    return []
  }

  if (point) {
    const { row, col } = pointToCoordinates(point)
    return state.board[row][col] ? [] : [{ point }]
  }

  const legalMoves: GomokuLegalMove[] = []

  for (let row = 0; row < GOMOKU_BOARD_SIZE; row += 1) {
    for (let col = 0; col < GOMOKU_BOARD_SIZE; col += 1) {
      if (!state.board[row][col]) {
        legalMoves.push({ point: coordinatesToPoint(row, col) })
      }
    }
  }

  return legalMoves
}

export function playGomokuMove(
  state: GomokuGameState,
  point: GomokuPoint,
): GomokuGameState {
  if (state.status === 'finished') {
    throw new Error('Cannot play a move after the Gomoku game has finished')
  }

  const { row, col } = pointToCoordinates(point)
  if (state.board[row][col]) {
    throw new Error(`Point ${point} is already occupied`)
  }

  const board = cloneBoard(state.board)
  const stone = createStone(state.turn)
  board[row][col] = stone

  const lastMove = createMove(point, state.turn)
  const winningLine = findWinningLine(board, { row, col }, state.turn)

  return buildGameState(
    board,
    getOpposingSide(state.turn),
    lastMove,
    state.moveCount + 1,
    winningLine,
  )
}
