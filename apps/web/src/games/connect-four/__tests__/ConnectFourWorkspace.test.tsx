import type { GameSession } from '@human-agent-playground/core'
import {
  connectFourGameCatalogItem,
  createInitialConnectFourGame,
  playConnectFourMove as applyConnectFourMove,
  type ConnectFourGameState,
} from '@human-agent-playground/game-connect-four'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConnectFourWorkspace } from '../ConnectFourWorkspace'
import { getConnectFourLegalMoves, playConnectFourMove } from '../api'

vi.mock('../api', () => ({
  getConnectFourLegalMoves: vi.fn(),
  playConnectFourMove: vi.fn(),
}))

function createSession(
  state = createInitialConnectFourGame(),
  updatedAt = '2026-03-10T00:00:00.000Z',
  events = [
    {
      id: 'event-created',
      kind: 'session_created' as const,
      createdAt: '2026-03-10T00:00:00.000Z',
      actorKind: 'human' as const,
      channel: 'ui' as const,
      summary: 'Created a new Connect Four session.',
      details: {
        gameId: 'connect-four',
      },
    },
  ],
): GameSession<ConnectFourGameState> {
  return {
    id: 'session-cf-1',
    gameId: 'connect-four',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt,
    state,
    events,
  }
}

describe('ConnectFourWorkspace', () => {
  it('verifies a legal column and drops a disc through the Connect Four API module', async () => {
    const session = createSession()
    const nextState = applyConnectFourMove(session.state, 4)
    const nextSession = createSession(nextState, '2026-03-10T00:00:10.000Z', [
      ...session.events,
      {
        id: 'event-move-1',
        kind: 'move_played' as const,
        createdAt: '2026-03-10T00:00:10.000Z',
        actorKind: 'human' as const,
        channel: 'ui' as const,
        summary: 'red played d1.',
        details: {
          column: 4,
          point: 'd1',
          side: 'red',
          stoneDisplay: '●',
        },
      },
    ])

    vi.mocked(getConnectFourLegalMoves).mockResolvedValue([{ column: 4, point: 'd1' }])
    vi.mocked(playConnectFourMove).mockResolvedValue(nextSession)

    const onSessionUpdate = vi.fn()
    const onError = vi.fn()
    const { container } = render(
      <ConnectFourWorkspace
        game={connectFourGameCatalogItem}
        session={session}
        error={null}
        onSessionUpdate={onSessionUpdate}
        onError={onError}
      />,
    )

    fireEvent.click(container.querySelector('[data-point="d6"]')!)

    await waitFor(() => {
      expect(getConnectFourLegalMoves).toHaveBeenCalledWith('session-cf-1', 4)
      expect(playConnectFourMove).toHaveBeenCalledWith('session-cf-1', 4)
      expect(onSessionUpdate).toHaveBeenCalledWith(nextSession)
    })
  })

  it('renders the message feed, reasoning summaries, and last-move highlight', () => {
    let state = createInitialConnectFourGame()
    state = applyConnectFourMove(state, 4)
    state = applyConnectFourMove(state, 4)

    const session = createSession(state, '2026-03-10T00:00:20.000Z', [
      ...createSession().events,
      {
        id: 'event-move-1',
        kind: 'move_played' as const,
        createdAt: '2026-03-10T00:00:05.000Z',
        actorKind: 'human' as const,
        channel: 'ui' as const,
        summary: 'red played d1.',
        details: {
          column: 4,
          point: 'd1',
          side: 'red',
          stoneDisplay: '●',
        },
      },
      {
        id: 'event-move-2',
        kind: 'move_played' as const,
        createdAt: '2026-03-10T00:00:20.000Z',
        actorKind: 'agent' as const,
        channel: 'mcp' as const,
        summary: 'yellow played d2.',
        reasoning: {
          summary: 'Mirror the center drop to keep the same file contested.',
          reasoningSteps: ['The center column is still the most flexible reply.'],
          consideredAlternatives: [],
          confidence: 0.72,
        },
        details: {
          column: 4,
          point: 'd2',
          side: 'yellow',
          stoneDisplay: '●',
        },
      },
    ])

    const { container } = render(
      <ConnectFourWorkspace
        game={connectFourGameCatalogItem}
        session={session}
        error={null}
        onSessionUpdate={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const messageFeedCard = screen.getByRole('heading', { name: 'Message Feed' }).closest('.panel-card')

    expect(messageFeedCard).not.toBeNull()
    expect(within(messageFeedCard as HTMLElement).getByText('Session Created')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('d2')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('Reasoning Summary')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('Mirror the center drop to keep the same file contested.')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('Dropped yellow disc in column 4 (d2)')).toBeInTheDocument()
    expect(container.querySelector('[data-point="d2"]')).toHaveClass('connect-four-cell-last')
  })
})
