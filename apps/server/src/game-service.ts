import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  aiLauncherIdSchema,
  aiSeatConfigSchema,
  type AiSeatConfig,
  type AiLauncherId,
  aiRuntimeProviderIdSchema,
  aiRuntimeProviderSettingSchema,
  aiRuntimeSettingsSchema,
  type AiRuntimeSettings,
  type AuthProfileSummary,
  createAuthProfileInputSchema,
  type CreateAuthProfileInput,
  createSessionInputSchema,
  type CreateSessionInput,
  type DecisionExplanation,
  type GameCatalogItem,
  type GameSession,
  type ProviderCapability,
  sessionEventSchema,
  type SessionEvent,
  updateAiSeatInputSchema,
  type UpdateAiSeatInput,
  updateAiSeatLauncherInputSchema,
  type UpdateAiSeatLauncherInput,
  updateAuthProfileInputSchema,
  type UpdateAuthProfileInput,
} from '@human-agent-playground/core'

import {
  type AiRuntimeClient,
  type DecideTurnResult,
  HttpAiRuntimeClient,
} from './ai-runtime-client.js'
import { getGameAdapter, listGameCatalog } from './game-registry.js'

interface PersistedSessions {
  sessions: GameSession[]
  aiRuntimeSettings?: AiRuntimeSettings
}

type SessionListener = (session: GameSession) => void

interface SessionActorContext {
  actorKind: 'human' | 'agent' | 'system' | 'unknown'
  channel: 'ui' | 'mcp' | 'http' | 'system'
  actorName?: string
}

interface MoveEventPayload {
  actorKind?: SessionActorContext['actorKind']
  channel?: SessionActorContext['channel']
  actorName?: string
  reasoning?: DecisionExplanation
}

interface WaitForTurnOptions {
  afterEventId?: string
  timeoutMs?: number
}

interface WaitForTurnResult {
  status: 'ready' | 'finished' | 'timeout'
  session: GameSession
  event: SessionEvent | null
}

interface PlayMoveAndWaitOptions {
  timeoutMs?: number
}

interface PlayMoveAndWaitResult extends WaitForTurnResult {
  playedSession: GameSession
  playedEvent: SessionEvent | null
}

interface PendingWaitForTurnResult {
  status: WaitForTurnResult['status'] | null
  session: GameSession
  event: SessionEvent | null
}

interface AiRuntimeSettingsPayload {
  settings: AiRuntimeSettings
  providers: ProviderCapability[]
  profiles: AuthProfileSummary[]
}

interface ResolvedLauncherSeatConfig {
  launcher: AiLauncherId
  model: string
  providerProfileId?: string
  promptOverride?: string | null
  timeoutMs: number
  autoPlay: boolean
}

interface AiSeatFailure {
  code: string
  userMessage: string
  noticeSummary: string
  rawResponsePreview?: string | null
}

interface AiSeatRunToken {
  sessionUpdatedAt: string
  lastEventId: string | null
  seatSignature: string
}

export class GameServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'GameServiceError'
  }
}

class AiSeatRuntimeError extends Error {
  constructor(readonly failure: AiSeatFailure) {
    super(failure.userMessage)
    this.name = 'AiSeatRuntimeError'
  }
}

export class GameService {
  private readonly dataPath: string
  private readonly aiRuntimeClient: AiRuntimeClient
  private readonly sessions = new Map<string, GameSession>()
  private readonly sessionListeners = new Map<string, Set<SessionListener>>()
  private readonly activeSeatRuns = new Set<string>()
  private aiRuntimeSettings = buildDefaultAiRuntimeSettings()
  private loadPromise: Promise<void> | null = null
  private persistPromise: Promise<void> = Promise.resolve()

  constructor(dataPath = defaultDataPath(), aiRuntimeClient: AiRuntimeClient = new HttpAiRuntimeClient()) {
    this.dataPath = dataPath
    this.aiRuntimeClient = aiRuntimeClient
  }

  async listSessions(): Promise<GameSession[]> {
    await this.ensureLoaded()
    return [...this.sessions.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )
  }

  async listGames(): Promise<GameCatalogItem[]> {
    return listGameCatalog()
  }

  async createSession(input: CreateSessionInput = createSessionInputSchema.parse({})): Promise<GameSession> {
    await this.ensureLoaded()
    const parsed = createSessionInputSchema.parse(input)
    const adapter = getGameAdapter(parsed.gameId)
    const initialState = adapter.createInitialState()

    const timestamp = new Date().toISOString()
    const actor = resolveActorContext(parsed, {
      actorKind: 'system',
      channel: 'system',
    })
    const validSides = new Set(adapter.game.sides)
    const configuredLaunchers = parsed.seatLaunchers ?? {}

    for (const side of Object.keys(configuredLaunchers)) {
      if (!validSides.has(side)) {
        throw new GameServiceError(`Unsupported seat side: ${side}`, 400, 'invalid_side', { side })
      }
    }

    let aiSeats = buildDefaultAiSeats(adapter.game.sides)
    for (const side of adapter.game.sides) {
      const seatInput = configuredLaunchers[side]
      if (!seatInput || seatInput.launcher === 'human') {
        continue
      }

      const resolved = await this.resolveLauncherSeatConfig({
        launcher: seatInput.launcher,
        model: seatInput.model,
        autoPlay: seatInput.autoPlay,
      })

      aiSeats = {
        ...aiSeats,
        [side]: aiSeatConfigSchema.parse({
          ...aiSeats[side],
          side,
          launcher: resolved.launcher,
          enabled: true,
          autoPlay: resolved.autoPlay,
          providerProfileId: resolved.providerProfileId,
          model: resolved.model,
          promptOverride: resolved.promptOverride ?? null,
          timeoutMs: resolved.timeoutMs,
          lastError: null,
          runtimeSource: 'restflow-bridge',
          status: 'idle',
        }),
      }
    }

    const session: GameSession = {
      id: randomUUID(),
      gameId: parsed.gameId,
      createdAt: timestamp,
      updatedAt: timestamp,
      state: initialState,
      aiSeats: {},
      events: [
        createSessionEvent({
          timestamp,
          gameId: parsed.gameId,
          actor,
          gameTitle: adapter.game.shortName,
        }),
      ],
    }
    session.aiSeats = reconcileAiSeats(aiSeats, readSessionTurn(session), readSessionStatus(session))

    this.sessions.set(session.id, session)
    await this.persist()
    this.emitSessionUpdate(session)
    this.queueAiSeatTurn(session)
    return session
  }

