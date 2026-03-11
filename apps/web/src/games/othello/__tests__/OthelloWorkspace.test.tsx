import type { GameSession } from '@human-agent-playground/core'
import {
  createInitialOthelloGame,
  othelloGameCatalogItem,
  playOthelloMove as applyOthelloMove,
  type OthelloGameState,
} from '@human-agent-playground/game-othello'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OthelloWorkspace } from '../OthelloWorkspace'
import { getOthelloLegalMoves, playOthelloMove } from '../api'

vi.mock('../api', () => ({
  getOthelloLegalMoves: vi.fn(),
  playOthelloMove: vi.fn(),
}))

function createSession(
  state = createInitialOthelloGame(),
  updatedAt = '2026-03-10T00:00:00.000Z',
  events = [
    {
      id: 'event-created',
      kind: 'session_created' as const,
      createdAt: '2026-03-10T00:00:00.000Z',
      actorKind: 'human' as const,
      channel: 'ui' as const,
      summary: 'Created a new Othello session.',
      details: {
        gameId: 'othello',
      },
    },
  ],
): GameSession<OthelloGameState> {
  return {
    id: 'session-oth-1',
    gameId: 'othello',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt,
    state,
    events,
  }
}

describe('OthelloWorkspace', () => {
  it('loads legal moves and plays a legal point through the Othello API module', async () => {
    const session = createSession()
    const nextState = applyOthelloMove(session.state, 'd3')
    const nextSession = createSession(nextState, '2026-03-10T00:00:10.000Z', [
      ...session.events,
      {
        id: 'event-move-1',
        kind: 'move_played' as const,
        createdAt: '2026-03-10T00:00:10.000Z',
        actorKind: 'human' as const,
        channel: 'ui' as const,
        summary: 'black played d3.',
        details: {
          point: 'd3',
          side: 'black',
          stoneDisplay: '●',
          flippedPoints: ['d4'],
        },
      },
    ])

    vi.mocked(getOthelloLegalMoves)
      .mockResolvedValueOnce([
        { point: 'd3', flips: ['d4'] },
        { point: 'c4', flips: ['d4'] },
      ])
      .mockResolvedValueOnce([{ point: 'd3', flips: ['d4'] }])
    vi.mocked(playOthelloMove).mockResolvedValue(nextSession)

    const onSessionUpdate = vi.fn()
    const onError = vi.fn()
    const { container } = render(
      <OthelloWorkspace
        game={othelloGameCatalogItem}
        session={session}
        error={null}
        onSessionUpdate={onSessionUpdate}
        onError={onError}
      />,
    )

    await waitFor(() => {
      expect(getOthelloLegalMoves).toHaveBeenCalledWith('session-oth-1')
      expect(container.querySelectorAll('.othello-legal-marker')).toHaveLength(2)
    })

    fireEvent.click(container.querySelector('[data-point="d3"]')!)

    await waitFor(() => {
      expect(getOthelloLegalMoves).toHaveBeenCalledWith('session-oth-1', 'd3')
      expect(playOthelloMove).toHaveBeenCalledWith('session-oth-1', 'd3')
      expect(onSessionUpdate).toHaveBeenCalledWith(nextSession)
    })
  })

  it('renders the message feed, reasoning summaries, and last-move highlight', async () => {
    let state = createInitialOthelloGame()
    state = applyOthelloMove(state, 'd3')
    const session = createSession(state, '2026-03-10T00:00:20.000Z', [
      ...createSession().events,
      {
        id: 'event-move-1',
        kind: 'move_played' as const,
        createdAt: '2026-03-10T00:00:20.000Z',
        actorKind: 'agent' as const,
        channel: 'mcp' as const,
        summary: 'black played d3.',
        reasoning: {
          summary: 'Take the standard opening edge toward the left diagonal.',
          reasoningSteps: ['d3 flips one disc and preserves access to several follow-up moves.'],
          consideredAlternatives: [],
          confidence: 0.7,
        },
        details: {
          point: 'd3',
          side: 'black',
          stoneDisplay: '●',
          flippedPoints: ['d4'],
        },
      },
    ])

    vi.mocked(getOthelloLegalMoves).mockResolvedValue([
      { point: 'c3', flips: ['d4'] },
      { point: 'c5', flips: ['d5'] },
      { point: 'e3', flips: ['e4'] },
    ])

    const { container } = render(
      <OthelloWorkspace
        game={othelloGameCatalogItem}
        session={session}
        error={null}
        onSessionUpdate={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const messageFeedCard = screen.getByRole('heading', { name: 'Message Feed' }).closest('.panel-card')

    await waitFor(() => {
      expect(container.querySelectorAll('.othello-legal-marker')).toHaveLength(3)
    })

    expect(messageFeedCard).not.toBeNull()
    expect(within(messageFeedCard as HTMLElement).getByText('d3')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('Reasoning Summary')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('Take the standard opening edge toward the left diagonal.')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('Placed ● and flipped 1 disc: d4')).toBeInTheDocument()
    expect(container.querySelector('[data-point="d3"]')).toHaveClass('othello-cell-last')
  })
})
