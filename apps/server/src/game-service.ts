import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  createSessionInputSchema,
  type CreateSessionInput,
  type GameCatalogItem,
  type GameSession,
} from '@human-agent-playground/core'

import { getGameAdapter, listGameCatalog } from './game-registry.js'

interface PersistedSessions {
  sessions: GameSession[]
}

export class GameService {
  private readonly dataPath: string
  private readonly sessions = new Map<string, GameSession>()
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
    const session: GameSession = {
      id: randomUUID(),
      gameId: parsed.gameId,
      mode: parsed.mode,
      createdAt: timestamp,
      updatedAt: timestamp,
      state: adapter.createInitialState(),
    }

    this.sessions.set(session.id, session)
    await this.persist()
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

    const nextState = adapter.playMove(session.state, input)
    const updated: GameSession = {
      ...session,
      updatedAt: new Date().toISOString(),
      state: nextState,
    }

    this.sessions.set(sessionId, updated)
    await this.persist()
    return updated
  }

  async resetSession(sessionId: string): Promise<GameSession> {
    const session = await this.getSession(sessionId)
    const adapter = getGameAdapter(session.gameId)
    const updated: GameSession = {
      ...session,
      updatedAt: new Date().toISOString(),
      state: adapter.createInitialState(),
    }

    this.sessions.set(sessionId, updated)
    await this.persist()
    return updated
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
    const mode = raw.mode ?? 'human-vs-agent'
    const adapter = getGameAdapter(gameId)

    return {
      id: raw.id ?? randomUUID(),
      gameId,
      mode,
      createdAt: raw.createdAt ?? new Date().toISOString(),
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      state: raw.state ? adapter.normalizeState(raw.state) : adapter.createInitialState(),
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

function defaultDataPath(): string {
  return resolve(
    process.cwd(),
    process.env.HUMAN_AGENT_PLAYGROUND_DATA_PATH ?? '.human-agent-playground-data/sessions.json',
  )
}
