import { act, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App, { resetBootstrapCacheForTests } from '../App'

const closeStream = vi.fn()
let emitSessionUpdate: ((session: unknown) => void) | null = null

vi.mock('../api', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  listGames: vi.fn(),
  listSessions: vi.fn(),
  openSessionStream: vi.fn((_sessionId: string, onSession: (session: unknown) => void, onStateChange?: (state: 'connecting' | 'live' | 'reconnecting') => void) => {
    emitSessionUpdate = onSession
    onStateChange?.('live')
    return {
      close: closeStream,
    }
  }),
  resetSession: vi.fn(),
}))

import { listGames, listSessions } from '../api'

describe('App', () => {
  beforeEach(() => {
    emitSessionUpdate = null
    closeStream.mockClear()
    vi.clearAllMocks()
    resetBootstrapCacheForTests()
  })

  it('applies live session updates from the session stream', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'xiangqi',
        title: 'Chinese Chess',
        shortName: 'Xiangqi',
        description: 'A 9x10 perfect-information board game with palace and cannon rules.',
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-xq-1',
        gameId: 'xiangqi',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        events: [
          {
            id: 'event-created',
            kind: 'session_created',
            createdAt: '2026-03-07T00:00:00.000Z',
            actorKind: 'human',
            channel: 'ui',
            summary: 'Created a new Xiangqi session.',
            details: {
              gameId: 'xiangqi',
            },
          },
        ],
        state: {
          kind: 'xiangqi',
          turn: 'red',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: [
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
          ],
        },
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Turn: red')).toBeInTheDocument()
      expect(screen.getByText('Sync: live')).toBeInTheDocument()
    })

    act(() => {
      emitSessionUpdate?.({
        id: 'session-xq-1',
        gameId: 'xiangqi',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:01:00.000Z',
        events: [
          {
            id: 'event-created',
            kind: 'session_created',
            createdAt: '2026-03-07T00:00:00.000Z',
            actorKind: 'human',
            channel: 'ui',
            summary: 'Created a new Xiangqi session.',
            details: {
              gameId: 'xiangqi',
            },
          },
          {
            id: 'event-move-1',
            kind: 'move_played',
            createdAt: '2026-03-07T00:01:00.000Z',
            actorKind: 'agent',
            channel: 'mcp',
            summary: 'Red played a4 -> a5.',
            reasoning: {
              summary: 'Push the pawn to gain space on the file.',
              reasoningSteps: ['The pawn advance is the cleanest space-gaining move.'],
              consideredAlternatives: [],
              confidence: 0.71,
            },
            details: {
              from: 'a4',
              to: 'a5',
              side: 'red',
            },
          },
        ],
        state: {
          kind: 'xiangqi',
          turn: 'black',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: {
            from: 'a4',
            to: 'a5',
            piece: {
              key: 'r-pawn-1',
              side: 'red',
              type: 'pawn',
              display: '兵',
            },
            captured: null,
            notation: 'a4a5',
          },
          board: [
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
          ],
        },
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Turn: black')).toBeInTheDocument()
      const messageFeedCard = screen.getByRole('heading', { name: 'Message Feed' }).closest('.panel-card')

      expect(messageFeedCard).not.toBeNull()
      expect(within(messageFeedCard as HTMLElement).getByText('a4 → a5')).toBeInTheDocument()
      expect(within(messageFeedCard as HTMLElement).getByText('Reasoning Summary')).toBeInTheDocument()
      expect(within(messageFeedCard as HTMLElement).getByText('Push the pawn to gain space on the file.')).toBeInTheDocument()
      expect(within(messageFeedCard as HTMLElement).getByText('Session Created')).toBeInTheDocument()
    })
  })

  it('shows a fallback state when a game has no registered web module', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'go',
        title: 'Go',
        shortName: 'Go',
        description: 'Unsupported in the current web build.',
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-go-1',
        gameId: 'go',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        events: [
          {
            id: 'event-created',
            kind: 'session_created',
            createdAt: '2026-03-07T00:00:00.000Z',
            actorKind: 'human',
            channel: 'ui',
            summary: 'Created a new Go session.',
            details: {
              gameId: 'go',
            },
          },
        ],
        state: {
          kind: 'go',
        },
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('No renderer is registered for go.')).toBeInTheDocument()
    })
  })

  it('renders a Gomoku session through the registered game module', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'gomoku',
        title: 'Gomoku',
        shortName: 'Gomoku',
        description: 'A 15x15 connection game where players race to make five in a row.',
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-gmk-1',
        gameId: 'gomoku',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        events: [
          {
            id: 'event-created',
            kind: 'session_created',
            createdAt: '2026-03-07T00:00:00.000Z',
            actorKind: 'human',
            channel: 'ui',
            summary: 'Created a new Gomoku session.',
            details: {
              gameId: 'gomoku',
            },
          },
        ],
        state: {
          kind: 'gomoku',
          turn: 'black',
          status: 'active',
          winner: null,
          lastMove: null,
          moveCount: 0,
          winningLine: null,
          board: Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null)),
        },
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Game: Gomoku')).toBeInTheDocument()
      expect(screen.getByText('Turn: black')).toBeInTheDocument()
      expect(screen.getByText(/Stones played: 0/)).toBeInTheDocument()
    })
  })
})
