import { describe, expect, it } from 'vitest'

import { calculateBoardViewportSize } from '../boardViewport'

describe('calculateBoardViewportSize', () => {
  it('uses the available width when width is the tighter constraint', () => {
    expect(calculateBoardViewportSize(520, 900, 1)).toBe(520)
  })

  it('uses the available height when height is the tighter constraint', () => {
    expect(calculateBoardViewportSize(900, 520, 1)).toBe(520)
  })

  it('supports non-square board shells', () => {
    expect(calculateBoardViewportSize(800, 600, 0.82)).toBeCloseTo(492, 5)
  })

  it('keeps the Xiangqi shell wide enough for the taller board geometry', () => {
    expect(calculateBoardViewportSize(900, 700, 0.915)).toBeCloseTo(640.5, 5)
  })
})
