import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createInitialChessGame } from '@human-agent-playground/game-chess'

import { ChessBoard } from '../ChessBoard'

describe('ChessBoard', () => {
  it('renders pieces, highlights, and delegates clicks by square', () => {
    const game = createInitialChessGame()
    const onSquareClick = vi.fn()

    const { container } = render(
      <ChessBoard
        board={game.board}
        selectedSquare="e2"
        legalTargets={new Set(['e3', 'e4'])}
        lastMoveFrom="g8"
        lastMoveTo="f6"
        onSquareClick={onSquareClick}
      />,
    )

    fireEvent.click(container.querySelector('[data-square="e2"]')!)

    expect(onSquareClick).toHaveBeenCalledWith('e2')
    expect(container.querySelector('[data-square="e2"]')).toHaveClass('chess-square-selected')
    expect(container.querySelector('[data-square="e3"]')).toHaveClass('chess-square-target')
    expect(container.querySelector('[data-square="g8"]')).toHaveClass('chess-square-last-from')
    expect(container.querySelector('[data-square="f6"]')).toHaveClass('chess-square-last-to')
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(container.querySelectorAll('.chess-piece')).toHaveLength(32)
  })
})
