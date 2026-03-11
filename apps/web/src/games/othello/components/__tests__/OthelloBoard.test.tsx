import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createInitialOthelloGame } from '@human-agent-playground/game-othello'

import { OthelloBoard } from '../OthelloBoard'

describe('OthelloBoard', () => {
  it('renders legal markers, discs, and point handlers', () => {
    const game = createInitialOthelloGame()
    const onPointClick = vi.fn()

    const { container } = render(
      <OthelloBoard
        board={game.board}
        legalMoves={new Set(['d3', 'c4', 'f5', 'e6'])}
        lastMovePoint="d3"
        onPointClick={onPointClick}
      />,
    )

    const point = container.querySelector('[data-point="d3"]')
    expect(point).not.toBeNull()
    fireEvent.click(point!)
    expect(onPointClick).toHaveBeenCalledWith('d3')
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('h')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(container.querySelector('[data-point="d3"]')).toHaveClass('othello-cell-last')
    expect(container.querySelectorAll('.othello-disc')).toHaveLength(4)
    expect(container.querySelectorAll('.othello-legal-marker')).toHaveLength(4)
  })
})
