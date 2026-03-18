import type { GameSession } from '@human-agent-playground/core'
import {
  chessGameCatalogItem,
  createInitialChessGame,
  playChessMove as applyChessMove,
  type ChessGameState,
} from '@human-agent-playground/game-chess'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChessWorkspace } from '../ChessWorkspace'
import { getChessLegalMoves, playChessMove } from '../api'

vi.mock('../api', () => ({
  getChessLegalMoves: vi.fn(),
  playChessMove: vi.fn(),
}))

function createSession(
  state = createInitialChessGame(),
  updatedAt = '2026-03-12T00:00:00.000Z',
  events = [
    {
      id: 'event-created',
      kind: 'session_created' as const,
      createdAt: '2026-03-12T00:00:00.000Z',
      actorKind: 'human' as const,
      channel: 'ui' as const,
      summary: 'Created a new Chess session.',
      details: {
        gameId: 'chess',
      },
    },
  ],
): GameSession<ChessGameState> {
  return {
    id: 'session-chs-1',
    gameId: 'chess',
    createdAt: '2026-03-12T00:00:00.000Z',
    updatedAt,
    state,
    events,
  }
}

describe('ChessWorkspace', () => {
  it('loads legal moves for a selected square and plays a legal move through the Chess API module', async () => {
    const session = createSession()
    const nextState = applyChessMove(session.state, 'e2', 'e4')
    const nextSession = createSession(nextState, '2026-03-12T00:00:10.000Z', [
      ...session.events,
      {
        id: 'event-move-1',
        kind: 'move_played' as const,
        createdAt: '2026-03-12T00:00:10.000Z',
        actorKind: 'human' as const,
        channel: 'ui' as const,
        summary: 'white played e2 -> e4.',
        details: {
          from: 'e2',
          to: 'e4',
          side: 'white',
          san: 'e4',
          pieceDisplay: '♙',
        },
      },
    ])

    vi.mocked(getChessLegalMoves)
      .mockResolvedValueOnce([
        {
          from: 'e2',
          to: 'e3',
          side: 'white',
          piece: 'pawn',
          san: 'e3',
          notation: 'e2e3',
          flags: 'n',
          captured: null,
          promotion: null,
        },
        {
          from: 'e2',
          to: 'e4',
          side: 'white',
          piece: 'pawn',
          san: 'e4',
          notation: 'e2e4',
          flags: 'b',
          captured: null,
          promotion: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          from: 'e2',
          to: 'e3',
          side: 'white',
          piece: 'pawn',
          san: 'e3',
          notation: 'e2e3',
          flags: 'n',
          captured: null,
          promotion: null,
        },
        {
          from: 'e2',
          to: 'e4',
          side: 'white',
          piece: 'pawn',
          san: 'e4',
          notation: 'e2e4',
          flags: 'b',
          captured: null,
          promotion: null,
        },
      ])
    vi.mocked(playChessMove).mockResolvedValue(nextSession)

    const onSessionUpdate = vi.fn()
    const onError = vi.fn()
    const { container } = render(
      <ChessWorkspace
        game={chessGameCatalogItem}
        session={session}
        error={null}
        onSessionUpdate={onSessionUpdate}
        onError={onError}
      />,
    )

    fireEvent.click(container.querySelector('[data-square="e2"]')!)

    await waitFor(() => {
      expect(getChessLegalMoves).toHaveBeenCalledWith('session-chs-1', 'e2')
      expect(container.querySelector('[data-square="e4"]')).toHaveClass('chess-square-target')
    })

    fireEvent.click(container.querySelector('[data-square="e4"]')!)

    await waitFor(() => {
      expect(playChessMove).toHaveBeenCalledWith('session-chs-1', 'e2', 'e4', undefined)
      expect(onSessionUpdate).toHaveBeenCalledWith(nextSession)
    })
  })

  it('renders the message feed, reasoning summaries, and last move highlight', () => {
    let state = createInitialChessGame()
    state = applyChessMove(state, 'e2', 'e4')
    const session = createSession(state, '2026-03-12T00:00:20.000Z', [
      ...createSession().events,
      {
        id: 'event-move-1',
        kind: 'move_played' as const,
        createdAt: '2026-03-12T00:00:20.000Z',
        actorKind: 'agent' as const,
        channel: 'mcp' as const,
        summary: 'white played e2 -> e4.',
        reasoning: {
          summary: 'Occupy the center and open lines for the bishop and queen.',
          reasoningSteps: ['The double pawn push claims central space immediately.'],
          consideredAlternatives: [],
          confidence: 0.8,
        },
        details: {
          from: 'e2',
          to: 'e4',
          side: 'white',
          san: 'e4',
          pieceDisplay: '♙',
        },
      },
    ])

    const { container } = render(
      <ChessWorkspace
        game={chessGameCatalogItem}
        session={session}
        error={null}
        onSessionUpdate={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const messageFeedCard = screen.getByRole('heading', { name: 'Message Feed' }).closest('.panel-card')
    const reasoningDetails = messageFeedCard?.querySelector('.reasoning-summary')

    expect(messageFeedCard).not.toBeNull()
    expect(reasoningDetails).not.toBeNull()
    expect(reasoningDetails).not.toHaveAttribute('open')
    expect(within(messageFeedCard as HTMLElement).getByText('e2 → e4')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('Reasoning Summary')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('SAN: e4')).toBeInTheDocument()
    expect(container.querySelector('[data-square="e2"]')).toHaveClass('chess-square-last-from')
    expect(container.querySelector('[data-square="e4"]')).toHaveClass('chess-square-last-to')

    fireEvent.click(within(messageFeedCard as HTMLElement).getByText('Reasoning Summary'))

    expect(reasoningDetails).toHaveAttribute('open')
    expect(
      within(messageFeedCard as HTMLElement).getByText('The double pawn push claims central space immediately.'),
    ).toBeInTheDocument()
  })
})
