import type { GameCatalogItem, GameSession } from '@human-agent-playground/core'
import { useEffect, useState } from 'react'

import {
  createSession,
  getSession,
  listGames,
  listSessions,
  openSessionStream,
  resetSession,
} from './api'
import './App.css'
import { getGameModule } from './game-registry'

interface BootstrapPayload {
  games: GameCatalogItem[]
  session: GameSession
}

interface SessionSetupCardProps {
  games: GameCatalogItem[]
  selectedGameId: string
  sessionId?: string
  onCreateSession: () => void
  onGameChange: (gameId: string) => void
  onRefreshSession?: () => void
  onResetSession?: () => void
}

type LiveSyncState = 'connecting' | 'live' | 'reconnecting' | 'offline'

let bootstrapPromise: Promise<BootstrapPayload> | null = null

function loadBootstrapPayload(): Promise<BootstrapPayload> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const availableGames = await listGames()
      const existing = await listSessions()
      const defaultGameId = availableGames[0]?.id ?? 'xiangqi'
      const session =
        existing[0] ??
        (await createSession({
          gameId: defaultGameId,
        }))

      return {
        games: availableGames,
        session,
      }
    })()
  }

  return bootstrapPromise
}

export function resetBootstrapCacheForTests() {
  bootstrapPromise = null
}

function resolveGameModule(gameId: string | undefined) {
  if (!gameId) {
    return null
  }

  try {
    return getGameModule(gameId)
  } catch {
    return null
  }
}

function SessionSetupCard({
  games,
  selectedGameId,
  sessionId,
  onCreateSession,
  onGameChange,
  onRefreshSession,
  onResetSession,
}: SessionSetupCardProps) {
  return (
    <div className="hero-toolbar" role="toolbar" aria-label="Session controls">
      <div className="toolbar-row toolbar-row-primary">
        <label className="toolbar-field">
          <span>Game</span>
          <select value={selectedGameId} onChange={(event) => onGameChange(event.target.value)}>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.shortName}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button toolbar-button" type="button" onClick={onCreateSession}>
          Create Session
        </button>
      </div>
      {sessionId ? (
        <span className="toolbar-session">
          <span>Session</span>
          <span className="mono">{sessionId}</span>
        </span>
      ) : null}
      {sessionId && (onRefreshSession || onResetSession) ? (
        <div className="toolbar-row toolbar-row-actions">
          {onRefreshSession ? (
            <button
              className="secondary-button toolbar-button"
              type="button"
              onClick={onRefreshSession}
            >
              Refresh
            </button>
          ) : null}
          {onResetSession ? (
            <button className="secondary-button toolbar-button" type="button" onClick={onResetSession}>
              Reset
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function App() {
  const [games, setGames] = useState<GameCatalogItem[]>([])
  const [session, setSession] = useState<GameSession | null>(null)
  const [selectedGameId, setSelectedGameId] = useState('xiangqi')
  const [syncState, setSyncState] = useState<LiveSyncState>('offline')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        setLoading(true)
        const { games: availableGames, session: active } = await loadBootstrapPayload()
        if (!cancelled) {
          setGames(availableGames)
          setSelectedGameId(active.gameId)
          setSession(active)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load board')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setSyncState('offline')
      return
    }

    const stream = openSessionStream(session.id, setSession, setSyncState)

    return () => {
      stream.close()
    }
  }, [session?.id])

  async function refreshSession(sessionId: string) {
    const latest = await getSession(sessionId)
    setSession(latest)
    return latest
  }

  async function handleCreateSession() {
    try {
      setError(null)
      const nextSession = await createSession({
        gameId: selectedGameId,
      })
      setSelectedGameId(nextSession.gameId)
      setSession(nextSession)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Session creation failed')
    }
  }

  async function handleRefreshSession() {
    if (!session) {
      return
    }

    try {
      setError(null)
      await refreshSession(session.id)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Refresh failed')
    }
  }

  async function handleResetSession() {
    if (!session) {
      return
    }

    try {
      setError(null)
      const updated = await resetSession(session.id)
      setSession(updated)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Reset failed')
    }
  }

  const activeGame = games.find((game) => game.id === (session?.gameId ?? selectedGameId))
  const activeGameModule = resolveGameModule(activeGame?.id)
  const summary = session && activeGameModule ? activeGameModule.getSummary(session) : null
  const isCheck =
    session &&
    typeof session.state === 'object' &&
    session.state !== null &&
    typeof (session.state as { isCheck?: unknown }).isCheck === 'boolean' &&
    (session.state as { isCheck: boolean }).isCheck

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-main">
          <div className="hero-copy-block">
            <p className="eyebrow">Human Agent Playground</p>
            <h1>Shared Tabletop Sessions For Humans And Agents</h1>
            <p className="hero-copy">
              One UI, one MCP endpoint, one session store. Games live in isolated folders,
              while the platform lets humans and agents operate on the same match state and
              watch each move land in real time.
            </p>
            <div className="meta-strip">
              <span>Game: {activeGame?.shortName ?? session?.gameId ?? selectedGameId}</span>
              <span>Sync: {syncState}</span>
              <span>Turn: {summary?.turn ?? '...'}</span>
              <span>Status: {summary?.status ?? '...'}</span>
              <span>Winner: {summary?.winner ?? 'none'}</span>
              {isCheck ? <span>Check: active</span> : null}
            </div>
            {error ? (
              <div className="hero-alert" role="alert">
                <strong>Error</strong>
                <p>{error}</p>
              </div>
            ) : null}
          </div>
          <div className="hero-controls">
            <SessionSetupCard
              games={games}
              selectedGameId={selectedGameId}
              sessionId={session?.id}
              onCreateSession={handleCreateSession}
              onGameChange={setSelectedGameId}
              onRefreshSession={handleRefreshSession}
              onResetSession={handleResetSession}
            />
          </div>
        </div>
      </section>

      <section className="workspace">
        {loading && (
          <article className="board-panel">
            <p className="empty-state">Loading board…</p>
          </article>
        )}

        {!loading && !session && (
          <article className="board-panel workspace-fallback-panel">
            <p className="empty-state">No session loaded. Create one from the header bar.</p>
          </article>
        )}

        {!loading && session && !activeGameModule && (
          <article className="board-panel workspace-fallback-panel">
            <p className="empty-state">No renderer is registered for {session.gameId}.</p>
          </article>
        )}

        {!loading && session && activeGame && activeGameModule && (
          <activeGameModule.Workspace
            game={activeGame}
            session={session}
            error={error}
            onSessionUpdate={setSession}
            onError={setError}
          />
        )}
      </section>
    </main>
  )
}

export default App
