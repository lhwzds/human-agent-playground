import { describe, expect, it } from 'vitest'

import { getGameModule } from '../game-registry'

describe('game registry', () => {
  it('returns the registered game modules and rejects unknown games', () => {
    expect(getGameModule('xiangqi').gameId).toBe('xiangqi')
    expect(getGameModule('gomoku').gameId).toBe('gomoku')
    expect(getGameModule('connect-four').gameId).toBe('connect-four')
    expect(getGameModule('othello').gameId).toBe('othello')
    expect(() => getGameModule('go')).toThrow(/No game module registered/)
  })
})
