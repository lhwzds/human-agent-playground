import { describe, expect, it } from 'vitest'

import {
  coordinatesToSquare,
  createInitialXiangqiGame,
  createXiangqiGameFromFen,
  listLegalMoves,
  playXiangqiMove,
  squareToCoordinates,
} from '../index'

describe('xiangqi core', () => {
  it('parses squares consistently', () => {
    expect(squareToCoordinates('a10')).toEqual({ row: 0, col: 0 })
    expect(squareToCoordinates('e1')).toEqual({ row: 9, col: 4 })
    expect(coordinatesToSquare(0, 0)).toBe('a10')
    expect(coordinatesToSquare(9, 4)).toBe('e1')
  })

  it('creates the initial game state', () => {
    const game = createInitialXiangqiGame()

    expect(game.turn).toBe('red')
    expect(game.board[0][0]?.type).toBe('rook')
    expect(game.board[9][4]?.type).toBe('general')
    expect(game.status).toBe('active')
  })

  it('blocks horse moves when the leg is occupied', () => {
    const game = createXiangqiGameFromFen('4k4/9/9/9/4N4/4P4/9/9/9/4K4 w - - 0 1')

    const moves = listLegalMoves(game, 'e6').map((move) => move.to).sort()
    expect(moves).not.toContain('d4')
    expect(moves).not.toContain('f4')
    expect(moves).toContain('c5')
    expect(moves).toContain('g5')
  })

  it('allows cannon captures only with exactly one screen', () => {
    const game = createXiangqiGameFromFen('4k4/4r4/9/4p4/9/4C4/9/9/9/4K4 w - - 0 1')

    const moves = listLegalMoves(game, 'e5').map((move) => move.to)
    expect(moves).toContain('e9')
    expect(moves).not.toContain('e10')
  })

  it('rejects moves that expose the generals directly', () => {
    const game = createXiangqiGameFromFen('4k4/9/9/9/9/9/4R4/9/9/4K4 w - - 0 1')

    expect(() => playXiangqiMove(game, 'e4', 'd4')).toThrow(/Illegal Xiangqi move/)
  })
})
