import type {
  BoardCoordinates,
  Side,
  Square,
  XiangqiBoard,
  XiangqiGameState,
  XiangqiMove,
  XiangqiPiece,
  XiangqiPieceType,
} from './types'

export const XIANGQI_STARTING_FEN =
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const
const BOARD_ROWS = 10
const BOARD_COLS = 9

const PIECE_DISPLAYS: Record<string, string> = {
  K: '帅',
  A: '仕',
  B: '相',
  N: '马',
  R: '车',
  C: '炮',
  P: '兵',
  k: '将',
  a: '士',
  b: '象',
  n: '马',
  r: '车',
  c: '炮',
  p: '卒',
}

const PIECE_TYPES: Record<string, XiangqiPieceType> = {
  k: 'general',
  a: 'advisor',
  b: 'elephant',
  n: 'horse',
  r: 'rook',
  c: 'cannon',
  p: 'soldier',
}

const HORSE_DELTAS = [
  { row: -2, col: -1, blockRow: -1, blockCol: 0 },
  { row: -2, col: 1, blockRow: -1, blockCol: 0 },
  { row: 2, col: -1, blockRow: 1, blockCol: 0 },
  { row: 2, col: 1, blockRow: 1, blockCol: 0 },
  { row: -1, col: -2, blockRow: 0, blockCol: -1 },
  { row: 1, col: -2, blockRow: 0, blockCol: -1 },
  { row: -1, col: 2, blockRow: 0, blockCol: 1 },
  { row: 1, col: 2, blockRow: 0, blockCol: 1 },
] as const

const ELEPHANT_DELTAS = [
  { row: -2, col: -2, blockRow: -1, blockCol: -1 },
  { row: -2, col: 2, blockRow: -1, blockCol: 1 },
  { row: 2, col: -2, blockRow: 1, blockCol: -1 },
  { row: 2, col: 2, blockRow: 1, blockCol: 1 },
] as const

const ORTHOGONAL_DELTAS = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
] as const

function createEmptyBoard(): XiangqiBoard {
  return Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => null),
  )
}

function cloneBoard(board: XiangqiBoard): XiangqiBoard {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)))
}

function isInsideBoard(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS
}

function palaceRowsFor(side: Side): [number, number] {
  return side === 'black' ? [0, 2] : [7, 9]
}

function isInsidePalace(side: Side, row: number, col: number): boolean {
  const [minRow, maxRow] = palaceRowsFor(side)
  return row >= minRow && row <= maxRow && col >= 3 && col <= 5
}

function hasCrossedRiver(side: Side, row: number): boolean {
  return side === 'red' ? row <= 4 : row >= 5
}

function makePiece(fenChar: string): XiangqiPiece {
  const lower = fenChar.toLowerCase()
  if (!(lower in PIECE_TYPES)) {
    throw new Error(`Unsupported Xiangqi piece: ${fenChar}`)
  }

  return {
    side: fenChar === lower ? 'black' : 'red',
    type: PIECE_TYPES[lower],
    fenChar,
    display: PIECE_DISPLAYS[fenChar],
  }
}

export function squareToCoordinates(square: Square): BoardCoordinates {
  const match = /^([a-i])(10|[1-9])$/.exec(square)
  if (!match) {
    throw new Error(`Invalid square: ${square}`)
  }

  const file = match[1]
  const rank = Number(match[2])
  return {
    row: 10 - rank,
    col: FILES.indexOf(file as (typeof FILES)[number]),
  }
}

export function coordinatesToSquare(row: number, col: number): Square {
  if (!isInsideBoard(row, col)) {
    throw new Error(`Invalid coordinates: ${row},${col}`)
  }

  return `${FILES[col]}${10 - row}` as Square
}

function getPiece(board: XiangqiBoard, row: number, col: number): XiangqiPiece | null {
  return isInsideBoard(row, col) ? board[row][col] : null
}

