import { describe, expect, it } from 'vitest'

import {
  coordinatesToPoint,
  createInitialOthelloGame,
  listLegalMoves,
  playOthelloMove,
  pointToCoordinates,
} from '../othello.js'

describe('othello rules', () => {
  it('creates the standard 8x8 opening position with black to move', () => {
    const state = createInitialOthelloGame()

    expect(state.turn).toBe('black')
    expect(state.status).toBe('active')
    expect(state.blackCount).toBe(2)
    expect(state.whiteCount).toBe(2)
    expect(listLegalMoves(state).map((move) => move.point).sort()).toEqual([
      'c4',
      'd3',
      'e6',
      'f5',
    ])
  })

  it('converts points and coordinates consistently', () => {
    expect(pointToCoordinates('a1')).toEqual({ row: 7, col: 0 })
    expect(pointToCoordinates('d3')).toEqual({ row: 5, col: 3 })
    expect(coordinatesToPoint(0, 0)).toBe('a8')
    expect(coordinatesToPoint(7, 7)).toBe('h1')
  })

  it('plays a legal move and flips bracketed discs', () => {
    const state = playOthelloMove(createInitialOthelloGame(), 'd3')

    expect(state.turn).toBe('white')
    expect(state.blackCount).toBe(4)
    expect(state.whiteCount).toBe(1)
    expect(state.lastMove).toEqual(
      expect.objectContaining({
        point: 'd3',
        side: 'black',
        flippedPoints: ['d4'],
      }),
    )
  })

  it('keeps the same side to move if the opponent has no legal reply', () => {
    let state = createInitialOthelloGame()

    for (const point of ['e6', 'f6', 'g6', 'g7', 'c4', 'h6', 'h8', 'f8'] as const) {
      state = playOthelloMove(state, point)
    }

    expect(state.turn).toBe('white')
    expect(state.lastMove).toEqual(
      expect.objectContaining({
        point: 'f8',
        side: 'white',
      }),
    )
    expect(listLegalMoves(state)).not.toHaveLength(0)
  })
})
