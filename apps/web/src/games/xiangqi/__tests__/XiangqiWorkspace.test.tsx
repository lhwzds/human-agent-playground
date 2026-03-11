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
  events = [
    {
      id: 'event-created',
      kind: 'session_created' as const,
      createdAt: '2026-03-07T00:00:00.000Z',
      actorKind: 'human' as const,
      channel: 'ui' as const,
      summary: 'Created a new Xiangqi session.',
      details: {
        gameId: 'xiangqi',
      },
    },
  ],
): GameSession<XiangqiGameState> {
  return {
    id: 'session-1',
    gameId: 'xiangqi',
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt,
    state,
    events,
  }
}

describe('XiangqiWorkspace', () => {
  it('loads legal moves and plays a move through the Xiangqi API module', async () => {
    const session = createSession()
    const nextState = applyXiangqiMove(session.state, 'a4', 'a5')
    const nextSession = createSession(nextState, '2026-03-07T00:00:00.000Z', [
      ...session.events,
      {
        id: 'event-move-1',
        kind: 'move_played',
        createdAt: '2026-03-07T00:00:00.000Z',
        actorKind: 'human',
        channel: 'ui',
        summary: 'Red played a4 -> a5.',
        details: {
          from: 'a4',
          to: 'a5',
          side: 'red',
          pieceDisplay: '兵',
        },
      },
    ])
    const onSessionUpdate = vi.fn()
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
        onSessionUpdate={onSessionUpdate}
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

  it('renders a chat-like message feed with full move history and reasoning summaries', () => {
    const firstState = applyXiangqiMove(createInitialXiangqiGame(), 'a4', 'a5')
    const secondState = applyXiangqiMove(firstState, 'a7', 'a6')
    const thirdState = applyXiangqiMove(secondState, 'a5', 'a6')
    const baseEvents = createSession().events
    const firstSession = createSession(firstState, '2026-03-07T00:01:00.000Z', [
      ...baseEvents,
      {
        id: 'event-move-1',
        kind: 'move_played',
        createdAt: '2026-03-07T00:01:00.000Z',
        actorKind: 'human',
        channel: 'ui',
        summary: 'Red played a4 -> a5.',
        details: {
          from: 'a4',
          to: 'a5',
          side: 'red',
        },
      },
    ])
    const secondSession = createSession(secondState, '2026-03-07T00:02:00.000Z', [
      ...firstSession.events,
      {
        id: 'event-move-2',
        kind: 'move_played',
        createdAt: '2026-03-07T00:02:00.000Z',
        actorKind: 'agent',
        channel: 'mcp',
        summary: 'Black played a7 -> a6.',
        reasoning: {
          summary: 'Respond on the same file to contest the pawn advance.',
          reasoningSteps: ['Mirror the file pressure immediately.'],
          consideredAlternatives: [],
          confidence: 0.66,
        },
        details: {
          from: 'a7',
          to: 'a6',
          side: 'black',
          pieceDisplay: '卒',
        },
      },
    ])
    const thirdSession = createSession(thirdState, '2026-03-07T00:03:00.000Z', [
      ...secondSession.events,
      {
        id: 'event-move-3',
        kind: 'move_played',
        createdAt: '2026-03-07T00:03:00.000Z',
        actorKind: 'agent',
        channel: 'mcp',
        summary: 'Red played a5 -> a6.',
        reasoning: {
          summary: 'Capture the pawn to keep the initiative on the file.',
          reasoningSteps: ['The capture wins material and keeps the pawn advanced.'],
          consideredAlternatives: [
            {
              action: 'b1 -> c3',
              summary: 'Develop the horse instead.',
              rejectedBecause: 'It leaves the pawn tension unresolved.',
            },
          ],
          confidence: 0.81,
        },
        details: {
          from: 'a5',
          to: 'a6',
          side: 'red',
          pieceDisplay: '兵',
          capturedDisplay: '卒',
        },
      },
    ])

    const { container, rerender } = render(
      <XiangqiWorkspace
        game={xiangqiGameCatalogItem}
        session={firstSession}
        error={null}
        onSessionUpdate={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const messageFeedCard = screen.getByRole('heading', { name: 'Message Feed' }).closest('.panel-card')

    expect(messageFeedCard).not.toBeNull()
    expect(within(messageFeedCard as HTMLElement).getByText('Session Created')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('a4 → a5')).toBeInTheDocument()
    expect(within(messageFeedCard as HTMLElement).getByText('Created a new Xiangqi session.')).toBeInTheDocument()
    expect(container.querySelector('[data-square="a4"]')).toHaveClass('board-cell-last-from')
    expect(container.querySelector('[data-square="a5"]')).toHaveClass('board-cell-last-to')

    rerender(
      <XiangqiWorkspace
        game={xiangqiGameCatalogItem}
        session={secondSession}
        error={null}
        onSessionUpdate={vi.fn()}
        onError={vi.fn()}
      />,
    )

    rerender(
      <XiangqiWorkspace
        game={xiangqiGameCatalogItem}
        session={thirdSession}
        error={null}
        onSessionUpdate={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const nextMessageFeedCard = screen.getByRole('heading', { name: 'Message Feed' }).closest('.panel-card')

    expect(nextMessageFeedCard).not.toBeNull()
    expect(within(nextMessageFeedCard as HTMLElement).getByText('a5 → a6')).toBeInTheDocument()
    expect(within(nextMessageFeedCard as HTMLElement).getByText('兵 captured 卒')).toBeInTheDocument()
    expect(within(nextMessageFeedCard as HTMLElement).getAllByText('Reasoning Summary')).toHaveLength(2)
    expect(within(nextMessageFeedCard as HTMLElement).getByText('Capture the pawn to keep the initiative on the file.')).toBeInTheDocument()
    expect(within(nextMessageFeedCard as HTMLElement).getByText('a7 → a6')).toBeInTheDocument()
    expect(within(nextMessageFeedCard as HTMLElement).getByText('Respond on the same file to contest the pawn advance.')).toBeInTheDocument()
    expect(within(nextMessageFeedCard as HTMLElement).getByText('Session Created')).toBeInTheDocument()
    expect(container.querySelector('[data-square="a5"]')).toHaveClass('board-cell-last-from')
    expect(container.querySelector('[data-square="a6"]')).toHaveClass('board-cell-last-to')
  })
})