  listProviderCapabilities(): Promise<ProviderCapability[]> {
    return this.aiRuntimeClient.listProviders()
  }

  async getAiRuntimeSettings(): Promise<AiRuntimeSettingsPayload> {
    await this.ensureLoaded()
    const [providers, profiles] = await Promise.all([
      this.aiRuntimeClient.listProviders(),
      this.aiRuntimeClient.listAuthProfiles(),
    ])

    return {
      settings: normalizeAiRuntimeSettings(this.aiRuntimeSettings),
      providers,
      profiles,
    }
  }

  async updateAiRuntimeSettings(input: AiRuntimeSettings): Promise<AiRuntimeSettings> {
    await this.ensureLoaded()
    this.aiRuntimeSettings = normalizeAiRuntimeSettings(aiRuntimeSettingsSchema.parse(input))
    await this.persist()
    return this.aiRuntimeSettings
  }

  listAuthProfiles(): Promise<AuthProfileSummary[]> {
    return this.aiRuntimeClient.listAuthProfiles()
  }

  createAuthProfile(input: CreateAuthProfileInput): Promise<{ id: string; created: true }> {
    return this.aiRuntimeClient.createAuthProfile(createAuthProfileInputSchema.parse(input))
  }

  updateAuthProfile(
    profileId: string,
    input: UpdateAuthProfileInput,
  ): Promise<{ id: string; name: string; enabled: boolean; priority: number }> {
    return this.aiRuntimeClient.updateAuthProfile(profileId, updateAuthProfileInputSchema.parse(input))
  }

  deleteAuthProfile(profileId: string): Promise<{ deleted: true; id: string }> {
    return this.aiRuntimeClient.deleteAuthProfile(profileId)
  }

  testAuthProfile(profileId: string): Promise<{ id: string; available: boolean }> {
    return this.aiRuntimeClient.testAuthProfile(profileId)
  }

  async getAiSeats(sessionId: string): Promise<Record<string, AiSeatConfig>> {
    const session = await this.getSession(sessionId)
    return normalizeAiSeats(getGameAdapter(session.gameId).game.sides, session.aiSeats)
  }

  async updateAiSeat(
    sessionId: string,
    side: string,
    input: UpdateAiSeatInput,
  ): Promise<GameSession> {
    const session = await this.getSession(sessionId)
    const adapter = getGameAdapter(session.gameId)
    const validSides = new Set(adapter.game.sides)
    if (!validSides.has(side)) {
      throw new Error(`Unsupported seat side: ${side}`)
    }

    const currentSeats = normalizeAiSeats(adapter.game.sides, session.aiSeats)
    const update = updateAiSeatInputSchema.parse(input)
    const mergedSeat = aiSeatConfigSchema.parse({
      ...currentSeats[side],
      ...update,
      side,
    })

    if (mergedSeat.enabled && !mergedSeat.model) {
      throw new Error('Enabled AI seats must select a model')
    }

    const nextSeats = reconcileAiSeats(
      {
        ...currentSeats,
        [side]: mergedSeat,
      },
      readSessionTurn(session),
      readSessionStatus(session),
    )

    const updated: GameSession = {
      ...session,
      updatedAt: new Date().toISOString(),
      aiSeats: nextSeats,
    }

    this.sessions.set(sessionId, updated)
    await this.persist()
    this.emitSessionUpdate(updated)
    this.queueAiSeatTurn(updated)
    return updated
  }

  async updateAiSeatLauncher(
    sessionId: string,
    side: string,
    input: UpdateAiSeatLauncherInput,
  ): Promise<GameSession> {
    const session = await this.getSession(sessionId)
    const adapter = getGameAdapter(session.gameId)
    const validSides = new Set(adapter.game.sides)
    if (!validSides.has(side)) {
      throw new GameServiceError(`Unsupported seat side: ${side}`, 400, 'invalid_side', { side })
    }

    const parsed = updateAiSeatLauncherInputSchema.parse(input)
    const currentSeats = normalizeAiSeats(adapter.game.sides, session.aiSeats)

    if (parsed.launcher === 'human') {
      const nextSeats = reconcileAiSeats(
        {
          ...currentSeats,
          [side]: aiSeatConfigSchema.parse({
            ...currentSeats[side],
            side,
            launcher: 'human',
            enabled: false,
            autoPlay: false,
            providerProfileId: undefined,
            model: undefined,
            promptOverride: null,
            lastError: null,
            runtimeSource: null,
            status: 'idle',
          }),
        },
        readSessionTurn(session),
        readSessionStatus(session),
      )

      const updated: GameSession = {
        ...session,
        updatedAt: new Date().toISOString(),
        aiSeats: nextSeats,
      }

      this.sessions.set(sessionId, updated)
      await this.persist()
      this.emitSessionUpdate(updated)
      return updated
    }

    const resolved = await this.resolveLauncherSeatConfig(parsed)
    const nextSeats = reconcileAiSeats(
      {
        ...currentSeats,
        [side]: aiSeatConfigSchema.parse({
          ...currentSeats[side],
          side,
          launcher: resolved.launcher,
          enabled: true,
          autoPlay: resolved.autoPlay,
          providerProfileId: resolved.providerProfileId,
          model: resolved.model,
          promptOverride: resolved.promptOverride ?? null,
          timeoutMs: resolved.timeoutMs,
          lastError: null,
          runtimeSource: 'restflow-bridge',
          status: 'idle',
        }),
      },
      readSessionTurn(session),
      readSessionStatus(session),
    )

    const updated: GameSession = {
      ...session,
      updatedAt: new Date().toISOString(),
      aiSeats: nextSeats,
    }

    this.sessions.set(sessionId, updated)
    await this.persist()
    this.emitSessionUpdate(updated)
    this.queueAiSeatTurn(updated)
    return updated
  }

