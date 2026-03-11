import { describe, expect, it } from 'vitest'

import {
  coordinatesToPoint,
  createInitialConnectFourGame,
  listLegalMoves,
  playConnectFourMove,
  pointToCoordinates,
} from '../connect-four.js'

describe('connect four rules', () => {
  it('creates an empty 7x6 opening position with red to move', () => {
    const state = createInitialConnectFourGame()

    expect(state.turn).toBe('red')
    expect(state.status).toBe('active')
    expect(state.board).toHaveLength(6)
    expect(state.board[0]).toHaveLength(7)
    expect(state.moveCount).toBe(0)
    expect(listLegalMoves(state)).toHaveLength(7)
  })

  it('converts points and coordinates consistently', () => {
    expect(pointToCoordinates('a1')).toEqual({ row: 5, col: 0 })
    expect(pointToCoordinates('d4')).toEqual({ row: 2, col: 3 })
    expect(coordinatesToPoint(0, 0)).toBe('a6')
    expect(coordinatesToPoint(5, 6)).toBe('g1')
  })

  it('drops discs to the lowest open slot in a column', () => {
    const first = playConnectFourMove(createInitialConnectFourGame(), 4)
    const second = playConnectFourMove(first, 4)

    expect(first.lastMove).toEqual(
      expect.objectContaining({
        column: 4,
        point: 'd1',
        side: 'red',
      }),
    )
    expect(second.lastMove).toEqual(
      expect.objectContaining({
        column: 4,
        point: 'd2',
        side: 'yellow',
      }),
    )
  })

  it('detects a horizontal connect four win', () => {
    let state = createInitialConnectFourGame()

    for (const column of [1, 1, 2, 2, 3, 3, 4] as const) {
      state = playConnectFourMove(state, column)
    }

    expect(state.status).toBe('finished')
    expect(state.winner).toBe('red')
    expect(state.lastMove).toEqual(
      expect.objectContaining({
        point: 'd1',
        side: 'red',
      }),
    )
    expect(state.winningLine).toEqual(['a1', 'b1', 'c1', 'd1'])
    expect(listLegalMoves(state)).toEqual([])
  })
})
