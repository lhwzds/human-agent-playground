import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createInitialXiangqiGame } from '@human-agent-playground/game-xiangqi'

import { XiangqiBoard } from '../XiangqiBoard'

describe('XiangqiBoard', () => {
  it('renders pieces and exposes square handlers', async () => {
    const game = createInitialXiangqiGame()
    const onSquareClick = vi.fn()

    const { container } = render(
      <XiangqiBoard
        board={game.board}
        selectedSquare="a1"
        legalTargets={new Set(['a4'])}
        lastMoveFrom="a4"
        lastMoveTo="a5"
        onSquareClick={onSquareClick}
      />,
    )

    const square = container.querySelector('[data-square="a1"]')
    expect(square).not.toBeNull()
    expect(square).toHaveAttribute('data-square', 'a1')
    fireEvent.click(square!)
    expect(onSquareClick).toHaveBeenCalledWith('a1')
    expect(screen.getByText('帅')).toBeInTheDocument()
    expect(screen.getByText('楚河')).toBeInTheDocument()
    expect(screen.getByText('汉界')).toBeInTheDocument()
    expect(container.querySelectorAll('.board-cell-river-line')).toHaveLength(9)
    expect(container.querySelector('[data-square="a5"] .board-cell-river-line')).not.toBeNull()
    expect(container.querySelector('[data-square="a4"]')).toHaveClass('board-cell-last-from')
    expect(container.querySelector('[data-square="a5"]')).toHaveClass('board-cell-last-to')
    expect(container.querySelector('[data-square="a6"]')).toHaveClass('board-cell-river-bottom')
    expect(container.querySelector('[data-square="a5"]')).toHaveClass('board-cell-river-top')
  })
})