  async getSession(sessionId: string): Promise<GameSession> {
    await this.ensureLoaded()
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    return session
  }

  async getLegalMoves(sessionId: string, query?: unknown): Promise<unknown[]> {
    const session = await this.getSession(sessionId)
    const adapter = getGameAdapter(session.gameId)
    return adapter.listLegalMoves(session.state, query)
  }

  async playMove(sessionId: string, input: unknown): Promise<GameSession> {
    const session = await this.getSession(sessionId)
    const adapter = getGameAdapter(session.gameId)
    const actor = resolveActorContext(input, {
      actorKind: 'unknown',
      channel: 'http',
    })
    const reasoning = parseDecisionExplanation(input)
    validateAgentMoveExplanation(actor, reasoning)

    const nextState = adapter.playMove(session.state, input)
    const moveDetails = {
      ...parseMoveEventDetails(nextState),
      ...parseAiRuntimeEventDetails(input),
    }
    const timestamp = new Date().toISOString()
    const updated: GameSession = {
      ...session,
      updatedAt: timestamp,
      state: nextState,
      aiSeats: reconcileAiSeats(
        normalizeAiSeats(adapter.game.sides, session.aiSeats),
        readSessionTurn({ ...session, state: nextState }),
        readSessionStatus({ ...session, state: nextState }),
      ),
      events: [
        ...session.events,
        createMovePlayedEvent({
          timestamp,
          actor,
          reasoning,
          details: moveDetails,
        }),
      ],
    }

    this.sessions.set(sessionId, updated)
    await this.persist()
    this.emitSessionUpdate(updated)
    this.queueAiSeatTurn(updated)
    return updated
  }

  async resetSession(sessionId: string, input?: unknown): Promise<GameSession> {
    const session = await this.getSession(sessionId)
    const adapter = getGameAdapter(session.gameId)
    const actor = resolveActorContext(input, {
      actorKind: 'unknown',
      channel: 'http',
    })
    const timestamp = new Date().toISOString()
    const updated: GameSession = {
      ...session,
      updatedAt: timestamp,
      state: adapter.createInitialState(),
      aiSeats: reconcileAiSeats(
        normalizeAiSeats(adapter.game.sides, session.aiSeats),
        readSessionTurn({ ...session, state: adapter.createInitialState() }),
        readSessionStatus({ ...session, state: adapter.createInitialState() }),
      ),
      events: [
        ...session.events,
        createSessionResetEvent({
          timestamp,
          actor,
          gameTitle: adapter.game.shortName,
        }),
      ],
    }

    this.sessions.set(sessionId, updated)
    await this.persist()
    this.emitSessionUpdate(updated)
    this.queueAiSeatTurn(updated)
    return updated
  }

  async waitForTurn(
    sessionId: string,
    expectedTurn: string,
    options: WaitForTurnOptions = {},
  ): Promise<WaitForTurnResult> {
    const timeoutMs = options.timeoutMs ?? 60_000
    let latestSession = await this.getSession(sessionId)
    const initialResult = resolveWaitForTurnResult(latestSession, expectedTurn, options.afterEventId)

    if (isResolvedWaitForTurnResult(initialResult)) {
      return initialResult
    }

    return await new Promise<WaitForTurnResult>((resolve) => {
      const unsubscribe = this.subscribeSession(sessionId, (session) => {
        latestSession = session
        const nextResult = resolveWaitForTurnResult(session, expectedTurn, options.afterEventId)
        if (!isResolvedWaitForTurnResult(nextResult)) {
          return
        }

        clearTimeout(timeoutHandle)
        unsubscribe()
        resolve(nextResult)
      })

      const timeoutHandle = setTimeout(() => {
        unsubscribe()
        resolve({
          status: 'timeout',
          session: latestSession,
          event: getLatestSessionEvent(latestSession),
        })
      }, timeoutMs)
    })
  }

  async playMoveAndWait(
    sessionId: string,
    input: unknown,
    options: PlayMoveAndWaitOptions = {},
  ): Promise<PlayMoveAndWaitResult> {
    const playedSession = await this.playMove(sessionId, input)
    const playedEvent = getLatestSessionEvent(playedSession)
    const playedStatus = readSessionStatus(playedSession)
    const moverSide = readLastMoveSide(playedSession)

    if (playedStatus === 'finished') {
      return {
        status: 'finished',
        session: playedSession,
        event: playedEvent,
        playedSession,
        playedEvent,
      }
    }

    if (!moverSide) {
      throw new Error('Unable to determine the side that just moved')
    }

    const waitResult = await this.waitForTurn(sessionId, moverSide, {
      afterEventId: playedEvent?.id,
      timeoutMs: options.timeoutMs,
    })

    return {
      ...waitResult,
      playedSession,
      playedEvent,
    }
  }