export function parseXiangqiFen(fen: string): XiangqiGameState {
  const [placement, turnToken = 'w'] = fen.trim().split(/\s+/)
  const rows = placement.split('/')

  if (rows.length !== BOARD_ROWS) {
    throw new Error(`Invalid Xiangqi FEN rows: ${fen}`)
  }

  const board = createEmptyBoard()

  rows.forEach((rowToken, rowIndex) => {
    let col = 0
    for (const char of rowToken) {
      if (/\d/.test(char)) {
        col += Number(char)
        continue
      }

      if (!isInsideBoard(rowIndex, col)) {
        throw new Error(`Invalid Xiangqi FEN placement: ${fen}`)
      }

      board[rowIndex][col] = makePiece(char)
      col += 1
    }

    if (col !== BOARD_COLS) {
      throw new Error(`Invalid Xiangqi FEN width: ${fen}`)
    }
  })

  const turn: Side = turnToken.toLowerCase() === 'b' ? 'black' : 'red'

  return buildGameState(board, turn, null, 0)
}

export function createInitialXiangqiGame(): XiangqiGameState {
  return parseXiangqiFen(XIANGQI_STARTING_FEN)
}

function boardToFen(board: XiangqiBoard, turn: Side, moveCount: number): string {
  const placement = board
    .map((row) => {
      let buffer = ''
      let emptyCount = 0

      for (const piece of row) {
        if (!piece) {
          emptyCount += 1
          continue
        }

        if (emptyCount > 0) {
          buffer += String(emptyCount)
          emptyCount = 0
        }

        buffer += piece.fenChar
      }

      if (emptyCount > 0) {
        buffer += String(emptyCount)
      }

      return buffer
    })
    .join('/')

  const fullMove = Math.floor(moveCount / 2) + 1
  return `${placement} ${turn === 'red' ? 'w' : 'b'} - - 0 ${fullMove}`
}

function findGeneral(board: XiangqiBoard, side: Side): BoardCoordinates | null {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = board[row][col]
      if (piece?.side === side && piece.type === 'general') {
        return { row, col }
      }
    }
  }

  return null
}

function isEnemy(piece: XiangqiPiece | null, side: Side): boolean {
  return Boolean(piece && piece.side !== side)
}

function isFriendly(piece: XiangqiPiece | null, side: Side): boolean {
  return Boolean(piece && piece.side === side)
}

function scanLineMoves(
  board: XiangqiBoard,
  origin: BoardCoordinates,
  side: Side,
  requireScreen: boolean,
): BoardCoordinates[] {
  const moves: BoardCoordinates[] = []

  for (const delta of ORTHOGONAL_DELTAS) {
    let row = origin.row + delta.row
    let col = origin.col + delta.col
    let seenScreen = false

    while (isInsideBoard(row, col)) {
      const target = getPiece(board, row, col)

      if (!requireScreen) {
        if (!target) {
          moves.push({ row, col })
        } else {
          if (target.side !== side) {
            moves.push({ row, col })
          }
          break
        }
      } else if (!seenScreen) {
        if (!target) {
          moves.push({ row, col })
        } else {
          seenScreen = true
        }
      } else if (target) {
        if (target.side !== side) {
          moves.push({ row, col })
        }
        break
      }

      row += delta.row
      col += delta.col
    }
  }

  return moves
}

