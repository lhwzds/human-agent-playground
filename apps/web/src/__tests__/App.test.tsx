import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App, { resetBootstrapCacheForTests } from '../App'
import { resetLanguagePreferenceForTests } from '../i18n'

const closeStream = vi.fn()
let emitSessionUpdate: ((session: unknown) => void) | null = null

vi.mock('../api', () => ({
  RequestError: class RequestError extends Error {
    code?: string
    details?: Record<string, unknown>

    constructor(message: string, code?: string, details?: Record<string, unknown>) {
      super(message)
      this.name = 'RequestError'
      this.code = code
      this.details = details
    }
  },
  createAuthProfile: vi.fn(),
  createSession: vi.fn(),
  deleteAuthProfile: vi.fn(),
  getAiRuntimeSettings: vi.fn(),
  getSession: vi.fn(),
  listAuthProfiles: vi.fn().mockResolvedValue([]),
  listGames: vi.fn(),
  listProviders: vi.fn().mockResolvedValue([]),
  listSessions: vi.fn(),
  openSessionStream: vi.fn((_sessionId: string, onSession: (session: unknown) => void, onStateChange?: (state: 'connecting' | 'live' | 'reconnecting') => void) => {
    emitSessionUpdate = onSession
    onStateChange?.('live')
    return {
      close: closeStream,
    }
  }),
  resetSession: vi.fn(),
  saveAiRuntimeSettings: vi.fn(),
  testAuthProfile: vi.fn(),
  updateAiSeatLauncher: vi.fn(),
  updateAiSeat: vi.fn(),
  updateAuthProfile: vi.fn(),
}))

import {
  createSession,
  getAiRuntimeSettings,
  getSession,
  listGames,
  listSessions,
  RequestError,
  resetSession,
  saveAiRuntimeSettings,
  testAuthProfile,
  updateAiSeatLauncher,
} from '../api'

function createAiRuntimePayload() {
  return {
    settings: {
      providers: [
        {
          providerId: 'openai',
          displayName: 'OpenAI Default',
          defaultModel: 'gpt-5',
          defaultProfileId: 'profile-openai',
          preferredSource: null,
        },
        {
          providerId: 'anthropic',
          displayName: null,
          defaultModel: 'claude-sonnet-4.5',
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'codex',
          displayName: null,
          defaultModel: 'codex-mini-latest',
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'claude_code',
          displayName: null,
          defaultModel: 'claude-code-max',
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'gemini',
          displayName: null,
          defaultModel: 'gemini-2.5-pro',
          defaultProfileId: null,
          preferredSource: 'api',
        },
      ],
    },
    providers: [
      {
        id: 'openai',
        label: 'OpenAI',
        kind: 'api',
        available: true,
        status: 'ready',
        authProviders: ['openai'],
        models: [
          {
            id: 'gpt-5',
            label: 'GPT-5',
            provider: 'openai',
            supportsTemperature: true,
          },
        ],
      },
      {
        id: 'codex-cli',
        label: 'Codex CLI',
        kind: 'cli',
        available: false,
        status: 'missing',
        authProviders: [],
        models: [
          {
            id: 'codex-mini-latest',
            label: 'Codex Mini',
            provider: 'codex-cli',
            supportsTemperature: false,
          },
        ],
      },
      {
        id: 'claude-code',
        label: 'Claude Code',
        kind: 'cli',
        available: true,
        status: 'ready',
        authProviders: [],
        models: [
          {
            id: 'claude-code-sonnet',
            label: 'Claude Code Sonnet',
            provider: 'claude-code',
            supportsTemperature: false,
          },
        ],
      },
    ],
    profiles: [
      {
        id: 'profile-openai',
        name: 'Primary OpenAI',
        provider: 'openai',
        source: 'manual',
        health: 'healthy',
        enabled: true,
        credentialType: 'api_key',
        maskedValue: 'sk-a...1234',
      },
    ],
  }
}