  subscribeSession(sessionId: string, listener: SessionListener): () => void {
    let listeners = this.sessionListeners.get(sessionId)
    if (!listeners) {
      listeners = new Set()
      this.sessionListeners.set(sessionId, listeners)
    }

    listeners.add(listener)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.sessionListeners.delete(sessionId)
      }
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadFromDisk()
    }
    await this.loadPromise
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const raw = await readFile(this.dataPath, 'utf8')
      const data = JSON.parse(raw) as PersistedSessions
      this.aiRuntimeSettings = normalizeAiRuntimeSettings(data.aiRuntimeSettings)
      for (const session of data.sessions ?? []) {
        const normalized = this.normalizeSession(session)
        this.sessions.set(normalized.id, normalized)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('ENOENT')) {
        throw error
      }
    }
  }

  private normalizeSession(raw: Partial<GameSession> & { game?: string }): GameSession {
    const gameId = raw.gameId ?? raw.game ?? 'xiangqi'
    const adapter = getGameAdapter(gameId)
    const createdAt = raw.createdAt ?? new Date().toISOString()
    const normalizedEvents =
      raw.events?.map((event) => sessionEventSchema.parse(event)) ??
      [
        createSessionEvent({
          timestamp: createdAt,
          actor: {
            actorKind: 'system',
            channel: 'system',
          },
          gameId,
          gameTitle: adapter.game.shortName,
        }),
      ]

    return {
      id: raw.id ?? randomUUID(),
      gameId,
      createdAt,
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      state: raw.state ? adapter.normalizeState(raw.state) : adapter.createInitialState(),
      aiSeats: normalizeAiSeats(adapter.game.sides, raw.aiSeats),
      events: normalizedEvents,
    }
  }

  private emitSessionUpdate(session: GameSession) {
    const listeners = this.sessionListeners.get(session.id)
    if (!listeners) {
      return
    }

    for (const listener of listeners) {
      listener(session)
    }
  }

  private async persist(): Promise<void> {
    this.persistPromise = this.persistPromise.then(async () => {
      await mkdir(dirname(this.dataPath), { recursive: true })
      const payload: PersistedSessions = {
        sessions: [...this.sessions.values()],
        aiRuntimeSettings: this.aiRuntimeSettings,
      }
      await writeFile(this.dataPath, JSON.stringify(payload, null, 2), 'utf8')
    })

    await this.persistPromise
  }

  private queueAiSeatTurn(session: GameSession) {
    const turn = readSessionTurn(session)
    const status = readSessionStatus(session)
    if (!turn || status === 'finished') {
      return
    }

    const seat = session.aiSeats?.[turn]
    if (!seat || !seat.enabled || !seat.autoPlay || seat.status === 'errored') {
      return
    }

    const runKey = `${session.id}:${turn}`
    if (this.activeSeatRuns.has(runKey)) {
      return
    }

    this.activeSeatRuns.add(runKey)
    void this.runAiSeatTurn(session.id, turn).finally(() => {
      this.activeSeatRuns.delete(runKey)
      const latest = this.sessions.get(session.id)
      if (latest) {
        this.queueAiSeatTurn(latest)
      }
    })
  }

  private async runAiSeatTurn(sessionId: string, side: string) {
    let session = await this.getSession(sessionId)
    const adapter = getGameAdapter(session.gameId)
    const aiSeats = normalizeAiSeats(adapter.game.sides, session.aiSeats)
    const seat = aiSeats[side]

    if (!seat || !seat.enabled || !seat.autoPlay || seat.status === 'errored') {
      return
    }

    const thinkingSession = await this.persistSeatStatus(session, side, {
      status: 'thinking',
      lastError: null,
      runtimeSource: 'restflow-bridge',
    })

    session = thinkingSession
    const runToken = createAiSeatRunToken(session, side)

    try {
      const legalMoves = await this.getLegalMoves(sessionId)
      const decision = await this.aiRuntimeClient.decideTurn({
        gameId: session.gameId,
        sessionId: session.id,
        seatSide: side,
        state: session.state,
        legalMoves,
        recentEvents: session.events.slice(-12),
        seatConfig: {
          providerProfileId: seat.providerProfileId,
          provider: mapLauncherToDecisionProvider(seat.launcher),
          model: seat.model ?? '',
          promptOverride: seat.promptOverride ?? undefined,
          timeoutMs: seat.timeoutMs,
        },
      })

      if (decision.error) {
        throw new AiSeatRuntimeError(mapBridgeDecisionFailure(decision))
      }

      if (!decision.action) {
        throw new AiSeatRuntimeError({
          code: 'decision_missing_action',
          userMessage: 'The AI response did not include a move.',
          noticeSummary: 'the model response did not include an action',
        })
      }

      if (!includesLegalAction(legalMoves, decision.action)) {
        throw new AiSeatRuntimeError({
          code: 'decision_illegal_action',
          userMessage: 'The AI proposed a move that is not legal in this position.',
          noticeSummary: 'the model proposed an illegal action',
        })
      }

      const normalizedAction = normalizeAiRuntimeAction(decision.action)
      const latestBeforeMove = await this.getSession(sessionId)
      if (!isAiSeatRunCurrent(latestBeforeMove, side, runToken)) {
        return
      }

      await this.playMove(sessionId, {
        ...(typeof normalizedAction === 'object' && normalizedAction !== null ? normalizedAction : {}),
        actorKind: 'agent',
        channel: 'system',
        actorName: 'restflow-bridge',
        reasoning: decision.reasoning ?? undefined,
        provider: decision.provider,
        model: decision.model,
        seatSide: side,
        runtimeSource: 'restflow-bridge',
      })

      const nextSession = await this.getSession(sessionId)
      const nextStatus = readSessionStatus(nextSession)
      if (nextStatus === 'finished') {
        await this.persistSeatStatus(nextSession, side, {
          status: 'idle',
          lastError: null,
          runtimeSource: 'restflow-bridge',
        })
        return
      }

      await this.persistSeatStatus(nextSession, side, {
        status: readSessionTurn(nextSession) === side ? 'waiting' : 'idle',
        lastError: null,
        runtimeSource: 'restflow-bridge',
      })
    } catch (error) {
      const latest = await this.getSession(sessionId)
      if (!isAiSeatRunCurrent(latest, side, runToken)) {
        return
      }
      await this.persistSeatError(latest, side, normalizeAiSeatFailure(error))
    }
  }

  private async persistSeatStatus(
    session: GameSession,
    side: string,
    partial: Pick<AiSeatConfig, 'status' | 'lastError' | 'runtimeSource'>,
  ) {
    return this.updateLatestSession(session.id, (latest) => {
      const adapter = getGameAdapter(latest.gameId)
      const aiSeats = normalizeAiSeats(adapter.game.sides, latest.aiSeats)
      const seat = aiSeats[side]
      if (!seat) {
        return latest
      }

      return {
        ...latest,
        updatedAt: new Date().toISOString(),
        aiSeats: {
          ...aiSeats,
          [side]: {
            ...seat,
            ...partial,
          },
        },
      }
    })
  }

  private async persistSeatError(session: GameSession, side: string, failure: AiSeatFailure) {
    return this.updateLatestSession(session.id, (latest) => {
      const adapter = getGameAdapter(latest.gameId)
      const aiSeats = normalizeAiSeats(adapter.game.sides, latest.aiSeats)
      const seat = aiSeats[side]
      if (!seat) {
        return latest
      }

      const timestamp = new Date().toISOString()
      const summary = `AI seat ${side} stopped: ${failure.noticeSummary}`
      const lastEvent = latest.events.at(-1)
      const shouldAppendNotice = !(
        seat.status === 'errored' &&
        seat.lastError === failure.userMessage &&
        lastEvent?.kind === 'system_notice' &&
        lastEvent.summary === summary
      )

      return {
        ...latest,
        updatedAt: timestamp,
        aiSeats: {
          ...aiSeats,
          [side]: {
            ...seat,
            status: 'errored',
            lastError: failure.userMessage,
            runtimeSource: 'restflow-bridge',
          },
        },
        events: shouldAppendNotice
          ? [
              ...latest.events,
              createSystemNoticeEvent({
                timestamp,
                summary,
                details: {
                  side,
                  runtimeSource: 'restflow-bridge',
                  error: failure.userMessage,
                  errorCode: failure.code,
                  rawResponsePreview: failure.rawResponsePreview ?? undefined,
                },
              }),
            ]
          : latest.events,
      }
    })
  }

  private async updateLatestSession(
    sessionId: string,
    updater: (session: GameSession) => GameSession,
  ): Promise<GameSession> {
    const latest = await this.getSession(sessionId)
    const updated = updater(latest)
    if (updated === latest) {
      return latest
    }

    this.sessions.set(sessionId, updated)
    await this.persist()
    this.emitSessionUpdate(updated)
    return updated
  }

  private async resolveLauncherSeatConfig(
    input: UpdateAiSeatLauncherInput,
  ): Promise<ResolvedLauncherSeatConfig> {
    const [providers, profiles] = await Promise.all([
      this.aiRuntimeClient.listProviders(),
      this.aiRuntimeClient.listAuthProfiles(),
    ])
    const settings = normalizeAiRuntimeSettings(this.aiRuntimeSettings)
    const setting = settings.providers.find((candidate) => candidate.providerId === input.launcher)
    const timeoutMs = input.advanced?.timeoutMs ?? 60_000
    const autoPlay = input.autoPlay ?? true

    const resolveModel = (providerIds: string[]) => {
      const matchingProviders = providers.filter((candidate) => providerIds.includes(candidate.id))
      const allowedModels = matchingProviders.flatMap((candidate) => candidate.models)
      const requestedModel = input.model ?? setting?.defaultModel ?? allowedModels[0]?.id

      if (!requestedModel) {
        throw new GameServiceError(
          `No model is configured for launcher ${input.launcher}`,
          400,
          'config_missing',
          { launcher: input.launcher },
        )
      }

      const selectedModel = allowedModels.find((candidate) => candidate.id === requestedModel)
      if (!selectedModel) {
        throw new GameServiceError(
          `Model ${requestedModel} is not available for launcher ${input.launcher}`,
          400,
          'config_missing',
          { launcher: input.launcher, model: requestedModel },
        )
      }

      return {
        model: selectedModel.id,
        provider: matchingProviders.find((candidate) => candidate.id === selectedModel.provider) ?? null,
      }
    }

    switch (input.launcher) {
      case 'openai':
      case 'anthropic': {
        const { model, provider } = resolveModel([input.launcher])
        const profileId = input.advanced?.providerProfileId ?? setting?.defaultProfileId ?? null

        if (!profileId) {
          throw new GameServiceError(
            `${input.launcher} is not configured yet`,
            400,
            'config_missing',
            { launcher: input.launcher, providerId: input.launcher },
          )
        }

        const profile = profiles.find((candidate) => candidate.id === profileId)
        if (!profile || !profile.enabled || profile.health === 'disabled') {
          throw new GameServiceError(
            `${input.launcher} profile is unavailable`,
            400,
            'test_failed',
            { launcher: input.launcher, providerId: input.launcher, profileId },
          )
        }

        if (!provider?.available) {
          throw new GameServiceError(
            `${input.launcher} provider is unavailable`,
            400,
            'test_failed',
            { launcher: input.launcher, providerId: input.launcher },
          )
        }

        return {
          launcher: input.launcher,
          model,
          providerProfileId: profileId,
          promptOverride: input.advanced?.promptOverride ?? null,
          timeoutMs,
          autoPlay,
        }
      }
      case 'codex': {
        const { model, provider } = resolveModel(['codex-cli'])
        if (!provider?.available) {
          throw new GameServiceError(
            'Codex CLI is unavailable on this machine',
            400,
            'cli_unavailable',
            { launcher: input.launcher, providerId: 'codex-cli' },
          )
        }

        return {
          launcher: input.launcher,
          model,
          promptOverride: input.advanced?.promptOverride ?? null,
          timeoutMs,
          autoPlay,
        }
      }
      case 'claude_code': {
        const { model, provider } = resolveModel(['claude-code'])
        if (!provider?.available) {
          throw new GameServiceError(
            'Claude Code is unavailable on this machine',
            400,
            'cli_unavailable',
            { launcher: input.launcher, providerId: 'claude-code' },
          )
        }

        return {
          launcher: input.launcher,
          model,
          promptOverride: input.advanced?.promptOverride ?? null,
          timeoutMs,
          autoPlay,
        }
      }
      case 'gemini': {
        const preferredSource = setting?.preferredSource
        const profileId = input.advanced?.providerProfileId ?? setting?.defaultProfileId ?? null
        const googleProvider = providers.find((candidate) => candidate.id === 'google') ?? null
        const cliProvider = providers.find((candidate) => candidate.id === 'gemini-cli') ?? null
        const shouldUseCli =
          preferredSource === 'cli' || (!profileId && preferredSource !== 'api' && Boolean(cliProvider?.available))

        if (shouldUseCli) {
          const { model, provider } = resolveModel(['gemini-cli'])
          if (!provider?.available) {
            throw new GameServiceError(
              'Gemini CLI is unavailable on this machine',
              400,
              'cli_unavailable',
              { launcher: input.launcher, providerId: 'gemini-cli' },
            )
          }

          return {
            launcher: input.launcher,
            model,
            promptOverride: input.advanced?.promptOverride ?? null,
            timeoutMs,
            autoPlay,
          }
        }

        if (!profileId) {
          throw new GameServiceError(
            'Gemini is not configured yet',
            400,
            'config_missing',
            { launcher: input.launcher, providerId: 'google' },
          )
        }

        const profile = profiles.find((candidate) => candidate.id === profileId)
        if (!profile || !profile.enabled || profile.health === 'disabled') {
          throw new GameServiceError(
            'Gemini API profile is unavailable',
            400,
            'test_failed',
            { launcher: input.launcher, providerId: 'google', profileId },
          )
        }

        if (!googleProvider?.available) {
          throw new GameServiceError(
            'Gemini API provider is unavailable',
            400,
            'test_failed',
            { launcher: input.launcher, providerId: 'google' },
          )
        }

        const { model } = resolveModel(['google'])
        return {
          launcher: input.launcher,
          model,
          providerProfileId: profileId,
          promptOverride: input.advanced?.promptOverride ?? null,
          timeoutMs,
          autoPlay,
        }
      }
      default:
        throw new GameServiceError(`Unsupported launcher: ${input.launcher}`, 400, 'invalid_launcher')
    }
  }
}

