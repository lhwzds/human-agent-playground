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
      const lastMoveCard = screen.getByRole('heading', { name: 'Last Move' }).closest('.panel-card')
      const recentActivityCard = screen.getByRole('heading', { name: 'Recent Activity' }).closest('.panel-card')

      expect(lastMoveCard).not.toBeNull()
      expect(recentActivityCard).not.toBeNull()
      expect(within(lastMoveCard as HTMLElement).getByText('a4 → a5')).toBeInTheDocument()
      expect(within(recentActivityCard as HTMLElement).getByText('No earlier moves yet.')).toBeInTheDocument()
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
})