function generatePseudoMovesForPiece(
  board: XiangqiBoard,
  origin: BoardCoordinates,
): BoardCoordinates[] {
  const piece = getPiece(board, origin.row, origin.col)
  if (!piece) {
    return []
  }

  switch (piece.type) {
    case 'general': {
      const moves: BoardCoordinates[] = []
      for (const delta of ORTHOGONAL_DELTAS) {
        const row = origin.row + delta.row
        const col = origin.col + delta.col
        if (!isInsidePalace(piece.side, row, col)) {
          continue
        }
        if (!isFriendly(getPiece(board, row, col), piece.side)) {
          moves.push({ row, col })
        }
      }
      return moves
    }

    case 'advisor': {
      const moves: BoardCoordinates[] = []
      for (const rowDelta of [-1, 1]) {
        for (const colDelta of [-1, 1]) {
          const row = origin.row + rowDelta
          const col = origin.col + colDelta
          if (!isInsidePalace(piece.side, row, col)) {
            continue
          }
          if (!isFriendly(getPiece(board, row, col), piece.side)) {
            moves.push({ row, col })
          }
        }
      }
      return moves
    }

    case 'elephant': {
      const moves: BoardCoordinates[] = []
      for (const delta of ELEPHANT_DELTAS) {
        const row = origin.row + delta.row
        const col = origin.col + delta.col
        const blockRow = origin.row + delta.blockRow
        const blockCol = origin.col + delta.blockCol
        if (!isInsideBoard(row, col) || getPiece(board, blockRow, blockCol)) {
          continue
        }
        if (piece.side === 'red' && row < 5) {
          continue
        }
        if (piece.side === 'black' && row > 4) {
          continue
        }
        if (!isFriendly(getPiece(board, row, col), piece.side)) {
          moves.push({ row, col })
        }
      }
      return moves
    }

    case 'horse': {
      const moves: BoardCoordinates[] = []
      for (const delta of HORSE_DELTAS) {
        const blockRow = origin.row + delta.blockRow
        const blockCol = origin.col + delta.blockCol
        const row = origin.row + delta.row
        const col = origin.col + delta.col

        if (!isInsideBoard(row, col) || getPiece(board, blockRow, blockCol)) {
          continue
        }
        if (!isFriendly(getPiece(board, row, col), piece.side)) {
          moves.push({ row, col })
        }
      }
      return moves
    }

    case 'rook':
      return scanLineMoves(board, origin, piece.side, false)

    case 'cannon':
      return generateCannonMoves(board, origin, piece.side)

    case 'soldier': {
      const moves: BoardCoordinates[] = []
      const forwardRow = piece.side === 'red' ? origin.row - 1 : origin.row + 1
      if (
        isInsideBoard(forwardRow, origin.col) &&
        !isFriendly(getPiece(board, forwardRow, origin.col), piece.side)
      ) {
        moves.push({ row: forwardRow, col: origin.col })
      }

      if (hasCrossedRiver(piece.side, origin.row)) {
        for (const colDelta of [-1, 1]) {
          const col = origin.col + colDelta
          if (!isInsideBoard(origin.row, col)) {
            continue
          }
          if (!isFriendly(getPiece(board, origin.row, col), piece.side)) {
            moves.push({ row: origin.row, col })
          }
        }
      }

      return moves
    }

    default:
      return []
  }
}

function generateCannonMoves(
  board: XiangqiBoard,
  origin: BoardCoordinates,
  side: Side,
): BoardCoordinates[] {
  const moves: BoardCoordinates[] = []

  for (const delta of ORTHOGONAL_DELTAS) {
    let row = origin.row + delta.row
    let col = origin.col + delta.col
    let screenSeen = false

    while (isInsideBoard(row, col)) {
      const target = getPiece(board, row, col)
      if (!screenSeen) {
        if (!target) {
          moves.push({ row, col })
        } else {
          screenSeen = true
        }
      } else if (target) {
        if (target.side !== side) {
          moves.push({ row, col })
        }
        break
      }

      row += delta.row
      col += delta.col
    }
  }

  return moves
}

function generalsFace(board: XiangqiBoard): boolean {
  const redGeneral = findGeneral(board, 'red')
  const blackGeneral = findGeneral(board, 'black')
  if (!redGeneral || !blackGeneral || redGeneral.col !== blackGeneral.col) {
    return false
  }

  const minRow = Math.min(redGeneral.row, blackGeneral.row)
  const maxRow = Math.max(redGeneral.row, blackGeneral.row)
  for (let row = minRow + 1; row < maxRow; row += 1) {
    if (board[row][redGeneral.col]) {
      return false
    }
  }

  return true
}

function pieceAttacksSquare(
  board: XiangqiBoard,
  origin: BoardCoordinates,
  target: BoardCoordinates,
): boolean {
  const piece = getPiece(board, origin.row, origin.col)
  if (!piece) {
    return false
  }

  if (piece.type === 'general') {
    if (origin.col === target.col) {
      const enemyGeneral = getPiece(board, target.row, target.col)
      if (enemyGeneral?.type === 'general' && enemyGeneral.side !== piece.side) {
        const minRow = Math.min(origin.row, target.row)
        const maxRow = Math.max(origin.row, target.row)
        for (let row = minRow + 1; row < maxRow; row += 1) {
          if (board[row][origin.col]) {
            return false
          }
        }
        return true
      }
    }
  }

  return generatePseudoMovesForPiece(board, origin).some(
    (move) => move.row === target.row && move.col === target.col,
  )
}