function createSessionEvent({
  timestamp,
  actor,
  gameId,
  gameTitle,
}: {
  timestamp: string
  actor: SessionActorContext
  gameId: string
  gameTitle: string
}): SessionEvent {
  return {
    id: randomUUID(),
    kind: 'session_created',
    createdAt: timestamp,
    actorKind: actor.actorKind,
    channel: actor.channel,
    actorName: actor.actorName,
    summary: `Created a new ${gameTitle} session.`,
    details: {
      gameId,
    },
  }
}

function createMovePlayedEvent({
  timestamp,
  actor,
  reasoning,
  details,
}: {
  timestamp: string
  actor: SessionActorContext
  reasoning?: DecisionExplanation
  details: Record<string, unknown>
}): SessionEvent {
  const side = typeof details.side === 'string' ? details.side : 'Unknown'
  const point = typeof details.point === 'string' ? details.point : null
  const from = typeof details.from === 'string' ? details.from : null
  const to = typeof details.to === 'string' ? details.to : null
  const summary =
    point !== null
      ? `${side} played ${point}.`
      : `${side} played ${from ?? 'unknown'} -> ${to ?? 'unknown'}.`

  return {
    id: randomUUID(),
    kind: 'move_played',
    createdAt: timestamp,
    actorKind: actor.actorKind,
    channel: actor.channel,
    actorName: actor.actorName,
    summary,
    reasoning,
    details,
  }
}

