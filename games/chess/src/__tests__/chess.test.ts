import { describe, expect, it } from 'vitest'

import {
  coordinatesToSquare,
  createInitialChessGame,
  listLegalMoves,
  playChessMove,
  squareToCoordinates,
} from '../chess'

describe('chess rules', () => {
  it('creates the opening position', () => {
    const game = createInitialChessGame()

    expect(game.kind).toBe('chess')
    expect(game.turn).toBe('white')
    expect(game.status).toBe('active')
    expect(game.winner).toBeNull()
    expect(game.board[0][0]?.display).toBe('♜')
    expect(game.board[7][4]?.display).toBe('♔')
  })

  it('converts between squares and coordinates', () => {
    expect(squareToCoordinates('a8')).toEqual({ row: 0, col: 0 })
    expect(squareToCoordinates('e2')).toEqual({ row: 6, col: 4 })
    expect(coordinatesToSquare(0, 0)).toBe('a8')
    expect(coordinatesToSquare(6, 4)).toBe('e2')
  })

  it('lists legal opening moves for a pawn', () => {
    const game = createInitialChessGame()
    const moves = listLegalMoves(game, 'e2')

    expect(moves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'e2', to: 'e3', san: 'e3' }),
        expect.objectContaining({ from: 'e2', to: 'e4', san: 'e4' }),
      ]),
    )
  })

  it('plays a normal move and records last move details', () => {
    const game = createInitialChessGame()
    const next = playChessMove(game, 'e2', 'e4')

    expect(next.turn).toBe('black')
    expect(next.moveCount).toBe(1)
    expect(next.lastMove).toEqual(
      expect.objectContaining({
        from: 'e2',
        to: 'e4',
        side: 'white',
        san: 'e4',
        notation: 'e2e4',
      }),
    )
    expect(next.board[4][4]?.display).toBe('♙')
  })

  it('detects checkmate and the correct winner', () => {
    let game = createInitialChessGame()
    game = playChessMove(game, 'f2', 'f3')
    game = playChessMove(game, 'e7', 'e5')
    game = playChessMove(game, 'g2', 'g4')
    game = playChessMove(game, 'd8', 'h4')

    expect(game.status).toBe('finished')
    expect(game.winner).toBe('black')
    expect(game.isCheck).toBe(true)
    expect(game.lastMove?.san).toBe('Qh4#')
  })

  it('defaults promotion to queen when multiple promotion targets exist', () => {
    const game = {
      ...createInitialChessGame(),
      fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
      board: createInitialChessGame().board,
      turn: 'white' as const,
      status: 'active' as const,
      winner: null,
      isCheck: false,
      lastMove: null,
      moveCount: 0,
    }

    const promoted = playChessMove(game, 'a7', 'a8')

    expect(promoted.lastMove?.promotion?.type).toBe('queen')
    expect(promoted.lastMove?.san).toBe('a8=Q+')
  })
})
