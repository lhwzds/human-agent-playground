import { chessGameStateSchema } from '@human-agent-playground/game-chess'
import { connectFourGameStateSchema } from '@human-agent-playground/game-connect-four'
import { gomokuGameStateSchema } from '@human-agent-playground/game-gomoku'
import { othelloGameStateSchema } from '@human-agent-playground/game-othello'
import { xiangqiGameStateSchema } from '@human-agent-playground/game-xiangqi'
import { describe, expect, it } from 'vitest'

import { getGameAdapter, listGameCatalog } from '../game-registry.js'

describe('game registry', () => {
  it('lists registered games and rejects unsupported adapters', () => {
    expect(listGameCatalog().map((game) => game.id)).toContain('xiangqi')
    expect(listGameCatalog().map((game) => game.id)).toContain('chess')
    expect(listGameCatalog().map((game) => game.id)).toContain('gomoku')
    expect(listGameCatalog().map((game) => game.id)).toContain('connect-four')
    expect(listGameCatalog().map((game) => game.id)).toContain('othello')
    expect(() => getGameAdapter('go')).toThrow(/Unsupported game/)
  })

  it('routes legal moves and move execution through the Xiangqi adapter', () => {
    const adapter = getGameAdapter('xiangqi')
    const state = adapter.createInitialState()

    const moves = adapter.listLegalMoves(state, { from: 'a4' }) as Array<{ to: string }>
    expect(moves.some((move) => move.to === 'a5')).toBe(true)

    const nextState = xiangqiGameStateSchema.parse(adapter.playMove(state, { from: 'a4', to: 'a5' }))
    expect(nextState.turn).toBe('black')
    expect(nextState.lastMove?.from).toBe('a4')
    expect(nextState.lastMove?.to).toBe('a5')
  })

  it('routes legal moves and move execution through the Chess adapter', () => {
    const adapter = getGameAdapter('chess')
    const state = adapter.createInitialState()

    const moves = adapter.listLegalMoves(state, { from: 'e2' }) as Array<{ to: string }>
    expect(moves.some((move) => move.to === 'e4')).toBe(true)

    const nextState = chessGameStateSchema.parse(adapter.playMove(state, { from: 'e2', to: 'e4' }))
    expect(nextState.turn).toBe('black')
    expect(nextState.lastMove?.from).toBe('e2')
    expect(nextState.lastMove?.to).toBe('e4')
    expect(nextState.lastMove?.san).toBe('e4')
  })

  it('routes legal moves and stone placement through the Gomoku adapter', () => {
    const adapter = getGameAdapter('gomoku')
    const state = adapter.createInitialState()

    const moves = adapter.listLegalMoves(state, { point: 'h8' }) as Array<{ point: string }>
    expect(moves).toEqual([{ point: 'h8' }])

    const nextState = gomokuGameStateSchema.parse(adapter.playMove(state, { point: 'h8' }))
    expect(nextState.turn).toBe('white')
    expect(nextState.lastMove?.point).toBe('h8')
    expect(nextState.lastMove?.side).toBe('black')
  })

  it('routes legal moves and disc drops through the Connect Four adapter', () => {
    const adapter = getGameAdapter('connect-four')
    const state = adapter.createInitialState()

    const moves = adapter.listLegalMoves(state, { column: 4 }) as Array<{ column: number; point: string }>
    expect(moves).toEqual([{ column: 4, point: 'd1' }])

    const nextState = connectFourGameStateSchema.parse(adapter.playMove(state, { column: 4 }))
    expect(nextState.turn).toBe('yellow')
    expect(nextState.lastMove?.point).toBe('d1')
    expect(nextState.lastMove?.column).toBe(4)
  })

  it('routes legal moves and flips through the Othello adapter', () => {
    const adapter = getGameAdapter('othello')
    const state = adapter.createInitialState()

    const moves = adapter.listLegalMoves(state, { point: 'd3' }) as Array<{ point: string; flips: string[] }>
    expect(moves).toEqual([{ point: 'd3', flips: ['d4'] }])

    const nextState = othelloGameStateSchema.parse(adapter.playMove(state, { point: 'd3' }))
    expect(nextState.turn).toBe('white')
    expect(nextState.lastMove?.point).toBe('d3')
    expect(nextState.lastMove?.flippedPoints).toEqual(['d4'])
  })
})
