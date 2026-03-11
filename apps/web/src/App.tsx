import type { GameCatalogItem, GameSession } from '@human-agent-playground/core'
import { useEffect, useRef, useState } from 'react'

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
import {
  getGameLabel,
  getStatusLabel,
  getSyncStateLabel,
  getWinnerLabel,
  I18nProvider,
  useI18n,
} from './i18n'

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
  const { language, setLanguage, t } = useI18n()

  return (
    <div className="hero-toolbar" role="toolbar" aria-label={t('toolbar.aria')}>
      <div className="toolbar-row toolbar-row-primary">
        <label className="toolbar-field">
          <span>{t('toolbar.game')}</span>
          <select
            aria-label={t('toolbar.game')}
            value={selectedGameId}
            onChange={(event) => onGameChange(event.target.value)}
          >
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {getGameLabel(language, game.id, game.shortName)}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-field toolbar-field-language">
          <span>{t('toolbar.language')}</span>
          <select
            aria-label={t('toolbar.language')}
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'en' | 'zh-CN')}
          >
            <option value="en">EN</option>
            <option value="zh-CN">中文</option>
          </select>
        </label>
      </div>
      <div className="toolbar-row toolbar-row-session">
        {sessionId ? (
          <span className="toolbar-session">
            <span>{t('toolbar.session')}</span>
            <span className="mono">{sessionId}</span>
          </span>
        ) : (
          <span className="toolbar-session toolbar-session-placeholder">
            <span>{t('toolbar.session')}</span>
            <span>{t('workspace.noSession')}</span>
          </span>
        )}
        <button className="primary-button toolbar-button" type="button" onClick={onCreateSession}>
          {t('toolbar.createSession')}
        </button>
      </div>
      {sessionId && (onRefreshSession || onResetSession) ? (
        <div className="toolbar-row toolbar-row-actions">
          {onRefreshSession ? (
            <button
              className="secondary-button toolbar-button"
              type="button"
              onClick={onRefreshSession}
            >
              {t('toolbar.refresh')}
            </button>
          ) : null}
          {onResetSession ? (
            <button className="secondary-button toolbar-button" type="button" onClick={onResetSession}>
              {t('toolbar.reset')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function AppContent() {
  const { language, t } = useI18n()
  const [games, setGames] = useState<GameCatalogItem[]>([])
  const [session, setSession] = useState<GameSession | null>(null)
  const [selectedGameId, setSelectedGameId] = useState('xiangqi')
  const [syncState, setSyncState] = useState<LiveSyncState>('offline')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeGameOverSessionKey, setActiveGameOverSessionKey] = useState<string | null>(null)
  const previousStatusBySessionRef = useRef<Map<string, string>>(new Map())

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
  const activeGameLabel = getGameLabel(
    language,
    activeGame?.id ?? session?.gameId ?? selectedGameId,
    activeGame?.shortName ?? session?.gameId ?? selectedGameId,
  )
  const isCheck =
    session &&
    typeof session.state === 'object' &&
    session.state !== null &&
    typeof (session.state as { isCheck?: unknown }).isCheck === 'boolean' &&
    (session.state as { isCheck: boolean }).isCheck
  const finishedSessionKey =
    session && summary?.status === 'finished' ? `${session.id}:${session.updatedAt}` : null
  const showGameOverDialog =
    Boolean(finishedSessionKey) && activeGameOverSessionKey === finishedSessionKey
  const gameOverDialog =
    showGameOverDialog && summary && activeGame ? (
      <div className="board-panel-modal" role="presentation">
        <section
          className="board-panel-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-over-title"
        >
          <p className="eyebrow">{activeGameLabel}</p>
          <h2 id="game-over-title">{t('modal.gameOverTitle')}</h2>
          <p>{t('modal.gameOverSummary', { gameName: activeGameLabel })}</p>
          <p>
            {summary.winner === 'draw'
              ? t('modal.gameOverDraw')
              : t('modal.gameOverWinner', {
                  winner: getWinnerLabel(language, summary.winner),
                })}
          </p>
          <p>{t('modal.gameOverPrompt')}</p>
          <div className="modal-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                void handleResetSession()
                setActiveGameOverSessionKey(null)
              }}
            >
              {t('modal.gameOverRestart')}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setActiveGameOverSessionKey(null)}
            >
              {t('modal.gameOverKeep')}
            </button>
          </div>
        </section>
      </div>
    ) : null

  useEffect(() => {
    if (!session || !summary) {
      return
    }

    const previousStatus = previousStatusBySessionRef.current.get(session.id)
    if (previousStatus && previousStatus !== 'finished' && summary.status === 'finished') {
      setActiveGameOverSessionKey(`${session.id}:${session.updatedAt}`)
    }

    previousStatusBySessionRef.current.set(session.id, summary.status)
  }, [session?.id, session?.updatedAt, summary?.status])

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-main">
          <div className="hero-copy-block">
            <p className="eyebrow">Human Agent Playground</p>
            <h1>{t('hero.heading')}</h1>
            <p className="hero-copy">{t('hero.copy')}</p>
            <div className="meta-strip">
              <span>
                {t('meta.game')}: {activeGameLabel}
              </span>
              <span>
                {t('meta.sync')}: {getSyncStateLabel(language, syncState)}
              </span>
              <span>
                {t('meta.turn')}: {summary ? getWinnerLabel(language, summary.turn) : '...'}
              </span>
              <span>
                {t('meta.status')}: {summary ? getStatusLabel(language, summary.status) : '...'}
              </span>
              <span>
                {t('meta.winner')}: {summary ? getWinnerLabel(language, summary.winner) : t('winner.none')}
              </span>
              {isCheck ? (
                <span>
                  {t('meta.check')}: {t('meta.checkActive')}
                </span>
              ) : null}
            </div>
            {error ? (
              <div className="hero-alert" role="alert">
                <strong>{t('hero.error')}</strong>
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
            <p className="empty-state">{t('workspace.loading')}</p>
          </article>
        )}

        {!loading && !session && (
          <article className="board-panel workspace-fallback-panel">
            <p className="empty-state">{t('workspace.noSession')}</p>
          </article>
        )}

        {!loading && session && !activeGameModule && (
          <article className="board-panel workspace-fallback-panel">
            <p className="empty-state">{t('workspace.noRenderer', { gameId: session.gameId })}</p>
          </article>
        )}

        {!loading && session && activeGame && activeGameModule && (
          <activeGameModule.Workspace
            game={activeGame}
            session={session}
            error={error}
            gameOverDialog={gameOverDialog}
            onSessionUpdate={setSession}
            onError={setError}
          />
        )}
      </section>
    </main>
  )
}

function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  )
}

export default App
