import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  AuthProfileSummary,
  CreateAuthProfileInput,
  ProviderCapability,
  UpdateAuthProfileInput,
} from '@human-agent-playground/core'
import { describe, expect, it } from 'vitest'

import type { AiRuntimeClient, DecideTurnInput, DecideTurnResult } from '../ai-runtime-client.js'
import { GameService, GameServiceError } from '../game-service.js'

interface MockAiRuntimeClientOptions {
  providers?: ProviderCapability[]
  profiles?: AuthProfileSummary[]
}

class MockAiRuntimeClient implements AiRuntimeClient {
  private readonly providers: ProviderCapability[]
  private readonly profiles: AuthProfileSummary[]

  constructor(
    private readonly decide: (input: DecideTurnInput) => Promise<DecideTurnResult>,
    options: MockAiRuntimeClientOptions = {},
  ) {
    this.providers = options.providers ?? []
    this.profiles = options.profiles ?? []
  }

  async listProviders(): Promise<ProviderCapability[]> {
    return this.providers
  }

  async listAuthProfiles(): Promise<AuthProfileSummary[]> {
    return this.profiles
  }

  async createAuthProfile(
    _input: CreateAuthProfileInput,
  ): Promise<{ id: string; created: true }> {
    return { id: 'mock-profile', created: true }
  }

  async updateAuthProfile(
    profileId: string,
    _input: UpdateAuthProfileInput,
  ): Promise<{ id: string; name: string; enabled: boolean; priority: number }> {
    return { id: profileId, name: 'Updated', enabled: true, priority: 0 }
  }

  async deleteAuthProfile(profileId: string): Promise<{ deleted: true; id: string }> {
    return { deleted: true, id: profileId }
  }

  async testAuthProfile(profileId: string): Promise<{ id: string; available: boolean }> {
    return { id: profileId, available: true }
  }

  decideTurn(input: DecideTurnInput): Promise<DecideTurnResult> {
    return this.decide(input)
  }
}

