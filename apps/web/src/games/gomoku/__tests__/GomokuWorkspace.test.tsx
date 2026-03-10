import type { GameSession } from '@human-agent-playground/core'
import {
  createInitialGomokuGame,
  gomokuGameCatalogItem,
  playGomokuMove as applyGomokuMove,
  type GomokuGameState,
} from '@human-agent-playground/game-gomoku'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GomokuWorkspace } from '../GomokuWorkspace'
import { getGomokuLegalMoves, playGomokuMove } from '../api'

vi.mock('../api', () => ({
  getGomokuLegalMoves: vi.fn(),
  playGomokuMove: vi.fn(),
}))

function createSession(
  state = createInitialGomokuGame(),
  updatedAt = '2026-03-07T00:00:00.000Z',
  events = [
    {
      id: 'event-created',
      kind: 'session_created' as const,
      createdAt: '2026-03-07T00:00:00.000Z',
      actorKind: 'human' as const,
      channel: 'ui' as const,
      summary: 'Created a new Gomoku session.',
      details: {
        gameId: 'gomoku',
      },
    },
  ],
): GameSession<GomokuGameState> {
  return {
    id: 'session-gmk-1',
    gameId: 'gomoku',
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt,
    state,
    events,
  }
}

describe('GomokuWorkspace', () => {
  it('verifies a legal point and plays a stone through the Gomoku API module', async () => {
    const session = createSession()
    const nextState = applyGomokuMove(session.state, 'h8')
    const nextSession = createSession(nextState, '2026-03-07T00:00:10.000Z', [
      ...session.events,
      {
        id: 'event-move-1',
        kind: 'move_played',
        createdAt: '2026-03-07T00:00:10.000Z',
        actorKind: 'human',
        channel: 'ui',
        summary: 'black played h8.',
        details: {
          point: 'h8',
          side: 'black',
          stoneDisplay: '●',
        },
      },
    ])
    const onSessionUpdate = vi.fn()
    const onRefreshSession = vi.fn()
    const onResetSession = vi.fn()
    const onError = vi.fn()

    vi.mocked(getGomokuLegalMoves).mockResolvedValue([{ point: 'h8' }])
    vi.mocked(playGomokuMove).mockResolvedValue(nextSession)

    const { container } = render(
      <GomokuWorkspace
        game={gomokuGameCatalogItem}
        session={session}
        error={null}
        setupPanel={<div>Setup</div>}
        onSessionUpdate={onSessionUpdate}
        onRefreshSession={onRefreshSession}
        onResetSession={onResetSession}
        onError={onError}
      />,
    )

    fireEvent.click(container.querySelector('[data-point="h8"]')!)

    await waitFor(() => {
      expect(getGomokuLegalMoves).toHaveBeenCalledWith('session-gmk-1', 'h8')
      expect(playGomokuMove).toHaveBeenCalledWith('session-gmk-1', 'h8')
      expect(onSessionUpdate).toHaveBeenCalledWith(nextSession)
    })
  })

  it('renders the message feed, reasoning summaries, and winning-line highlight', () => {
    let state = createInitialGomokuGame()
    state = applyGomokuMove(state, 'h8')
    state = applyGomokuMove(state, 'a1')
    state = applyGomokuMove(state, 'i8')
    const session = createSession(state, '2026-03-07T00:00:20.000Z', [
      ...createSession().events,
      {
        id: 'event-move-1',
        kind: 'move_played',
        createdAt: '2026-03-07T00:00:05.000Z',
        actorKind: 'human',
        channel: 'ui',
        summary: 'black played h8.',
        details: {
          point: 'h8',
          side: 'black',
          stoneDisplay: '●',
        },
      },
      {
        id: 'event-move-2',
        kind: 'move_played',
        createdAt: '2026-03-07T00:00:10.000Z',
        actorKind: 'human',
        channel: 'ui',
        summary: 'white played a1.',
        details: {
          point: 'a1',
          side: 'white',
          stoneDisplay: '○',
        },
      },
      {
        id: 'event-move-3',
        kind: 'move_played',
        createdAt: '2026-03-07T00:00:20.000Z',
        actorKind: 'agent',
        channel: 'mcp',
        summary: 'black played i8.',
        reasoning: {
          summary: 'Extend the central row while keeping both ends flexible.',
          reasoningSteps: ['The horizontal extension creates a stronger line than remote side points.'],
          consideredAlternatives: [],
          confidence: 0.78,
        },
        details: {
          point: 'i8',
          side: 'black',
          stoneDisplay: '●',
        },
      },
    ])

    const { container } = render(
      <GomokuWorkspace
        game={gomokuGameCatalogItem}
        session={session}
        error={null}
        setupPanel={<div>Setup</div>}
        onSessionUpdate={vi.fn()}
        onRefreshSession={vi.fn()}
        onResetSession={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const messageFeedCard = screen.getByRole('heading', { name: 'Message Feed' }).closest('.panel-card')

    expect(messageFeedCard).not.toBeNull()
    expect(within(messageFeedCard as HTMLElement).getByText('Session Created')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('i8')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('Reasoning Summary')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('Extend the central row while keeping both ends flexible.')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getAllByText('Placed ●')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'MCP Shape' })).toBeInTheDocument()
    expect(container.querySelector('[data-point="i8"]')).toHaveClass('gomoku-point-last')
  })
})
