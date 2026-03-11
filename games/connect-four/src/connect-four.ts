import type {
  ConnectFourBoard,
  ConnectFourColumn,
  ConnectFourCoordinates,
  ConnectFourDisc,
  ConnectFourGameState,
  ConnectFourLegalMove,
  ConnectFourMove,
  ConnectFourPoint,
  ConnectFourSide,
} from './types'

export const CONNECT_FOUR_ROWS = 6
export const CONNECT_FOUR_COLUMNS = 7
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const
const DIRECTIONS = [
  { row: 1, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 1 },
  { row: 1, col: -1 },
] as const

const DISC_DISPLAYS: Record<ConnectFourSide, string> = {
  red: '●',
  yellow: '●',
}

function createEmptyBoard(): ConnectFourBoard {
  return Array.from({ length: CONNECT_FOUR_ROWS }, () =>
    Array.from({ length: CONNECT_FOUR_COLUMNS }, () => null),
  )
}

function cloneBoard(board: ConnectFourBoard): ConnectFourBoard {
  return board.map((row) => row.map((disc) => (disc ? { ...disc } : null)))
}

function isInsideBoard(row: number, col: number): boolean {
  return row >= 0 && row < CONNECT_FOUR_ROWS && col >= 0 && col < CONNECT_FOUR_COLUMNS
}

function createDisc(side: ConnectFourSide): ConnectFourDisc {
  return {
    side,
    display: DISC_DISPLAYS[side],
  }
}

function getOpposingSide(side: ConnectFourSide): ConnectFourSide {
  return side === 'red' ? 'yellow' : 'red'
}

export function pointToCoordinates(point: ConnectFourPoint): ConnectFourCoordinates {
  const match = /^([a-g])([1-6])$/.exec(point)
  if (!match) {
    throw new Error(`Invalid Connect Four point: ${point}`)
  }

  return {
    row: CONNECT_FOUR_ROWS - Number(match[2]),
    col: FILES.indexOf(match[1] as (typeof FILES)[number]),
  }
}

export function coordinatesToPoint(row: number, col: number): ConnectFourPoint {
  if (!isInsideBoard(row, col)) {
    throw new Error(`Invalid Connect Four coordinates: ${row},${col}`)
  }

  return `${FILES[col]}${CONNECT_FOUR_ROWS - row}` as ConnectFourPoint
}

function getLandingRow(board: ConnectFourBoard, column: ConnectFourColumn): number | null {
  const col = column - 1

  for (let row = CONNECT_FOUR_ROWS - 1; row >= 0; row -= 1) {
    if (!board[row][col]) {
      return row
    }
  }

  return null
}

function collectDirection(
  board: ConnectFourBoard,
  origin: ConnectFourCoordinates,
  side: ConnectFourSide,
  rowDelta: number,
  colDelta: number,
): ConnectFourCoordinates[] {
  const points: ConnectFourCoordinates[] = []
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
  board: ConnectFourBoard,
  origin: ConnectFourCoordinates,
  side: ConnectFourSide,
): ConnectFourPoint[] | null {
  for (const direction of DIRECTIONS) {
    const backward = collectDirection(board, origin, side, -direction.row, -direction.col).reverse()
    const forward = collectDirection(board, origin, side, direction.row, direction.col)
    const line = [...backward, origin, ...forward]

    if (line.length >= 4) {
      return line.map((coordinates) => coordinatesToPoint(coordinates.row, coordinates.col))
    }
  }

  return null
}

function isBoardFull(board: ConnectFourBoard): boolean {
  return board.every((row) => row.every((disc) => disc !== null))
}

function createMove(column: ConnectFourColumn, row: number, side: ConnectFourSide): ConnectFourMove {
  const point = coordinatesToPoint(row, column - 1)
  return {
    column,
    row: CONNECT_FOUR_ROWS - row,
    point,
    side,
    disc: createDisc(side),
    notation: `${column}`,
  }
}

function buildGameState(
  board: ConnectFourBoard,
  turn: ConnectFourSide,
  lastMove: ConnectFourMove | null,
  moveCount: number,
  winningLine: ConnectFourPoint[] | null,
): ConnectFourGameState {
  const winner = winningLine ? lastMove?.side ?? null : null
  const isDraw = !winner && isBoardFull(board)

  return {
    kind: 'connect-four',
    board,
    turn,
    status: winner || isDraw ? 'finished' : 'active',
    winner,
    lastMove,
    moveCount,
    winningLine,
  }
}

export function createInitialConnectFourGame(): ConnectFourGameState {
  return buildGameState(createEmptyBoard(), 'red', null, 0, null)
}

export function listLegalMoves(
  state: ConnectFourGameState,
  column?: ConnectFourColumn,
): ConnectFourLegalMove[] {
  if (state.status === 'finished') {
    return []
  }

  if (typeof column === 'number') {
    const row = getLandingRow(state.board, column)
    return row === null ? [] : [{ column, point: coordinatesToPoint(row, column - 1) }]
  }

  const legalMoves: ConnectFourLegalMove[] = []

  for (let columnIndex = 1; columnIndex <= CONNECT_FOUR_COLUMNS; columnIndex += 1) {
    const landingRow = getLandingRow(state.board, columnIndex as ConnectFourColumn)
    if (landingRow !== null) {
      legalMoves.push({
        column: columnIndex as ConnectFourColumn,
        point: coordinatesToPoint(landingRow, columnIndex - 1),
      })
    }
  }

  return legalMoves
}

export function playConnectFourMove(
  state: ConnectFourGameState,
  column: ConnectFourColumn,
): ConnectFourGameState {
  if (state.status === 'finished') {
    throw new Error('Cannot play a move after the Connect Four game has finished')
  }

  const landingRow = getLandingRow(state.board, column)
  if (landingRow === null) {
    throw new Error(`Column ${column} is already full`)
  }

  const board = cloneBoard(state.board)
  board[landingRow][column - 1] = createDisc(state.turn)

  const lastMove = createMove(column, landingRow, state.turn)
  const winningLine = findWinningLine(board, { row: landingRow, col: column - 1 }, state.turn)

  return buildGameState(board, getOpposingSide(state.turn), lastMove, state.moveCount + 1, winningLine)
}
