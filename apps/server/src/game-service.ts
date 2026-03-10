import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  createSessionInputSchema,
  type CreateSessionInput,
  type DecisionExplanation,
  type GameCatalogItem,
  type GameSession,
  sessionEventSchema,
  type SessionEvent,
} from '@human-agent-playground/core'

import { getGameAdapter, listGameCatalog } from './game-registry.js'

interface PersistedSessions {
  sessions: GameSession[]
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

export class GameService {
  private readonly dataPath: string
  private readonly sessions = new Map<string, GameSession>()
  private readonly sessionListeners = new Map<string, Set<SessionListener>>()
  private loadPromise: Promise<void> | null = null
  private persistPromise: Promise<void> = Promise.resolve()

  constructor(dataPath = defaultDataPath()) {
    this.dataPath = dataPath
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

    const timestamp = new Date().toISOString()
    const actor = resolveActorContext(parsed, {
      actorKind: 'system',
      channel: 'system',
    })
    const session: GameSession = {
      id: randomUUID(),
      gameId: parsed.gameId,
      createdAt: timestamp,
      updatedAt: timestamp,
      state: adapter.createInitialState(),
      events: [
        createSessionEvent({
          timestamp,
          gameId: parsed.gameId,
          actor,
          gameTitle: adapter.game.shortName,
        }),
      ],
    }

    this.sessions.set(session.id, session)
    await this.persist()
    this.emitSessionUpdate(session)
    return session
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
    const moveDetails = parseMoveEventDetails(nextState)
    const timestamp = new Date().toISOString()
    const updated: GameSession = {
      ...session,
      updatedAt: timestamp,
      state: nextState,
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
      }
      await writeFile(this.dataPath, JSON.stringify(payload, null, 2), 'utf8')
    })

    await this.persistPromise
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
  if (actor.actorKind !== 'agent' || actor.channel !== 'mcp') {
    return
  }

  if (!reasoning) {
    throw new Error('Agent MCP moves must include a reasoning summary for the current move')
  }

  if (reasoning.reasoningSteps.length === 0) {
    throw new Error('Agent MCP moves must include at least one reasoning step')
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
    point: move.point,
    from: move.from,
    to: move.to,
    side: move.side,
    notation: move.notation,
    pieceDisplay:
      typeof move.piece === 'object' && move.piece !== null ? (move.piece as { display?: unknown }).display : undefined,
    stoneDisplay:
      typeof move.stone === 'object' && move.stone !== null ? (move.stone as { display?: unknown }).display : undefined,
    capturedDisplay:
      typeof move.captured === 'object' && move.captured !== null
        ? (move.captured as { display?: unknown }).display
        : null,
  }
}

function defaultDataPath(): string {
  return resolve(
    process.cwd(),
    process.env.HUMAN_AGENT_PLAYGROUND_DATA_PATH ?? '.human-agent-playground-data/sessions.json',
  )
}
