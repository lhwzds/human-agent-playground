import { describe, expect, it } from 'vitest'

import { getGameModule } from '../game-registry'

describe('game registry', () => {
  it('returns the Xiangqi module and rejects unknown games', () => {
    expect(getGameModule('xiangqi').gameId).toBe('xiangqi')
    expect(() => getGameModule('go')).toThrow(/No game module registered/)
  })
})