function createSessionResetEvent({
  timestamp,
  actor,
  gameTitle,
}: {
  timestamp: string
  actor: SessionActorContext
  gameTitle: string
}): SessionEvent {
  return {
    id: randomUUID(),
    kind: 'session_reset',
    createdAt: timestamp,
    actorKind: actor.actorKind,
    channel: actor.channel,
    actorName: actor.actorName,
    summary: `Reset the ${gameTitle} session to the opening position.`,
    details: {},
  }
}

function createSystemNoticeEvent({
  timestamp,
  summary,
  details,
}: {
  timestamp: string
  summary: string
  details: Record<string, unknown>
}): SessionEvent {
  return {
    id: randomUUID(),
    kind: 'system_notice',
    createdAt: timestamp,
    actorKind: 'system',
    channel: 'system',
    actorName: 'restflow-bridge',
    summary,
    details,
  }
}

function resolveWaitForTurnResult(
  session: GameSession,
  expectedTurn: string,
  afterEventId?: string,
): PendingWaitForTurnResult {
  const latestEvent = getLatestSessionEvent(session)
  const turn = readSessionTurn(session)
  const status = readSessionStatus(session)
  const hasAdvanced = !afterEventId || latestEvent?.id !== afterEventId

  if (status === 'finished') {
    return {
      status: 'finished',
      session,
      event: latestEvent,
    }
  }

  if (turn === expectedTurn && hasAdvanced) {
    return {
      status: 'ready',
      session,
      event: latestEvent,
    }
  }

  return {
    status: null,
    session,
    event: latestEvent,
  }
}

function isResolvedWaitForTurnResult(
  result: PendingWaitForTurnResult,
): result is WaitForTurnResult {
  return result.status !== null
}

function getLatestSessionEvent(session: GameSession) {
  return session.events.at(-1) ?? null
}

function readSessionTurn(session: GameSession) {
  const state = session.state as { turn?: unknown }
  return typeof state.turn === 'string' ? state.turn : null
}

function readSessionStatus(session: GameSession) {
  const state = session.state as { status?: unknown }
  return typeof state.status === 'string' ? state.status : null
}

function readLastMoveSide(session: GameSession) {
  const state = session.state as { lastMove?: { side?: unknown } | null }
  return typeof state.lastMove?.side === 'string' ? state.lastMove.side : null
}

function resolveActorContext(
  input: unknown,
  fallback: SessionActorContext,
): SessionActorContext {
  if (!input || typeof input !== 'object') {
    return fallback
  }

  const value = input as Partial<SessionActorContext>
  return {
    actorKind: value.actorKind ?? fallback.actorKind,
    channel: value.channel ?? fallback.channel,
    actorName: value.actorName,
  }
}