export function isInCheck(board: XiangqiBoard, side: Side): boolean {
  const general = findGeneral(board, side)
  if (!general) {
    return true
  }

  if (generalsFace(board)) {
    return true
  }

  const opponent: Side = side === 'red' ? 'black' : 'red'
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = board[row][col]
      if (!piece || piece.side !== opponent) {
        continue
      }
      if (pieceAttacksSquare(board, { row, col }, general)) {
        return true
      }
    }
  }

  return false
}

function nextSide(side: Side): Side {
  return side === 'red' ? 'black' : 'red'
}

function applyMoveToBoard(
  board: XiangqiBoard,
  from: BoardCoordinates,
  to: BoardCoordinates,
): { board: XiangqiBoard; captured: XiangqiPiece | null; piece: XiangqiPiece } {
  const nextBoard = cloneBoard(board)
  const piece = nextBoard[from.row][from.col]
  if (!piece) {
    throw new Error('No piece on source square')
  }

  const captured = nextBoard[to.row][to.col]
  nextBoard[to.row][to.col] = piece
  nextBoard[from.row][from.col] = null

  return {
    board: nextBoard,
    captured,
    piece,
  }
}

function buildGameState(
  board: XiangqiBoard,
  turn: Side,
  lastMove: XiangqiMove | null,
  moveCount: number,
): XiangqiGameState {
  const generalSideMissing = !findGeneral(board, 'red') || !findGeneral(board, 'black')
  const opponent = turn
  const noMoves = listLegalMovesForSide(board, opponent).length === 0
  const winner =
    !findGeneral(board, 'red')
      ? 'black'
      : !findGeneral(board, 'black')
        ? 'red'
        : noMoves
          ? nextSide(turn)
          : null

  return {
    kind: 'xiangqi',
    fen: boardToFen(board, turn, moveCount),
    board,
    turn,
    status: generalSideMissing || noMoves ? 'finished' : 'active',
    winner,
    lastMove,
    moveCount,
    isCheck: isInCheck(board, turn),
  }
}

function listLegalMovesForSide(board: XiangqiBoard, side: Side): XiangqiMove[] {
  const legalMoves: XiangqiMove[] = []
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = board[row][col]
      if (!piece || piece.side !== side) {
        continue
      }

      const from = coordinatesToSquare(row, col)
      const moves = generatePseudoMovesForPiece(board, { row, col })
      for (const destination of moves) {
        const simulated = applyMoveToBoard(board, { row, col }, destination)
        if (isInCheck(simulated.board, side)) {
          continue
        }

        legalMoves.push({
          from,
          to: coordinatesToSquare(destination.row, destination.col),
          side,
          piece,
          captured: simulated.captured,
          notation: `${from}${coordinatesToSquare(destination.row, destination.col)}`,
        })
      }
    }
  }
  return legalMoves
}

export function listLegalMoves(
  game: XiangqiGameState,
  square?: Square,
): XiangqiMove[] {
  const moves = listLegalMovesForSide(game.board, game.turn)
  return square ? moves.filter((move) => move.from === square) : moves
}

export function playXiangqiMove(
  game: XiangqiGameState,
  from: Square,
  to: Square,
): XiangqiGameState {
  if (game.status !== 'active') {
    throw new Error('Game is already finished')
  }

  const legalMove = listLegalMoves(game, from).find((move) => move.to === to)
  if (!legalMove) {
    throw new Error(`Illegal Xiangqi move: ${from} -> ${to}`)
  }

  const fromCoords = squareToCoordinates(from)
  const toCoords = squareToCoordinates(to)
  const simulated = applyMoveToBoard(game.board, fromCoords, toCoords)

  return buildGameState(
    simulated.board,
    nextSide(game.turn),
    legalMove,
    game.moveCount + 1,
  )
}

export function createXiangqiGameFromFen(
  fen: string,
  moveCount = 0,
): XiangqiGameState {
  const parsed = parseXiangqiFen(fen)
  return buildGameState(parsed.board, parsed.turn, null, moveCount)
}
