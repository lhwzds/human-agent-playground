import { describe, expect, it } from 'vitest'

import {
  coordinatesToPoint,
  createInitialGomokuGame,
  listLegalMoves,
  playGomokuMove,
  pointToCoordinates,
} from '../gomoku.js'

describe('gomoku rules', () => {
  it('creates an empty 15x15 opening position with black to move', () => {
    const state = createInitialGomokuGame()

    expect(state.turn).toBe('black')
    expect(state.status).toBe('active')
    expect(state.board).toHaveLength(15)
    expect(state.board[0]).toHaveLength(15)
    expect(state.moveCount).toBe(0)
    expect(listLegalMoves(state)).toHaveLength(225)
  })

  it('converts points and coordinates consistently', () => {
    expect(pointToCoordinates('a1')).toEqual({ row: 14, col: 0 })
    expect(pointToCoordinates('h8')).toEqual({ row: 7, col: 7 })
    expect(coordinatesToPoint(0, 0)).toBe('a15')
    expect(coordinatesToPoint(14, 14)).toBe('o1')
  })

  it('plays stones on empty intersections and removes them from the legal move list', () => {
    const first = playGomokuMove(createInitialGomokuGame(), 'h8')

    expect(first.turn).toBe('white')
    expect(first.lastMove).toEqual(
      expect.objectContaining({
        point: 'h8',
        side: 'black',
      }),
    )
    expect(listLegalMoves(first, 'h8')).toEqual([])
    expect(() => playGomokuMove(first, 'h8')).toThrow(/already occupied/)
  })

  it('detects a five-in-a-row win', () => {
    let state = createInitialGomokuGame()

    for (const point of ['h8', 'a1', 'i8', 'b1', 'j8', 'c1', 'k8', 'd1', 'l8'] as const) {
      state = playGomokuMove(state, point)
    }

    expect(state.status).toBe('finished')
    expect(state.winner).toBe('black')
    expect(state.lastMove).toEqual(
      expect.objectContaining({
        point: 'l8',
        side: 'black',
      }),
    )
    expect(state.winningLine).toEqual(['h8', 'i8', 'j8', 'k8', 'l8'])
    expect(listLegalMoves(state)).toEqual([])
  })
})
