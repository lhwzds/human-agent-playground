import type { GameSession } from '@human-agent-playground/core'
import {
  createInitialXiangqiGame,
  playXiangqiMove as applyXiangqiMove,
  xiangqiGameCatalogItem,
  type XiangqiGameState,
} from '@human-agent-playground/game-xiangqi'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { XiangqiWorkspace } from '../XiangqiWorkspace'
import { getXiangqiLegalMoves, playXiangqiMove } from '../api'

vi.mock('../api', () => ({
  getXiangqiLegalMoves: vi.fn(),
  playXiangqiMove: vi.fn(),
}))

function createSession(
  state = createInitialXiangqiGame(),
  updatedAt = '2026-03-07T00:00:00.000Z',
): GameSession<XiangqiGameState> {
  return {
    id: 'session-1',
    gameId: 'xiangqi',
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt,
    state,
  }
}

describe('XiangqiWorkspace', () => {
  it('loads legal moves and plays a move through the Xiangqi API module', async () => {
    const session = createSession()
    const nextSession = createSession(applyXiangqiMove(session.state, 'a4', 'a5'))
    const onSessionUpdate = vi.fn()
    const onRefreshSession = vi.fn()
    const onResetSession = vi.fn()
    const onError = vi.fn()

    vi.mocked(getXiangqiLegalMoves).mockResolvedValue([
      {
        from: 'a4',
        to: 'a5',
        side: 'red',
        piece: session.state.board[6][0]!,
        captured: null,
        notation: 'a4a5',
      },
    ])
    vi.mocked(playXiangqiMove).mockResolvedValue(nextSession)

    const { container } = render(
      <XiangqiWorkspace
        game={xiangqiGameCatalogItem}
        session={session}
        error={null}
        setupPanel={<div>Setup</div>}
        onSessionUpdate={onSessionUpdate}
        onRefreshSession={onRefreshSession}
        onResetSession={onResetSession}
        onError={onError}
      />,
    )

    fireEvent.click(container.querySelector('[data-square="a4"]')!)

    await waitFor(() => {
      expect(getXiangqiLegalMoves).toHaveBeenCalledWith('session-1', 'a4')
    })

    fireEvent.click(container.querySelector('[data-square="a5"]')!)

    await waitFor(() => {
      expect(playXiangqiMove).toHaveBeenCalledWith('session-1', 'a4', 'a5')
      expect(onSessionUpdate).toHaveBeenCalledWith(nextSession)
    })
  })

  it('resets the current session through the platform callback', async () => {
    const session = createSession()
    const onSessionUpdate = vi.fn()
    const onRefreshSession = vi.fn()
    const onResetSession = vi.fn().mockResolvedValue(session)
    const onError = vi.fn()

    const { getByRole } = render(
      <XiangqiWorkspace
        game={xiangqiGameCatalogItem}
        session={session}
        error={null}
        setupPanel={<div>Setup</div>}
        onSessionUpdate={onSessionUpdate}
        onRefreshSession={onRefreshSession}
        onResetSession={onResetSession}
        onError={onError}
      />,
    )

    fireEvent.click(getByRole('button', { name: 'Reset Session' }))

    await waitFor(() => {
      expect(onResetSession).toHaveBeenCalledWith('session-1')
    })
  })

  it('highlights the latest move and keeps a short recent move history', () => {
    const firstState = applyXiangqiMove(createInitialXiangqiGame(), 'a4', 'a5')
    const secondState = applyXiangqiMove(firstState, 'a7', 'a6')
    const thirdState = applyXiangqiMove(secondState, 'a5', 'a6')
    const firstSession = createSession(firstState, '2026-03-07T00:01:00.000Z')
    const secondSession = createSession(secondState, '2026-03-07T00:02:00.000Z')
    const thirdSession = createSession(thirdState, '2026-03-07T00:03:00.000Z')

    const { container, rerender } = render(
      <XiangqiWorkspace
        game={xiangqiGameCatalogItem}
        session={firstSession}
        error={null}
        setupPanel={<div>Setup</div>}
        onSessionUpdate={vi.fn()}
        onRefreshSession={vi.fn()}
        onResetSession={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const lastMoveCard = screen.getByRole('heading', { name: 'Last Move' }).closest('.panel-card')
    const recentActivityCard = screen.getByRole('heading', { name: 'Recent Activity' }).closest('.panel-card')

    expect(lastMoveCard).not.toBeNull()
    expect(recentActivityCard).not.toBeNull()
    expect(within(lastMoveCard as HTMLElement).getByText('a4 → a5')).toBeInTheDocument()
    expect(within(recentActivityCard as HTMLElement).getByText('No earlier moves yet.')).toBeInTheDocument()
    expect(container.querySelector('[data-square="a4"]')).toHaveClass('board-cell-last-from')
    expect(container.querySelector('[data-square="a5"]')).toHaveClass('board-cell-last-to')

    rerender(
      <XiangqiWorkspace
        game={xiangqiGameCatalogItem}
        session={secondSession}
        error={null}
        setupPanel={<div>Setup</div>}
        onSessionUpdate={vi.fn()}
        onRefreshSession={vi.fn()}
        onResetSession={vi.fn()}
        onError={vi.fn()}
      />,
    )

    rerender(
      <XiangqiWorkspace
        game={xiangqiGameCatalogItem}
        session={thirdSession}
        error={null}
        setupPanel={<div>Setup</div>}
        onSessionUpdate={vi.fn()}
        onRefreshSession={vi.fn()}
        onResetSession={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const nextRecentActivityCard = screen.getByRole('heading', { name: 'Recent Activity' }).closest('.panel-card')

    expect(nextRecentActivityCard).not.toBeNull()
    expect(within(lastMoveCard as HTMLElement).getByText('a5 → a6')).toBeInTheDocument()
    expect(within(lastMoveCard as HTMLElement).getByText('兵 captured 卒')).toBeInTheDocument()
    expect(within(nextRecentActivityCard as HTMLElement).queryByText('a5 → a6')).toBeNull()
    expect(within(nextRecentActivityCard as HTMLElement).getByText('a7 → a6')).toBeInTheDocument()
    expect(within(nextRecentActivityCard as HTMLElement).getByText('Black 卒')).toBeInTheDocument()
    expect(within(nextRecentActivityCard as HTMLElement).getByText('a4 → a5')).toBeInTheDocument()
    expect(within(nextRecentActivityCard as HTMLElement).getByText('Red 兵')).toBeInTheDocument()
    expect(container.querySelector('[data-square="a5"]')).toHaveClass('board-cell-last-from')
    expect(container.querySelector('[data-square="a6"]')).toHaveClass('board-cell-last-to')
  })
})
