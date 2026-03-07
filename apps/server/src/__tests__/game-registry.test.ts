import { xiangqiGameStateSchema } from '@human-agent-playground/game-xiangqi'
import { describe, expect, it } from 'vitest'

import { getGameAdapter, listGameCatalog } from '../game-registry.js'

describe('game registry', () => {
  it('lists registered games and rejects unsupported adapters', () => {
    expect(listGameCatalog().map((game) => game.id)).toContain('xiangqi')
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
})
