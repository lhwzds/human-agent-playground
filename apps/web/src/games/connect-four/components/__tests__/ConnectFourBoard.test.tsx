import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createInitialConnectFourGame } from '@human-agent-playground/game-connect-four'

import { ConnectFourBoard } from '../ConnectFourBoard'

describe('ConnectFourBoard', () => {
  it('renders slots, discs, and delegates clicks by column', () => {
    const game = createInitialConnectFourGame()
    game.board[5][0] = { side: 'red', display: '●' }
    game.board[4][0] = { side: 'yellow', display: '●' }
    const onColumnClick = vi.fn()

    const { container } = render(
      <ConnectFourBoard
        board={game.board}
        lastMovePoint="a2"
        winningLine={new Set(['a2', 'b2', 'c2', 'd2'])}
        onColumnClick={onColumnClick}
      />,
    )

    const point = container.querySelector('[data-point="a2"]')
    expect(point).not.toBeNull()
    fireEvent.click(point!)
    expect(onColumnClick).toHaveBeenCalledWith(1)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(container.querySelector('[data-point="a2"]')).toHaveClass('connect-four-cell-last')
    expect(container.querySelector('[data-point="a2"]')).toHaveClass('connect-four-cell-winning')
    expect(container.querySelectorAll('.connect-four-disc')).toHaveLength(2)
  })
})