describe('App', () => {
  beforeEach(() => {
    emitSessionUpdate = null
    closeStream.mockClear()
    vi.clearAllMocks()
    vi.mocked(getAiRuntimeSettings).mockResolvedValue(createAiRuntimePayload())
    vi.mocked(saveAiRuntimeSettings).mockImplementation(async (settings) => settings)
    resetLanguagePreferenceForTests()
    resetBootstrapCacheForTests()
  })

  it('prefers chess when bootstrapping a new default session', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'xiangqi',
        title: 'Chinese Chess',
        shortName: 'Xiangqi',
        description: 'Chinese chess session.',
        sides: ['red', 'black'],
      },
      {
        id: 'chess',
        title: 'Chess',
        shortName: 'Chess',
        description: 'Chess session.',
        sides: ['white', 'black'],
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([])
    vi.mocked(createSession).mockResolvedValue({
      id: 'session-chess-default',
      gameId: 'chess',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:00:00.000Z',
      aiSeats: {
        white: {
          side: 'white',
          launcher: 'human',
          enabled: false,
          autoPlay: false,
          model: '',
          providerProfileId: '',
          promptOverride: null,
          timeoutMs: 60000,
          status: 'idle',
          lastError: null,
          runtimeSource: null,
        },
        black: {
          side: 'black',
          launcher: 'human',
          enabled: false,
          autoPlay: false,
          model: '',
          providerProfileId: '',
          promptOverride: null,
          timeoutMs: 60000,
          status: 'idle',
          lastError: null,
          runtimeSource: null,
        },
      },
      events: [],
      state: {
        kind: 'chess',
        turn: 'white',
        status: 'active',
        winner: null,
        isCheck: false,
        lastMove: null,
        board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith({ gameId: 'chess' })
      expect(screen.getByText('Turn: white')).toBeInTheDocument()
    })
  })

  it('defaults the create-session dialog to chess when it is available', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'xiangqi',
        title: 'Chinese Chess',
        shortName: 'Xiangqi',
        description: 'Chinese chess session.',
        sides: ['red', 'black'],
      },
      {
        id: 'chess',
        title: 'Chess',
        shortName: 'Chess',
        description: 'Chess session.',
        sides: ['white', 'black'],
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([])
    vi.mocked(createSession).mockResolvedValue({
      id: 'session-chess-default',
      gameId: 'chess',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:00:00.000Z',
      aiSeats: {
        white: {
          side: 'white',
          launcher: 'human',
          enabled: false,
          autoPlay: false,
          model: '',
          providerProfileId: '',
          promptOverride: null,
          timeoutMs: 60000,
          status: 'idle',
          lastError: null,
          runtimeSource: null,
        },
        black: {
          side: 'black',
          launcher: 'human',
          enabled: false,
          autoPlay: false,
          model: '',
          providerProfileId: '',
          promptOverride: null,
          timeoutMs: 60000,
          status: 'idle',
          lastError: null,
          runtimeSource: null,
        },
      },
      events: [],
      state: {
        kind: 'chess',
        turn: 'white',
        status: 'active',
        winner: null,
        isCheck: false,
        lastMove: null,
        board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Session' })).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Create Session' }).click()
    })

    const dialog = screen.getByRole('dialog', { name: 'Create Session' })
    expect(within(dialog).getByRole('combobox', { name: 'Game' })).toHaveValue('chess')
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
      expect(screen.getByRole('combobox', { name: 'Session' })).toHaveValue('session-gmk-1')
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    })
  })

  it('boots into the most recently updated session and lets the user switch sessions', async () => {
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
        id: 'session-gmk-old',
        gameId: 'gomoku',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        events: [],
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
      {
        id: 'session-gmk-new',
        gameId: 'gomoku',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:05:00.000Z',
        events: [],
        state: {
          kind: 'gomoku',
          turn: 'white',
          status: 'active',
          winner: null,
          lastMove: {
            point: 'h8',
            side: 'black',
            stone: { side: 'black', display: '●' },
            notation: 'h8',
          },
          moveCount: 1,
          winningLine: null,
          board: Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null)),
        },
      },
    ])
    vi.mocked(getSession).mockResolvedValue({
      id: 'session-gmk-old',
      gameId: 'gomoku',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:06:00.000Z',
      events: [],
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
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Turn: white')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Session' })).toHaveValue('session-gmk-new')
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Session' }), {
      target: { value: 'session-gmk-old' },
    })

    await waitFor(() => {
      expect(getSession).toHaveBeenCalledWith('session-gmk-old')
      expect(screen.getByText('Turn: black')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Session' })).toHaveValue('session-gmk-old')
    })
  })

  it('moves refresh and reset controls into the header toolbar', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'gomoku',
        title: 'Gomoku',
        shortName: 'Gomoku',
        description: 'A 15x15 connection game where players race to make five in a row.',
      },
    ])
    const sessionList = [
      {
        id: 'session-gmk-2',
        gameId: 'gomoku',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        events: [],
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
    ]
    vi.mocked(listSessions)
      .mockResolvedValueOnce(sessionList)
      .mockResolvedValueOnce(sessionList)
    vi.mocked(getSession).mockResolvedValue({
      id: 'session-gmk-2',
      gameId: 'gomoku',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:01:00.000Z',
      events: [],
      state: {
        kind: 'gomoku',
        turn: 'white',
        status: 'active',
        winner: null,
        lastMove: {
          point: 'h8',
          side: 'black',
          stone: { side: 'black', display: '●' },
          notation: 'h8',
        },
        moveCount: 1,
        winningLine: null,
        board: Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null)),
      },
    })
    vi.mocked(resetSession).mockResolvedValue({
      id: 'session-gmk-2',
      gameId: 'gomoku',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:02:00.000Z',
      events: [],
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
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    })

    const heroPanel = document.querySelector('.hero-panel')
    const heroToolbar = document.querySelector('.hero-toolbar')
    const primaryRow = document.querySelector('.toolbar-row-primary')
    const sessionRow = document.querySelector('.toolbar-row-session')
    const toolbarActions = document.querySelector('.toolbar-row-actions')

    expect(heroPanel).not.toBeNull()
    expect(heroToolbar).not.toBeNull()
    expect(heroPanel?.contains(heroToolbar ?? null)).toBe(true)
    expect(primaryRow?.querySelector('select')).not.toBeNull()
    expect(primaryRow?.querySelectorAll('select')).toHaveLength(2)
    expect(primaryRow?.querySelector('.primary-button')).toBeNull()
    expect(sessionRow?.querySelector('select')).not.toBeNull()
    expect(sessionRow?.querySelector('.primary-button')).not.toBeNull()
    expect(toolbarActions?.querySelectorAll('button')).toHaveLength(3)

    await act(async () => {
      screen.getByRole('button', { name: 'Refresh' }).click()
    })

    expect(getSession).toHaveBeenCalledWith('session-gmk-2')

    await act(async () => {
      screen.getByRole('button', { name: 'Reset' }).click()
    })

    await waitFor(() => {
      expect(resetSession).toHaveBeenCalledWith('session-gmk-2')
      expect(screen.getByText('Turn: black')).toBeInTheDocument()
    })
  })

  it('switches the interface to Chinese from the header language selector', async () => {
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
        id: 'session-gmk-zh',
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
      expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
      expect(screen.getByText('Game: Gomoku')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'zh-CN' },
    })

    await waitFor(() => {
      expect(screen.getByText('供人类与智能体共享的棋盘对局')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '创建对局' })).toBeInTheDocument()
      expect(screen.getByText('游戏: 五子棋')).toBeInTheDocument()
      expect(screen.getByText('当前行棋: 黑方')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '消息流' })).toBeInTheDocument()
      expect(screen.getByText('已创建新的 五子棋 对局。')).toBeInTheDocument()
    })
  })

  it('does not open a game-over dialog when booting into an older finished session', async () => {
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
        id: 'session-gmk-finished',
        gameId: 'gomoku',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:05:00.000Z',
        events: [],
        state: {
          kind: 'gomoku',
          turn: 'white',
          status: 'finished',
          winner: 'black',
          lastMove: {
            point: 'l8',
            side: 'black',
            stone: { side: 'black', display: '●' },
            notation: 'l8',
          },
          moveCount: 9,
          winningLine: ['h8', 'i8', 'j8', 'k8', 'l8'],
          board: Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null)),
        },
      },
    ])
    vi.mocked(resetSession).mockResolvedValue({
      id: 'session-gmk-finished',
      gameId: 'gomoku',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:06:00.000Z',
      events: [],
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
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Status: finished')).toBeInTheDocument()
      expect(screen.getByText('Winner: black')).toBeInTheDocument()
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(resetSession).not.toHaveBeenCalled()
  })

  it('shows a game-over dialog when the active session finishes and can restart it', async () => {
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
        id: 'session-gmk-live',
        gameId: 'gomoku',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:01:00.000Z',
        events: [],
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
    vi.mocked(resetSession).mockResolvedValue({
      id: 'session-gmk-live',
      gameId: 'gomoku',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:06:00.000Z',
      events: [],
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
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Status: active')).toBeInTheDocument()
    })

    act(() => {
      emitSessionUpdate?.({
        id: 'session-gmk-live',
        gameId: 'gomoku',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:05:00.000Z',
        events: [],
        state: {
          kind: 'gomoku',
          turn: 'white',
          status: 'finished',
          winner: 'black',
          lastMove: {
            point: 'l8',
            side: 'black',
            stone: { side: 'black', display: '●' },
            notation: 'l8',
          },
          moveCount: 9,
          winningLine: ['h8', 'i8', 'j8', 'k8', 'l8'],
          board: Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null)),
        },
      })
    })

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      expect(within(dialog).getByText('Game Over')).toBeInTheDocument()
      expect(within(dialog).getByText('Winner: black')).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Restart' }).click()
    })

    await waitFor(() => {
      expect(resetSession).toHaveBeenCalledWith('session-gmk-live')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Turn: black')).toBeInTheDocument()
    })
  })

  it('renders the AI settings dialog and compact players summary', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'chess',
        title: 'Chess',
        shortName: 'Chess',
        description: 'Chess session.',
        sides: ['white', 'black'],
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'openai',
            enabled: true,
            autoPlay: true,
            model: 'gpt-5',
            providerProfileId: 'profile-openai',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'waiting',
            lastError: null,
            runtimeSource: 'restflow-bridge',
          },
          black: {
            side: 'black',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'white',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('AI Seats')).not.toBeInTheDocument()
      expect(screen.getByText('Edit Players')).toBeInTheDocument()
      expect(screen.getByText('white')).toBeInTheDocument()
      expect(screen.getByText('OpenAI API')).toBeInTheDocument()
      expect(screen.getByText('waiting')).toBeInTheDocument()
      expect(screen.getByLabelText('Players')).toBeInTheDocument()
    })

    expect(screen.getByText('waiting').closest('.toolbar-player-chip')).toHaveClass('is-waiting')

    await act(async () => {
      screen.getByRole('button', { name: 'AI Settings' }).click()
    })

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      const openAiCard = within(dialog).getByText('OpenAI').closest('.ai-settings-provider-card')
      const codexCard = within(dialog).getByText('Codex').closest('.ai-settings-provider-card')
      expect(openAiCard).not.toBeNull()
      expect(codexCard).not.toBeNull()
      expect(within(openAiCard as HTMLElement).getByDisplayValue('OpenAI Default')).toBeInTheDocument()
      expect(within(openAiCard as HTMLElement).getByRole('combobox', { name: 'Default Model' })).toHaveValue('gpt-5')
      expect(within(openAiCard as HTMLElement).getByText('Credential: sk-a...1234')).toBeInTheDocument()
      expect(within(codexCard as HTMLElement).queryByText('Profile Name')).not.toBeInTheDocument()
      expect(
        within(codexCard as HTMLElement).getByText(
          'This launcher uses local CLI availability and does not require an API key here.',
        ),
      ).toBeInTheDocument()
    })
  })

  it('creates a session with launcher selections from the create dialog', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'chess',
        title: 'Chess',
        shortName: 'Chess',
        description: 'Chess session.',
        sides: ['white', 'black'],
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'white',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      },
    ])
    vi.mocked(createSession).mockResolvedValue({
      id: 'session-chess-created',
      gameId: 'chess',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:01:00.000Z',
      aiSeats: {
        white: {
          side: 'white',
          launcher: 'human',
          enabled: false,
          autoPlay: false,
          model: '',
          providerProfileId: '',
          promptOverride: null,
          timeoutMs: 60000,
          status: 'idle',
          lastError: null,
          runtimeSource: null,
        },
        black: {
          side: 'black',
          launcher: 'codex',
          enabled: true,
          autoPlay: true,
          model: 'codex-mini-latest',
          providerProfileId: '',
          promptOverride: null,
          timeoutMs: 60000,
          status: 'waiting',
          lastError: null,
          runtimeSource: 'restflow-bridge',
        },
      },
      events: [],
      state: {
        kind: 'chess',
        turn: 'white',
        status: 'active',
        winner: null,
        isCheck: false,
        lastMove: null,
        board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
      },
    })
    vi.mocked(listSessions).mockResolvedValueOnce([
      {
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:02:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'white',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      },
      {
        id: 'session-chess-created',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:01:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'codex',
            enabled: true,
            autoPlay: true,
            model: 'codex-mini-latest',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'waiting',
            lastError: null,
            runtimeSource: 'restflow-bridge',
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'white',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Session' })).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Create Session' }).click()
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Launcher black' }), {
      target: { value: 'codex' },
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Create' }).click()
    })

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith({
        gameId: 'chess',
        seatLaunchers: {
          white: { launcher: 'human' },
          black: {
            launcher: 'codex',
            model: 'codex-mini-latest',
            autoPlay: true,
          },
        },
      })
      expect(screen.getByRole('button', { name: 'Edit Players' })).toBeInTheDocument()
    })
  })

  it('shows AI thinking activity and allows restarting an errored AI seat from the toolbar', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'chess',
        title: 'Chess',
        shortName: 'Chess',
        description: 'Chess session.',
        sides: ['white', 'black'],
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'codex',
            enabled: true,
            autoPlay: true,
            model: 'codex-mini-latest',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'thinking',
            lastError: null,
            runtimeSource: 'restflow-bridge',
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'black',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      },
    ])

    render(<App />)

    await waitFor(() => {
      const messageFeedCard = screen.getByRole('heading', { name: 'Message Feed' }).closest('.panel-card')
      expect(messageFeedCard).not.toBeNull()
      const pendingMessage = within(messageFeedCard as HTMLElement)
        .getByText('black · Codex CLI is thinking…')
        .closest('.message-feed-item-pending')
      expect(pendingMessage).not.toBeNull()
      const toolbar = screen.getByRole('toolbar', { name: 'Session controls' })
      expect(within(toolbar).getByText('thinking').closest('.toolbar-player-chip')).toHaveClass('is-thinking')
    })

    act(() => {
      emitSessionUpdate?.({
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:02:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'codex',
            enabled: true,
            autoPlay: true,
            model: 'codex-mini-latest',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'errored',
            lastError: 'The AI response could not be turned into a valid move.',
            runtimeSource: 'restflow-bridge',
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'black',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      })
    })

    vi.mocked(updateAiSeatLauncher).mockResolvedValue({
      id: 'session-chess-ai',
      gameId: 'chess',
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:03:00.000Z',
      aiSeats: {
        white: {
          side: 'white',
          launcher: 'human',
          enabled: false,
          autoPlay: false,
          model: '',
          providerProfileId: '',
          promptOverride: null,
          timeoutMs: 60000,
          status: 'idle',
          lastError: null,
          runtimeSource: null,
        },
        black: {
          side: 'black',
          launcher: 'codex',
          enabled: true,
          autoPlay: true,
          model: 'codex-mini-latest',
          providerProfileId: '',
          promptOverride: null,
          timeoutMs: 60000,
          status: 'waiting',
          lastError: null,
          runtimeSource: 'restflow-bridge',
        },
      },
      events: [],
      state: {
        kind: 'chess',
        turn: 'white',
        status: 'active',
        winner: null,
        isCheck: false,
        lastMove: null,
        board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Restart AI' })).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Restart AI' }).click()
    })

    expect(updateAiSeatLauncher).toHaveBeenCalledWith('session-chess-ai', 'black', {
      launcher: 'codex',
      model: 'codex-mini-latest',
      autoPlay: true,
    })
  })

  it('edits players through the compact edit dialog', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'chess',
        title: 'Chess',
        shortName: 'Chess',
        description: 'Chess session.',
        sides: ['white', 'black'],
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'white',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      },
    ])
    vi.mocked(updateAiSeatLauncher)
      .mockResolvedValueOnce({
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:01:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'codex',
            enabled: true,
            autoPlay: true,
            model: 'codex-mini-latest',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'waiting',
            lastError: null,
            runtimeSource: 'restflow-bridge',
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'white',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      })
      .mockResolvedValueOnce({
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:02:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'codex',
            enabled: true,
            autoPlay: true,
            model: 'codex-mini-latest',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'waiting',
            lastError: null,
            runtimeSource: 'restflow-bridge',
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'white',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit Players' })).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Edit Players' }).click()
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Launcher black' }), {
      target: { value: 'openai' },
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Launcher black' }), {
      target: { value: 'codex' },
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Save Players' }).click()
    })

    await waitFor(() => {
      expect(updateAiSeatLauncher).toHaveBeenNthCalledWith(1, 'session-chess-ai', 'white', {
        launcher: 'human',
        model: undefined,
        autoPlay: undefined,
      })
      expect(updateAiSeatLauncher).toHaveBeenNthCalledWith(2, 'session-chess-ai', 'black', {
        launcher: 'codex',
        model: 'codex-mini-latest',
        autoPlay: true,
      })
      expect(screen.queryByRole('dialog', { name: 'Edit Players' })).not.toBeInTheDocument()
    })
  })

  it('opens AI settings when create session hits config_missing', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'chess',
        title: 'Chess',
        shortName: 'Chess',
        description: 'Chess session.',
        sides: ['white', 'black'],
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'white',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      },
    ])
    vi.mocked(createSession).mockRejectedValue(
      new RequestError('OpenAI is not configured yet', 'config_missing', {
        providerId: 'openai',
      }),
    )

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Session' })).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Create Session' }).click()
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Launcher black' }), {
      target: { value: 'openai' },
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Create' }).click()
    })

    await waitFor(() => {
      expect(screen.getByText('OpenAI is not configured yet')).toBeInTheDocument()
      expect(document.querySelector('.ai-settings-provider-card-focused strong')?.textContent).toBe(
        'OpenAI',
      )
    })
  })

  it('shows visible feedback after testing and saving provider settings', async () => {
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'chess',
        title: 'Chess',
        shortName: 'Chess',
        description: 'Chess session.',
        sides: ['white', 'black'],
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'white',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      },
    ])
    vi.mocked(testAuthProfile).mockResolvedValue({ id: 'profile-openai', available: true })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AI Settings' })).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'AI Settings' }).click()
    })

    const dialog = await screen.findByRole('dialog')
    const openAiCard = within(dialog).getByText('OpenAI').closest('.ai-settings-provider-card')
    const codexCard = within(dialog).getByText('Codex').closest('.ai-settings-provider-card')
    expect(openAiCard).not.toBeNull()
    expect(codexCard).not.toBeNull()

    await act(async () => {
      within(openAiCard as HTMLElement).getByRole('button', { name: 'Test' }).click()
    })

    await waitFor(() => {
      expect(screen.getByText('OpenAI API is ready.')).toBeInTheDocument()
    })

    await act(async () => {
      within(codexCard as HTMLElement).getByRole('button', { name: 'Save Settings' }).click()
    })

    await waitFor(() => {
      expect(screen.getByText('Saved settings for Codex CLI.')).toBeInTheDocument()
    })
  })

  it('shows a clear Claude Code login warning when the CLI is installed but not signed in', async () => {
    vi.mocked(getAiRuntimeSettings).mockResolvedValue({
      ...createAiRuntimePayload(),
      providers: createAiRuntimePayload().providers.map((provider) =>
        provider.id === 'claude-code'
          ? {
              ...provider,
              available: false,
              status: 'not_logged_in',
            }
          : provider,
      ),
    })
    vi.mocked(listGames).mockResolvedValue([
      {
        id: 'chess',
        title: 'Chess',
        shortName: 'Chess',
        description: 'Chess session.',
        sides: ['white', 'black'],
      },
    ])
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-chess-ai',
        gameId: 'chess',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z',
        aiSeats: {
          white: {
            side: 'white',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
          black: {
            side: 'black',
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            model: '',
            providerProfileId: '',
            promptOverride: null,
            timeoutMs: 60000,
            status: 'idle',
            lastError: null,
            runtimeSource: null,
          },
        },
        events: [],
        state: {
          kind: 'chess',
          turn: 'white',
          status: 'active',
          winner: null,
          isCheck: false,
          lastMove: null,
          board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
        },
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AI Settings' })).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'AI Settings' }).click()
    })

    const dialog = await screen.findByRole('dialog')
    const claudeCard = within(dialog).getByText('Claude Code').closest('.ai-settings-provider-card')
    expect(claudeCard).not.toBeNull()
    expect(within(claudeCard as HTMLElement).getByText('not signed in')).toBeInTheDocument()

    await act(async () => {
      within(claudeCard as HTMLElement).getByRole('button', { name: 'Test' }).click()
    })

    await waitFor(() => {
      expect(
        screen.getByText('Claude Code is installed, but you are not signed in yet.'),
      ).toBeInTheDocument()
    })
  })
})