function parseDecisionExplanation(input: unknown): DecisionExplanation | undefined {
  if (!input || typeof input !== 'object' || !('reasoning' in input)) {
    return undefined
  }

  const value = (input as { reasoning?: unknown }).reasoning
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== 'object') {
    throw new Error('Invalid reasoning payload')
  }

  const summary = (value as { summary?: unknown }).summary
  if (typeof summary !== 'string' || summary.trim().length === 0) {
    throw new Error('Reasoning summary is required when reasoning is provided')
  }

  const reasoningStepsRaw = (value as { reasoningSteps?: unknown }).reasoningSteps
  const consideredAlternativesRaw = (value as { consideredAlternatives?: unknown }).consideredAlternatives
  const confidenceRaw = (value as { confidence?: unknown }).confidence

  return {
    summary,
    reasoningSteps: Array.isArray(reasoningStepsRaw)
      ? reasoningStepsRaw.filter((step): step is string => typeof step === 'string' && step.trim().length > 0)
      : [],
    consideredAlternatives: Array.isArray(consideredAlternativesRaw)
      ? consideredAlternativesRaw
          .filter(
            (alternative): alternative is {
              action: string
              summary: string
              rejectedBecause?: string
            } =>
              typeof alternative === 'object' &&
              alternative !== null &&
              typeof (alternative as { action?: unknown }).action === 'string' &&
              typeof (alternative as { summary?: unknown }).summary === 'string' &&
              (((alternative as { rejectedBecause?: unknown }).rejectedBecause === undefined) ||
                typeof (alternative as { rejectedBecause?: unknown }).rejectedBecause === 'string'),
          )
          .map((alternative) => ({
            action: alternative.action,
            summary: alternative.summary,
            rejectedBecause: alternative.rejectedBecause,
          }))
      : [],
    confidence:
      confidenceRaw === null
        ? null
        : typeof confidenceRaw === 'number' && confidenceRaw >= 0 && confidenceRaw <= 1
          ? confidenceRaw
          : undefined,
  }
}

function validateAgentMoveExplanation(
  actor: SessionActorContext,
  reasoning: DecisionExplanation | undefined,
) {
  const requiresReasoning =
    actor.actorKind === 'agent' && (actor.channel === 'mcp' || actor.actorName === 'restflow-bridge')
  if (!requiresReasoning) {
    return
  }

  if (!reasoning) {
    throw new Error('Agent MCP moves must include a reasoning summary for the current move')
  }

  if (reasoning.reasoningSteps.length === 0) {
    throw new Error('Agent MCP moves must include at least one reasoning step')
  }
}

function parseAiRuntimeEventDetails(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') {
    return {}
  }

  const value = input as {
    provider?: unknown
    model?: unknown
    seatSide?: unknown
    runtimeSource?: unknown
  }

  return {
    provider: typeof value.provider === 'string' ? value.provider : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    seatSide: typeof value.seatSide === 'string' ? value.seatSide : undefined,
    runtimeSource: typeof value.runtimeSource === 'string' ? value.runtimeSource : undefined,
  }
}

function parseMoveEventDetails(state: unknown): Record<string, unknown> {
  if (
    !state ||
    typeof state !== 'object' ||
    !('lastMove' in state) ||
    typeof (state as { lastMove?: unknown }).lastMove !== 'object' ||
    (state as { lastMove?: unknown }).lastMove === null
  ) {
    return {}
  }

  const move = (state as { lastMove: { [key: string]: unknown } }).lastMove
  return {
    column: move.column,
    row: move.row,
    point: move.point,
    from: move.from,
    to: move.to,
    side: move.side,
    notation: move.notation,
    san: typeof move.san === 'string' ? move.san : undefined,
    flippedPoints: Array.isArray(move.flippedPoints) ? move.flippedPoints : undefined,
    pieceDisplay:
      typeof move.piece === 'object' && move.piece !== null ? (move.piece as { display?: unknown }).display : undefined,
    stoneDisplay:
      typeof move.stone === 'object' && move.stone !== null
        ? (move.stone as { display?: unknown }).display
        : typeof move.disc === 'object' && move.disc !== null
          ? (move.disc as { display?: unknown }).display
          : undefined,
    capturedDisplay:
      typeof move.captured === 'object' && move.captured !== null
        ? (move.captured as { display?: unknown }).display
        : null,
    promotionDisplay:
      typeof move.promotion === 'object' && move.promotion !== null
        ? (move.promotion as { display?: unknown }).display
        : null,
  }
}

function defaultDataPath(): string {
  return resolve(
    process.cwd(),
    process.env.HUMAN_AGENT_PLAYGROUND_DATA_PATH ?? '.human-agent-playground-data/sessions.json',
  )
}

function buildDefaultAiRuntimeSettings(): AiRuntimeSettings {
  return aiRuntimeSettingsSchema.parse({
    providers: [
      { providerId: 'openai' },
      { providerId: 'anthropic' },
      { providerId: 'codex' },
      { providerId: 'claude_code' },
      { providerId: 'gemini', preferredSource: 'api' },
    ],
  })
}

function normalizeAiRuntimeSettings(raw?: AiRuntimeSettings): AiRuntimeSettings {
  const parsed = aiRuntimeSettingsSchema.parse(raw ?? buildDefaultAiRuntimeSettings())
  const byId = new Map(
    parsed.providers.map((setting) => [setting.providerId, aiRuntimeProviderSettingSchema.parse(setting)]),
  )

  for (const providerId of aiRuntimeProviderIdSchema.options) {
    if (!byId.has(providerId)) {
      byId.set(
        providerId,
        aiRuntimeProviderSettingSchema.parse({
          providerId,
          preferredSource: providerId === 'gemini' ? 'api' : null,
        }),
      )
    }
  }

  return {
    providers: [...byId.values()],
  }
}

function buildDefaultAiSeats(sides: string[]): Record<string, AiSeatConfig> {
  return Object.fromEntries(
    sides.map((side) => [
      side,
      aiSeatConfigSchema.parse({
        side,
        launcher: 'human',
        enabled: false,
        autoPlay: true,
        timeoutMs: 60_000,
        status: 'idle',
        lastError: null,
        runtimeSource: null,
      }),
    ]),
  )
}

