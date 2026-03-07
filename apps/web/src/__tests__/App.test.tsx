import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from '../App'

vi.mock('../api', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  listGames: vi.fn(),
  listSessions: vi.fn(),
  resetSession: vi.fn(),
}))

import { listGames, listSessions } from '../api'

describe('App', () => {
  it('shows a fallback state when a game has no registered web module', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'go',
        title: 'Go',
        shortName: 'Go',
        description: 'Unsupported in the current web build.',
        supportsHumanVsHuman: true,
        supportsHumanVsAgent: true,
        supportsAgentVsAgent: true,
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-go-1',
        gameId: 'go',
        mode: 'human-vs-agent',
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