async function waitFor<T>(load: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    const value = await load()
    if (predicate(value)) {
      return value
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  throw new Error('Timed out waiting for async condition')
}

describe('GameService', () => {
  it('creates sessions and plays legal moves', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    const session = await service.createSession({ gameId: 'xiangqi' })
    expect(session.state.turn).toBe('red')
    expect(session.events).toHaveLength(1)
    expect(session.events[0].kind).toBe('session_created')

    const moves = await service.getLegalMoves(session.id, 'h3')
    expect(moves.some((move) => move.to === 'h9')).toBe(false)

    const updated = await service.playMove(session.id, { from: 'h3', to: 'h9' }).catch((error) => error)
    expect(updated).toBeInstanceOf(Error)
  })

  it('persists sessions to disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const dataPath = join(directory, 'sessions.json')

    const service = new GameService(dataPath)
    const session = await service.createSession({ gameId: 'xiangqi' })
    await service.playMove(session.id, { from: 'h3', to: 'h9' }).catch(() => null)

    const reloaded = new GameService(dataPath)
    const sessions = await reloaded.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(session.id)
  })

  it('lists the game catalog and rejects unsupported games', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    const games = await service.listGames()
    expect(games.map((game) => game.id)).toContain('xiangqi')
    expect(games.map((game) => game.id)).toContain('chess')
    expect(games.map((game) => game.id)).toContain('gomoku')
    expect(games.map((game) => game.id)).toContain('connect-four')
    expect(games.map((game) => game.id)).toContain('othello')

    const error = await service.createSession({ gameId: 'go' }).catch((value) => value)
    expect(error).toBeInstanceOf(Error)
  })

  it('supports Gomoku session creation, stone placement, and win detection', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    let session = await service.createSession({ gameId: 'gomoku' })
    expect(session.state.turn).toBe('black')

    for (const point of ['h8', 'a1', 'i8', 'b1', 'j8', 'c1', 'k8', 'd1', 'l8'] as const) {
      session = await service.playMove(session.id, { point })
    }

    expect(session.state.status).toBe('finished')
    expect(session.state.winner).toBe('black')
    expect(session.state.lastMove).toEqual(
      expect.objectContaining({
        point: 'l8',
        side: 'black',
      }),
    )
    expect(session.state.winningLine).toEqual(['h8', 'i8', 'j8', 'k8', 'l8'])
    expect(session.events.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'move_played',
        details: expect.objectContaining({
          point: 'l8',
          stoneDisplay: '●',
        }),
      }),
    )
  })

  it('supports Chess session creation, legal moves, and checkmate detection', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    let session = await service.createSession({ gameId: 'chess' })
    expect(session.state.turn).toBe('white')

    const legalMoves = await service.getLegalMoves(session.id, { from: 'e2' })
    expect(legalMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'e2', to: 'e3' }),
        expect.objectContaining({ from: 'e2', to: 'e4' }),
      ]),
    )

    session = await service.playMove(session.id, { from: 'f2', to: 'f3' })
    session = await service.playMove(session.id, { from: 'e7', to: 'e5' })
    session = await service.playMove(session.id, { from: 'g2', to: 'g4' })
    session = await service.playMove(session.id, { from: 'd8', to: 'h4' })

    expect(session.state.status).toBe('finished')
    expect(session.state.winner).toBe('black')
    expect(session.state.isCheck).toBe(true)
    expect(session.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'd8',
        to: 'h4',
        side: 'black',
        san: 'Qh4#',
      }),
    )
    expect(session.events.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'move_played',
        details: expect.objectContaining({
          from: 'd8',
          to: 'h4',
          san: 'Qh4#',
          pieceDisplay: '♛',
        }),
      }),
    )
  })

  it('supports Connect Four session creation, disc drops, and win detection', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    let session = await service.createSession({ gameId: 'connect-four' })
    expect(session.state.turn).toBe('red')

    for (const column of [1, 1, 2, 2, 3, 3, 4] as const) {
      session = await service.playMove(session.id, { column })
    }

    expect(session.state.status).toBe('finished')
    expect(session.state.winner).toBe('red')
    expect(session.state.lastMove).toEqual(
      expect.objectContaining({
        point: 'd1',
        side: 'red',
      }),
    )
    expect(session.state.winningLine).toEqual(['a1', 'b1', 'c1', 'd1'])
    expect(session.events.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'move_played',
        details: expect.objectContaining({
          column: 4,
          point: 'd1',
        }),
      }),
    )
  })

  it('supports Othello session creation, flips, and score tracking', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    const session = await service.createSession({ gameId: 'othello' })
    const updated = await service.playMove(session.id, { point: 'd3' })

    expect(updated.state.turn).toBe('white')
    expect(updated.state.blackCount).toBe(4)
    expect(updated.state.whiteCount).toBe(1)
    expect(updated.state.lastMove).toEqual(
      expect.objectContaining({
        point: 'd3',
        side: 'black',
        flippedPoints: ['d4'],
      }),
    )
    expect(updated.events.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'move_played',
        details: expect.objectContaining({
          point: 'd3',
          flippedPoints: ['d4'],
          side: 'black',
        }),
      }),
    )
  })

  it('notifies session subscribers when a move lands', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })
    const events: Array<{ updatedAt: string; lastMove: string | null }> = []

    const unsubscribe = service.subscribeSession(session.id, (updatedSession) => {
      const state = updatedSession.state as { lastMove?: { from: string; to: string } | null }
      events.push({
        updatedAt: updatedSession.updatedAt,
        lastMove: state.lastMove ? `${state.lastMove.from}-${state.lastMove.to}` : null,
      })
    })

    await service.playMove(session.id, { from: 'a4', to: 'a5' })
    unsubscribe()

    expect(events).toHaveLength(1)
    expect(events[0].lastMove).toBe('a4-a5')
  })

  it('records reasoning summaries in the session timeline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })

    const updated = await service.playMove(session.id, {
      from: 'a4',
      to: 'a5',
      actorKind: 'agent',
      channel: 'mcp',
      reasoning: {
        summary: 'Advance the pawn to contest the file and gain space.',
        reasoningSteps: [
          'Compared the center advance with horse development.',
          'Preferred immediate space gain on the open file.',
        ],
        consideredAlternatives: [
          {
            action: 'b1 -> c3',
            summary: 'Develop the horse first.',
            rejectedBecause: 'It delayed immediate file pressure.',
          },
        ],
        confidence: 0.74,
      },
    })

    expect(updated.events).toHaveLength(2)
    expect(updated.events[1]).toEqual(
      expect.objectContaining({
        kind: 'move_played',
        actorKind: 'agent',
        channel: 'mcp',
        reasoning: expect.objectContaining({
          summary: 'Advance the pawn to contest the file and gain space.',
          confidence: 0.74,
        }),
      }),
    )
  })

  it('requires fresh reasoning on agent MCP moves', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })

    const missingReasoningError = await service
      .playMove(session.id, {
        from: 'a4',
        to: 'a5',
        actorKind: 'agent',
        channel: 'mcp',
      })
      .catch((error) => error)

    expect(missingReasoningError).toBeInstanceOf(Error)
    expect(missingReasoningError.message).toContain('reasoning summary')

    const missingStepsError = await service
      .playMove(session.id, {
        from: 'a4',
        to: 'a5',
        actorKind: 'agent',
        channel: 'mcp',
        reasoning: {
          summary: 'Advance the pawn.',
          reasoningSteps: [],
        },
      })
      .catch((error) => error)

    expect(missingStepsError).toBeInstanceOf(Error)
    expect(missingStepsError.message).toContain('reasoning step')
  })

  it('waits until the expected turn arrives without polling outside the service', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })
    const lastEventId = session.events.at(-1)?.id

    const waitPromise = service.waitForTurn(session.id, 'black', {
      afterEventId: lastEventId,
      timeoutMs: 5_000,
    })

    setTimeout(() => {
      void service.playMove(session.id, { from: 'a4', to: 'a5' })
    }, 20)

    const result = await waitPromise

    expect(result.status).toBe('ready')
    expect(result.session.state.turn).toBe('black')
    expect(result.event).toEqual(
      expect.objectContaining({
        kind: 'move_played',
      }),
    )
  })

  it('plays one move and then waits until the same side can move again', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })

    const playAndWaitPromise = service.playMoveAndWait(
      session.id,
      {
        from: 'a4',
        to: 'a5',
      },
      {
        timeoutMs: 5_000,
      },
    )

    setTimeout(() => {
      void service.playMove(session.id, { from: 'a7', to: 'a6' })
    }, 20)

    const result = await playAndWaitPromise

    expect(result.status).toBe('ready')
    expect(result.playedSession.state.turn).toBe('black')
    expect(result.playedSession.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'a4',
        to: 'a5',
        side: 'red',
      }),
    )
    expect(result.playedEvent).toEqual(
      expect.objectContaining({
        kind: 'move_played',
      }),
    )
    expect(result.session.state.turn).toBe('red')
    expect(result.session.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'a7',
        to: 'a6',
        side: 'black',
      }),
    )
    expect(result.event).toEqual(
      expect.objectContaining({
        kind: 'move_played',
      }),
    )
  })

  it('stores AI seat configuration and auto-plays the active side through the bridge', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const aiRuntimeClient = new MockAiRuntimeClient(async (input) => {
      expect(input.gameId).toBe('gomoku')
      expect(input.seatSide).toBe('black')
      return {
        action: { point: 'h8' },
        reasoning: {
          summary: 'Open near the center to maximize future connections.',
          reasoningSteps: ['The center is the highest-value opening point in Gomoku.'],
          consideredAlternatives: [],
          confidence: 0.66,
        },
        usage: null,
        model: 'gpt-5',
        provider: 'openai',
        error: null,
      }
    })
    const service = new GameService(join(directory, 'sessions.json'), aiRuntimeClient)

    const session = await service.createSession({ gameId: 'gomoku' })
    const configured = await service.updateAiSeat(session.id, 'black', {
      enabled: true,
      autoPlay: true,
      model: 'gpt-5',
      timeoutMs: 30_000,
    })

    expect(configured.aiSeats?.black).toEqual(
      expect.objectContaining({
        enabled: true,
        model: 'gpt-5',
      }),
    )

    const resolved = await waitFor(
      () => service.getSession(session.id),
      (candidate) => candidate.events.length >= 2,
    )

    expect(resolved.state.lastMove).toEqual(
      expect.objectContaining({
        point: 'h8',
        side: 'black',
      }),
    )
    expect(resolved.aiSeats?.black).toEqual(
      expect.objectContaining({
        status: 'waiting',
        runtimeSource: 'restflow-bridge',
      }),
    )
    expect(resolved.events.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'move_played',
        actorName: 'restflow-bridge',
        details: expect.objectContaining({
          provider: 'openai',
          model: 'gpt-5',
          runtimeSource: 'restflow-bridge',
          seatSide: 'black',
        }),
      }),
    )
  })

  it('normalizes nullable runtime action fields before playing an AI Chess move', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const aiRuntimeClient = new MockAiRuntimeClient(async () => ({
      action: {
        from: 'e7',
        to: 'e5',
        side: 'black',
        piece: 'pawn',
        san: 'e5',
        notation: 'e7e5',
        flags: 'b',
        captured: null,
        promotion: null,
      },
      reasoning: {
        summary: 'Advance the king pawn to mirror white and claim the center.',
        reasoningSteps: ['The returned action intentionally includes nullable legal-move fields.'],
        consideredAlternatives: [],
        confidence: 0.48,
      },
      usage: null,
      model: 'gpt-5',
      provider: 'openai',
      error: null,
    }))
    const service = new GameService(join(directory, 'sessions.json'), aiRuntimeClient)

    const session = await service.createSession({ gameId: 'chess' })
    await service.updateAiSeat(session.id, 'black', {
      enabled: true,
      autoPlay: true,
      model: 'gpt-5',
      timeoutMs: 30_000,
    })

    await service.playMove(session.id, { from: 'e2', to: 'e4' })

    const resolved = await waitFor(
      () => service.getSession(session.id),
      (candidate) => candidate.events.length >= 3,
    )

    expect(resolved.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'e7',
        to: 'e5',
        side: 'black',
      }),
    )
    expect(resolved.aiSeats?.black).toEqual(
      expect.objectContaining({
        status: 'waiting',
        runtimeSource: 'restflow-bridge',
      }),
    )
  })

  it('persists runtime settings and returns them with provider and profile catalogs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const providers: ProviderCapability[] = [
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
    ]
    const profiles: AuthProfileSummary[] = [
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
    ]
    const aiRuntimeClient = new MockAiRuntimeClient(async () => ({
      action: null,
      reasoning: null,
      usage: null,
      model: null,
      provider: null,
      error: 'no-op',
    }), {
      providers,
      profiles,
    })
    const dataPath = join(directory, 'sessions.json')
    const service = new GameService(dataPath, aiRuntimeClient)

    await service.updateAiRuntimeSettings({
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
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'codex',
          displayName: null,
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'claude_code',
          displayName: null,
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'gemini',
          displayName: null,
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: 'api',
        },
      ],
    })

    const payload = await service.getAiRuntimeSettings()
    expect(payload.settings.providers.find((provider) => provider.providerId === 'openai')).toEqual(
      expect.objectContaining({
        displayName: 'OpenAI Default',
        defaultModel: 'gpt-5',
        defaultProfileId: 'profile-openai',
      }),
    )
    expect(payload.providers).toEqual(providers)
    expect(payload.profiles).toEqual(profiles)

    const reloaded = new GameService(dataPath, aiRuntimeClient)
    const reloadedPayload = await reloaded.getAiRuntimeSettings()
    expect(
      reloadedPayload.settings.providers.find((provider) => provider.providerId === 'openai'),
    ).toEqual(
      expect.objectContaining({
        displayName: 'OpenAI Default',
        defaultModel: 'gpt-5',
        defaultProfileId: 'profile-openai',
      }),
    )
  })

  it('maps launcher selections onto seat configuration and can disable a seat back to human', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const aiRuntimeClient = new MockAiRuntimeClient(async () => ({
      action: null,
      reasoning: null,
      usage: null,
      model: null,
      provider: null,
      error: 'no-op',
    }), {
      providers: [
        {
          id: 'codex-cli',
          label: 'Codex CLI',
          kind: 'cli',
          available: true,
          status: 'ready',
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
      ],
    })
    const service = new GameService(join(directory, 'sessions.json'), aiRuntimeClient)
    const session = await service.createSession({ gameId: 'chess' })

    const enabled = await service.updateAiSeatLauncher(session.id, 'black', {
      launcher: 'codex',
      model: 'codex-mini-latest',
    })
    expect(enabled.aiSeats?.black).toEqual(
      expect.objectContaining({
        launcher: 'codex',
        enabled: true,
        autoPlay: true,
        model: 'codex-mini-latest',
        runtimeSource: 'restflow-bridge',
      }),
    )

    const disabled = await service.updateAiSeatLauncher(session.id, 'black', {
      launcher: 'human',
    })
    expect(disabled.aiSeats?.black).toEqual(
      expect.objectContaining({
        launcher: 'human',
        enabled: false,
        autoPlay: false,
        status: 'idle',
        runtimeSource: null,
      }),
    )
  })

  it('applies seat launchers during session creation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const aiRuntimeClient = new MockAiRuntimeClient(async () => ({
      action: null,
      reasoning: null,
      usage: null,
      model: null,
      provider: null,
      error: 'no-op',
    }), {
      providers: [
        {
          id: 'codex-cli',
          label: 'Codex CLI',
          kind: 'cli',
          available: true,
          status: 'ready',
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
      ],
    })
    const service = new GameService(join(directory, 'sessions.json'), aiRuntimeClient)

    const session = await service.createSession({
      gameId: 'chess',
      seatLaunchers: {
        black: {
          launcher: 'codex',
        },
      },
    })

    expect(session.aiSeats?.white).toEqual(
      expect.objectContaining({
        launcher: 'human',
        enabled: false,
      }),
    )
    expect(session.aiSeats?.black).toEqual(
      expect.objectContaining({
        launcher: 'codex',
        enabled: true,
        autoPlay: true,
        model: 'codex-mini-latest',
        runtimeSource: 'restflow-bridge',
      }),
    )
  })

  it('auto-plays a launcher configured during session creation when the opening turn matches', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const aiRuntimeClient = new MockAiRuntimeClient(async () => ({
      action: { point: 'h8' },
      reasoning: {
        summary: 'Play the center-adjacent opening point.',
        reasoningSteps: ['The mocked bridge always returns h8.'],
        consideredAlternatives: [],
        confidence: 0.52,
      },
      usage: null,
      model: 'gpt-5',
      provider: 'openai',
      error: null,
    }), {
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
    })
    const service = new GameService(join(directory, 'sessions.json'), aiRuntimeClient)
    await service.updateAiRuntimeSettings({
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
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'codex',
          displayName: null,
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'claude_code',
          displayName: null,
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'gemini',
          displayName: null,
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: 'api',
        },
      ],
    })

    const session = await service.createSession({
      gameId: 'gomoku',
      seatLaunchers: {
        black: {
          launcher: 'openai',
        },
      },
    })

    const resolved = await waitFor(
      () => service.getSession(session.id),
      (candidate) => candidate.events.length >= 2,
    )
    expect(resolved.state.lastMove).toEqual(
      expect.objectContaining({
        point: 'h8',
        side: 'black',
      }),
    )
    expect(resolved.aiSeats?.black).toEqual(
      expect.objectContaining({
        launcher: 'openai',
        enabled: true,
        status: 'waiting',
      }),
    )
  })

  it('auto-plays a launcher-configured seat through the bridge when the turn is active', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const aiRuntimeClient = new MockAiRuntimeClient(async (input) => {
      expect(input.seatConfig.provider).toBe('openai')
      expect(input.seatConfig.providerProfileId).toBe('profile-openai')
      return {
        action: { point: 'h8' },
        reasoning: {
          summary: 'Take the center-adjacent opening point.',
          reasoningSteps: ['This is the first legal move returned by the bridge mock.'],
          consideredAlternatives: [],
          confidence: 0.58,
        },
        usage: null,
        model: 'gpt-5',
        provider: 'openai',
        error: null,
      }
    }, {
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
    })
    const service = new GameService(join(directory, 'sessions.json'), aiRuntimeClient)
    await service.updateAiRuntimeSettings({
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
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'codex',
          displayName: null,
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'claude_code',
          displayName: null,
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'gemini',
          displayName: null,
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: 'api',
        },
      ],
    })

    const session = await service.createSession({ gameId: 'gomoku' })
    const configured = await service.updateAiSeatLauncher(session.id, 'black', {
      launcher: 'openai',
    })
    expect(configured.aiSeats?.black).toEqual(
      expect.objectContaining({
        launcher: 'openai',
        enabled: true,
        model: 'gpt-5',
      }),
    )

    const resolved = await waitFor(
      () => service.getSession(session.id),
      (candidate) => candidate.events.length >= 2,
    )
    expect(resolved.state.lastMove).toEqual(
      expect.objectContaining({
        point: 'h8',
        side: 'black',
      }),
    )
    expect(resolved.aiSeats?.black).toEqual(
      expect.objectContaining({
        status: 'waiting',
        runtimeSource: 'restflow-bridge',
      }),
    )
  })

  it('returns structured launcher errors when the default profile is missing or a CLI is unavailable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const aiRuntimeClient = new MockAiRuntimeClient(async () => ({
      action: null,
      reasoning: null,
      usage: null,
      model: null,
      provider: null,
      error: 'no-op',
    }), {
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
      ],
    })
    const service = new GameService(join(directory, 'sessions.json'), aiRuntimeClient)
    await service.updateAiRuntimeSettings({
      providers: [
        {
          providerId: 'openai',
          displayName: 'OpenAI Default',
          defaultModel: 'gpt-5',
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'anthropic',
          displayName: null,
          defaultModel: null,
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
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: null,
        },
        {
          providerId: 'gemini',
          displayName: null,
          defaultModel: null,
          defaultProfileId: null,
          preferredSource: 'api',
        },
      ],
    })

    const session = await service.createSession({ gameId: 'chess' })

    const missingProfile = await service
      .updateAiSeatLauncher(session.id, 'black', {
        launcher: 'openai',
      })
      .catch((error) => error)
    expect(missingProfile).toBeInstanceOf(GameServiceError)
    expect((missingProfile as GameServiceError).code).toBe('config_missing')

    const missingCli = await service
      .updateAiSeatLauncher(session.id, 'black', {
        launcher: 'codex',
      })
      .catch((error) => error)
    expect(missingCli).toBeInstanceOf(GameServiceError)
    expect((missingCli as GameServiceError).code).toBe('cli_unavailable')
  })

  it('marks an AI seat as errored and records a system notice when the bridge returns an illegal move', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const aiRuntimeClient = new MockAiRuntimeClient(async () => ({
      action: { point: 'z99' },
      reasoning: {
        summary: 'Try an invalid coordinate.',
        reasoningSteps: ['This intentionally returns an illegal move for test coverage.'],
        consideredAlternatives: [],
        confidence: 0.1,
      },
      usage: null,
      model: 'gpt-5',
      provider: 'openai',
      error: null,
    }))
    const service = new GameService(join(directory, 'sessions.json'), aiRuntimeClient)

    const session = await service.createSession({ gameId: 'gomoku' })
    await service.updateAiSeat(session.id, 'black', {
      enabled: true,
      autoPlay: true,
      model: 'gpt-5',
      timeoutMs: 30_000,
    })

    const resolved = await waitFor(
      () => service.getSession(session.id),
      (candidate) => candidate.aiSeats?.black?.status === 'errored',
    )

    expect(resolved.aiSeats?.black).toEqual(
      expect.objectContaining({
        status: 'errored',
      }),
    )
    expect(resolved.events.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'system_notice',
        summary: expect.stringContaining('the model proposed an illegal action'),
      }),
    )
  })

  it('does not append duplicate system notices for the same repeated AI seat error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    const session = await service.createSession({ gameId: 'chess' })

    const once = await (service as unknown as {
      persistSeatError: (
        session: GameSession,
        side: string,
        failure: { code: string; userMessage: string; noticeSummary: string },
      ) => Promise<GameSession>
    }).persistSeatError(session, 'black', {
      code: 'decision_parse_failed',
      userMessage: 'The AI response could not be turned into a valid move.',
      noticeSummary: 'the model returned an unparseable action',
    })

    const twice = await (service as unknown as {
      persistSeatError: (
        session: GameSession,
        side: string,
        failure: { code: string; userMessage: string; noticeSummary: string },
      ) => Promise<GameSession>
    }).persistSeatError(once, 'black', {
      code: 'decision_parse_failed',
      userMessage: 'The AI response could not be turned into a valid move.',
      noticeSummary: 'the model returned an unparseable action',
    })

    const notices = twice.events.filter(
      (event) =>
        event.kind === 'system_notice' &&
        event.summary === 'AI seat black stopped: the model returned an unparseable action',
    )

    expect(notices).toHaveLength(1)
    expect(twice.aiSeats?.black).toEqual(
      expect.objectContaining({
        status: 'errored',
        lastError: 'The AI response could not be turned into a valid move.',
      }),
    )
  })

  it('maps structured bridge parse failures to friendly seat errors and can recover after restarting the launcher', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    let attempt = 0
    const aiRuntimeClient = new MockAiRuntimeClient(async () => {
      attempt += 1
      if (attempt === 1) {
        return {
          action: null,
          reasoning: null,
          usage: null,
          model: 'codex-mini-latest',
          provider: 'codex-cli',
          error: 'The model response could not be converted into a valid action.',
          errorCode: 'decision_parse_failed',
          rawResponsePreview: '{action: maybe}',
        }
      }

      return {
        action: { point: 'h8' },
        reasoning: {
          summary: 'Play the first legal point.',
          reasoningSteps: ['Recover after restarting the launcher.'],
          consideredAlternatives: [],
          confidence: 0.2,
        },
        usage: null,
        model: 'codex-mini-latest',
        provider: 'codex-cli',
        error: null,
      }
    }, {
      providers: [
        {
          id: 'codex-cli',
          label: 'Codex CLI',
          kind: 'cli',
          available: true,
          status: 'ready',
          authProviders: [],
          models: [
            {
              id: 'codex-mini-latest',
              label: 'Codex Mini Latest',
              provider: 'codex-cli',
              supportsTemperature: false,
            },
          ],
        },
      ],
    })

    const service = new GameService(join(directory, 'sessions.json'), aiRuntimeClient)
    const session = await service.createSession({ gameId: 'gomoku' })

    const errored = await service.updateAiSeat(session.id, 'black', {
      enabled: true,
      autoPlay: true,
      model: 'codex-mini-latest',
      timeoutMs: 30_000,
    })

    const failedSession = await waitFor(
      () => service.getSession(errored.id),
      (candidate) => candidate.aiSeats?.black?.status === 'errored',
    )

    expect(failedSession.aiSeats?.black).toEqual(
      expect.objectContaining({
        status: 'errored',
        lastError: 'The AI response could not be turned into a valid move.',
      }),
    )

    const restarted = await service.updateAiSeatLauncher(failedSession.id, 'black', {
      launcher: 'codex',
      model: 'codex-mini-latest',
      autoPlay: true,
    })

    const recovered = await waitFor(
      () => service.getSession(restarted.id),
      (candidate) => candidate.events.some((event) => event.kind === 'move_played'),
    )

    expect(recovered.aiSeats?.black?.status).toBe('waiting')
    expect(recovered.events.some((event) => event.kind === 'move_played')).toBe(true)
  })
})