function normalizeAiSeats(
  sides: string[],
  rawAiSeats: GameSession['aiSeats'],
): Record<string, AiSeatConfig> {
  const defaults = buildDefaultAiSeats(sides)
  const input = rawAiSeats ?? {}

  return Object.fromEntries(
    sides.map((side) => {
      const rawSeat = input[side] ?? {}
      return [
        side,
        aiSeatConfigSchema.parse({
          ...defaults[side],
          ...(typeof rawSeat === 'object' && rawSeat !== null ? rawSeat : {}),
          side,
        }),
      ]
    }),
  )
}

function reconcileAiSeats(
  aiSeats: Record<string, AiSeatConfig>,
  turn: string | null,
  status: string | null,
): Record<string, AiSeatConfig> {
  return Object.fromEntries(
    Object.entries(aiSeats).map(([side, seat]) => {
      if (!seat.enabled || !seat.model || status === 'finished') {
        return [
          side,
          {
            ...seat,
            launcher: seat.enabled ? seat.launcher : 'human',
            status: seat.status === 'errored' ? 'errored' : 'idle',
          },
        ]
      }

      if (seat.status === 'errored') {
        return [side, seat]
      }

      if (seat.status === 'thinking') {
        return [
          side,
          {
            ...seat,
            status: turn === side ? 'thinking' : 'idle',
          },
        ]
      }

      return [
        side,
        {
          ...seat,
          status: turn === side ? 'waiting' : 'idle',
        },
      ]
    }),
  )
}

function createAiSeatRunToken(session: GameSession, side: string): AiSeatRunToken {
  const adapter = getGameAdapter(session.gameId)
  const seat = normalizeAiSeats(adapter.game.sides, session.aiSeats)[side]
  return {
    sessionUpdatedAt: session.updatedAt,
    lastEventId: getLatestSessionEvent(session)?.id ?? null,
    seatSignature: buildAiSeatSignature(seat),
  }
}

function isAiSeatRunCurrent(session: GameSession, side: string, token: AiSeatRunToken): boolean {
  const adapter = getGameAdapter(session.gameId)
  const seat = normalizeAiSeats(adapter.game.sides, session.aiSeats)[side]

  if (!seat || !seat.enabled || !seat.autoPlay || seat.status === 'errored') {
    return false
  }

  if (readSessionStatus(session) === 'finished' || readSessionTurn(session) !== side) {
    return false
  }

  return (
    session.updatedAt === token.sessionUpdatedAt &&
    (getLatestSessionEvent(session)?.id ?? null) === token.lastEventId &&
    buildAiSeatSignature(seat) === token.seatSignature
  )
}

function buildAiSeatSignature(seat: AiSeatConfig | undefined): string {
  if (!seat) {
    return 'missing'
  }

  return stableJson({
    side: seat.side,
    launcher: seat.launcher,
    enabled: seat.enabled,
    autoPlay: seat.autoPlay,
    providerProfileId: seat.providerProfileId ?? null,
    model: seat.model ?? null,
    promptOverride: seat.promptOverride ?? null,
    timeoutMs: seat.timeoutMs,
    status: seat.status,
    runtimeSource: seat.runtimeSource ?? null,
  })
}

function includesLegalAction(legalMoves: unknown[], action: unknown): boolean {
  const target = stableJson(action)
  return legalMoves.some((candidate) => stableJson(candidate) === target)
}

function mapBridgeDecisionFailure(decision: DecideTurnResult): AiSeatFailure {
  const code = decision.errorCode ?? 'provider_request_failed'

  switch (code) {
    case 'decision_parse_failed':
      return {
        code,
        userMessage: 'The AI response could not be turned into a valid move.',
        noticeSummary: 'the model returned an unparseable action',
        rawResponsePreview: decision.rawResponsePreview ?? null,
      }
    case 'decision_missing_action':
      return {
        code,
        userMessage: 'The AI response did not include a move.',
        noticeSummary: 'the model response did not include an action',
        rawResponsePreview: decision.rawResponsePreview ?? null,
      }
    case 'provider_unavailable':
      return {
        code,
        userMessage: decision.error ?? 'The selected AI provider is unavailable.',
        noticeSummary: 'the provider is unavailable',
        rawResponsePreview: decision.rawResponsePreview ?? null,
      }
    case 'provider_request_failed':
      return {
        code,
        userMessage: decision.error ?? 'The AI provider request failed.',
        noticeSummary: 'the provider request failed',
        rawResponsePreview: decision.rawResponsePreview ?? null,
      }
    default:
      return {
        code,
        userMessage: decision.error ?? 'The AI seat failed.',
        noticeSummary: 'the AI runtime failed',
        rawResponsePreview: decision.rawResponsePreview ?? null,
      }
  }
}

function normalizeAiSeatFailure(error: unknown): AiSeatFailure {
  if (error instanceof AiSeatRuntimeError) {
    return error.failure
  }

  if (error instanceof GameServiceError) {
    return {
      code: error.code ?? 'provider_request_failed',
      userMessage: error.message,
      noticeSummary: 'the AI runtime request failed',
    }
  }

  if (error instanceof Error) {
    return {
      code: 'provider_request_failed',
      userMessage: 'The AI provider request failed.',
      noticeSummary: 'the AI runtime request failed',
    }
  }

  return {
    code: 'provider_request_failed',
    userMessage: 'The AI provider request failed.',
    noticeSummary: 'the AI runtime request failed',
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function normalizeAiRuntimeAction(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAiRuntimeAction(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      if (entry === null || entry === undefined) {
        return []
      }

      return [[key, normalizeAiRuntimeAction(entry)]]
    }),
  )
}

function mapLauncherToDecisionProvider(launcher: AiLauncherId | undefined): string | undefined {
  switch (launcher) {
    case 'openai':
      return 'openai'
    case 'anthropic':
      return 'anthropic'
    case 'codex':
      return 'codex-cli'
    case 'claude_code':
      return 'claude-code'
    case 'gemini':
      return 'google'
    default:
      return undefined
  }
}
