import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createInitialGomokuGame } from '@human-agent-playground/game-gomoku'

import { GomokuBoard } from '../GomokuBoard'

describe('GomokuBoard', () => {
  it('renders board points, star points, stones, and point handlers', () => {
    const game = createInitialGomokuGame()
    game.board[7][7] = { side: 'black', display: '●' }
    game.board[6][7] = { side: 'white', display: '○' }
    const onPointClick = vi.fn()

    const { container } = render(
      <GomokuBoard
        board={game.board}
        lastMovePoint="h8"
        winningLine={new Set(['h8', 'h9'])}
        onPointClick={onPointClick}
      />,
    )

    const point = container.querySelector('[data-point="h8"]')
    expect(point).not.toBeNull()
    fireEvent.click(point!)
    expect(onPointClick).toHaveBeenCalledWith('h8')
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('o')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(container.querySelector('[data-point="a15"] .gomoku-point-segment-left')).toBeNull()
    expect(container.querySelector('[data-point="a15"] .gomoku-point-segment-up')).toBeNull()
    expect(container.querySelector('[data-point="h8"]')).toHaveClass('gomoku-point-last')
    expect(container.querySelector('[data-point="h8"]')).toHaveClass('gomoku-point-winning')
    expect(container.querySelector('[data-point="d12"] .gomoku-star-point')).not.toBeNull()
    expect(screen.getAllByLabelText(/stone/)).toHaveLength(2)
  })
})
