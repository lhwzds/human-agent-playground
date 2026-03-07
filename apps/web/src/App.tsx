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
  onCreateSession: () => void
  onGameChange: (gameId: string) => void
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
  onCreateSession,
  onGameChange,
}: SessionSetupCardProps) {
  return (
    <div className="panel-card">
      <h2>Session Setup</h2>
      <label className="field-block">
        <span>Game</span>
        <select value={selectedGameId} onChange={(event) => onGameChange(event.target.value)}>
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {game.shortName}
            </option>
          ))}
        </select>
      </label>
      <button className="primary-button" type="button" onClick={onCreateSession}>
        Create Session
      </button>
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

  const activeGame = games.find((game) => game.id === (session?.gameId ?? selectedGameId))
  const activeGameModule = resolveGameModule(activeGame?.id)
  const summary = session && activeGameModule ? activeGameModule.getSummary(session) : null

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Human Agent Playground</p>
        <h1>Shared Tabletop Sessions For Humans And Agents</h1>
        <p className="hero-copy">
          One UI, one MCP endpoint, one session store. Games live in isolated folders, while
          the platform lets humans and agents operate on the same match state and watch each
          move land in real time.
        </p>
        <div className="meta-strip">
          <span>Game: {activeGame?.shortName ?? session?.gameId ?? selectedGameId}</span>
          <span>Sync: {syncState}</span>
          <span>Turn: {summary?.turn ?? '...'}</span>
          <span>Status: {summary?.status ?? '...'}</span>
          <span>Winner: {summary?.winner ?? 'none'}</span>
        </div>
      </section>

      <section className="workspace">
        {loading && (
          <article className="board-panel">
            <p className="empty-state">Loading board…</p>
          </article>
        )}

        {!loading && !session && (
          <>
            <article className="board-panel">
              <p className="empty-state">No session loaded.</p>
            </article>
            <aside className="side-panel">
              <SessionSetupCard
                games={games}
                selectedGameId={selectedGameId}
                onCreateSession={handleCreateSession}
                onGameChange={setSelectedGameId}
              />
            </aside>
          </>
        )}

        {!loading && session && !activeGameModule && (
          <>
            <article className="board-panel">
              <p className="empty-state">No renderer is registered for {session.gameId}.</p>
            </article>
            <aside className="side-panel">
              <SessionSetupCard
                games={games}
                selectedGameId={selectedGameId}
                onCreateSession={handleCreateSession}
                onGameChange={setSelectedGameId}
              />
              {error && (
                <div className="panel-card error-card">
                  <h2>Error</h2>
                  <p>{error}</p>
                </div>
              )}
            </aside>
          </>
        )}

        {!loading && session && activeGame && activeGameModule && (
          <activeGameModule.Workspace
            game={activeGame}
            session={session}
            error={error}
            setupPanel={
              <SessionSetupCard
                games={games}
                selectedGameId={selectedGameId}
                onCreateSession={handleCreateSession}
                onGameChange={setSelectedGameId}
              />
            }
            onSessionUpdate={setSession}
            onRefreshSession={refreshSession}
            onResetSession={async (sessionId) => {
              const updated = await resetSession(sessionId)
              setSession(updated)
              return updated
            }}
            onError={setError}
          />
        )}
      </section>
    </main>
  )
}

export default App
