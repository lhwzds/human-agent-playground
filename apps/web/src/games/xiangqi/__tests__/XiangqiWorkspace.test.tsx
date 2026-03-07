import type { GameSession } from '@human-agent-playground/core'
import {
  createInitialXiangqiGame,
  playXiangqiMove as applyXiangqiMove,
  xiangqiGameCatalogItem,
  type XiangqiGameState,
} from '@human-agent-playground/game-xiangqi'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { XiangqiWorkspace } from '../XiangqiWorkspace'
import { getXiangqiLegalMoves, playXiangqiMove } from '../api'

vi.mock('../api', () => ({
  getXiangqiLegalMoves: vi.fn(),
  playXiangqiMove: vi.fn(),
}))

function createSession(state = createInitialXiangqiGame()): GameSession<XiangqiGameState> {
  return {
    id: 'session-1',
    gameId: 'xiangqi',
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z',
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
})
