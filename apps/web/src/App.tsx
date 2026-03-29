import type {
  AiRuntimeProviderId,
  AiRuntimeSettings,
  AuthProfileSummary,
  GameCatalogItem,
  GameSession,
  ProviderCapability,
} from '@human-agent-playground/core'
import { useEffect, useRef, useState } from 'react'

import {
  createAuthProfile,
  createSession,
  getAiRuntimeSettings,
  getSession,
  listGames,
  listSessions,
  openSessionStream,
  RequestError,
  resetSession,
  saveAiRuntimeSettings,
  testAuthProfile,
  updateAiSeatLauncher,
  updateAiSeatLaunchers,
  updateAuthProfile,
} from './api'
import './App.css'
import {
  AiSettingsDialog,
  SeatLauncherDialog,
  createProviderSettingsDraft,
  createSeatLauncherDraft,
  mapLauncherToProviderSettingId,
  type ProviderSettingsDraft,
  type SeatLauncherDraft,
} from './ai-runtime-ui'
import { getGameModule } from './game-registry'
import {
  getAiSeatStatusLabel,
  getGameLabel,
  getSideLabel,
  getStatusLabel,
  getSyncStateLabel,
  getWinnerLabel,
  I18nProvider,
  useI18n,
} from './i18n'

interface BootstrapPayload {
  games: GameCatalogItem[]
  sessions: GameSession[]
  session: GameSession
}

interface PlayerSummary {
  side: string
  launcherLabel: string
  status: string
  statusLabel: string
  lastError: string | null
  canRestart: boolean
}

interface SessionSetupCardProps {
  games: GameCatalogItem[]
  sessions: GameSession[]
  selectedGameId: string
  selectedSessionId?: string
  activeGameLabel: string
  syncLabel: string
  turnLabel: string
  statusLabel: string
  winnerLabel: string
  isCheck: boolean
  error: string | null
  onCreateSession: () => void
  onGameChange: (gameId: string) => void
  onSessionChange?: (sessionId: string) => void
  onRefreshSession?: () => void
  onResetSession?: () => void
  onOpenAiSettings?: () => void
}

interface PlayersPanelProps {
  players: PlayerSummary[]
  restartingSide?: string | null
  onOpenEditPlayers?: () => void
  onRestartAi?: (side: string) => void
}

type LiveSyncState = 'connecting' | 'live' | 'reconnecting' | 'offline'

const runtimeProviderIds: AiRuntimeProviderId[] = [
  'openai',
  'anthropic',
  'codex',
  'claude_code',
  'gemini',
]

const defaultSidesByGameId: Record<string, string[]> = {
  xiangqi: ['red', 'black'],
  chess: ['white', 'black'],
  gomoku: ['black', 'white'],
  othello: ['black', 'white'],
  'connect-four': ['red', 'yellow'],
}

let bootstrapPromise: Promise<BootstrapPayload> | null = null

function sortSessionsByUpdatedAt(sessions: GameSession[]) {
  return [...sessions].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  )
}

function formatSessionOption(session: GameSession) {
  const shortId = session.id.slice(0, 8)
  const moveCount =
    typeof session.state === 'object' &&
    session.state !== null &&
    'moveCount' in session.state &&
    typeof (session.state as { moveCount?: unknown }).moveCount === 'number'
      ? (session.state as { moveCount: number }).moveCount
      : 0

  return `${shortId} · ${moveCount}`
}

function compareSessionFreshness(left: GameSession, right: GameSession) {
  const leftTime = new Date(left.updatedAt).getTime()
  const rightTime = new Date(right.updatedAt).getTime()

  if (leftTime !== rightTime) {
    return leftTime - rightTime
  }

  return left.events.length - right.events.length
}

function pickFresherSession(current: GameSession | null, nextSession: GameSession) {
  if (!current || current.id !== nextSession.id) {
    return nextSession
  }

  return compareSessionFreshness(nextSession, current) >= 0 ? nextSession : current
}

function upsertSessionCollection(current: GameSession[], nextSession: GameSession) {
  const existing = current.find((candidate) => candidate.id === nextSession.id)
  const merged = existing ? pickFresherSession(existing, nextSession) : nextSession
  const remaining = current.filter((candidate) => candidate.id !== nextSession.id)
  return sortSessionsByUpdatedAt([merged, ...remaining])
}

function resolvePreferredGameId(availableGames: GameCatalogItem[]) {
  return availableGames.find((game) => game.id === 'chess')?.id ?? availableGames[0]?.id ?? 'xiangqi'
}

function loadBootstrapPayload(): Promise<BootstrapPayload> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const availableGames = await listGames()
      const existing = sortSessionsByUpdatedAt(await listSessions())
      const defaultGameId = resolvePreferredGameId(availableGames)
      const session =
        existing[0] ??
        (await createSession({
          gameId: defaultGameId,
        }))

      return {
        games: availableGames,
        sessions: existing,
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

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function buildProviderDraftMap(
  settings: AiRuntimeSettings,
  providers: ProviderCapability[],
): Record<AiRuntimeProviderId, ProviderSettingsDraft> {
  const drafts = {} as Record<AiRuntimeProviderId, ProviderSettingsDraft>

  for (const providerId of runtimeProviderIds) {
    drafts[providerId] = createProviderSettingsDraft(providerId, settings, providers)
  }

  return drafts
}

function buildSeatLauncherDraftMap(
  session: GameSession | null,
  game: GameCatalogItem | undefined,
  providers: ProviderCapability[],
  settings: AiRuntimeSettings,
  current: Record<string, SeatLauncherDraft>,
) {
  if (!session) {
    return {}
  }

  const sides = resolveGameSides(game, session)

  const nextDrafts: Record<string, SeatLauncherDraft> = {}

  for (const side of sides) {
    nextDrafts[side] = {
      ...createSeatLauncherDraft(session.aiSeats?.[side], providers, settings),
      advancedOpen: current[side]?.advancedOpen ?? false,
    }
  }

  return nextDrafts
}

function resolveGameSides(game: GameCatalogItem | undefined, session?: GameSession | null) {
  if (Array.isArray(game?.sides) && game.sides.length > 0) {
    return game.sides
  }

  if (game?.id && defaultSidesByGameId[game.id]) {
    return defaultSidesByGameId[game.id]
  }

  const sessionSides = Object.keys(session?.aiSeats ?? {})
  if (sessionSides.length > 0) {
    return sessionSides
  }

  return []
}

function buildSeatLauncherDraftMapForSides(
  sides: string[],
  providers: ProviderCapability[],
  settings: AiRuntimeSettings,
  current: Record<string, SeatLauncherDraft> = {},
) {
  const nextDrafts: Record<string, SeatLauncherDraft> = {}

  for (const side of sides) {
    nextDrafts[side] = {
      ...createSeatLauncherDraft(undefined, providers, settings),
      ...current[side],
      launcher: current[side]?.launcher ?? 'human',
      model:
        current[side]?.launcher && current[side].launcher !== 'human'
          ? current[side]?.model ?? ''
          : '',
      autoPlay:
        current[side]?.launcher && current[side].launcher !== 'human'
          ? current[side]?.autoPlay ?? true
          : false,
    }
  }

  return nextDrafts
}

function buildSeatLauncherCreateInput(draft: SeatLauncherDraft) {
  if (draft.launcher === 'human') {
    return {
      launcher: 'human' as const,
    }
  }

  return {
    launcher: draft.launcher,
    model: draft.model || undefined,
    autoPlay: draft.autoPlay,
  }
}

function resolveProviderIdFromRequestError(error: RequestError | null) {
  const providerId = typeof error?.details?.providerId === 'string' ? error.details.providerId : null

  switch (providerId) {
    case 'openai':
    case 'anthropic':
    case 'codex':
    case 'claude_code':
    case 'gemini':
      return providerId
    case 'codex-cli':
      return 'codex'
    case 'claude-code':
      return 'claude_code'
    case 'google':
    case 'gemini-cli':
      return 'gemini'
    default:
      return null
  }
}

function resolveSettingsProvider(
  settings: AiRuntimeSettings,
  providerId: AiRuntimeProviderId,
) {
  return settings.providers.find((provider) => provider.providerId === providerId)
}

function getRuntimeProviderLabel(
  t: ReturnType<typeof useI18n>['t'],
  providerId: AiRuntimeProviderId,
) {
  switch (providerId) {
    case 'openai':
      return t('ai.authProvider.openai')
    case 'anthropic':
      return t('ai.authProvider.anthropic')
    case 'codex':
      return t('ai.authProvider.openai_codex')
    case 'claude_code':
      return t('ai.authProvider.claude_code')
    case 'gemini':
      return 'Gemini'
  }
}

function getLauncherDisplayLabel(
  t: ReturnType<typeof useI18n>['t'],
  launcher: 'human' | 'codex' | 'claude_code' | 'openai' | 'anthropic' | 'gemini',
) {
  switch (launcher) {
    case 'human':
      return t('actor.human')
    case 'codex':
      return t('ai.authProvider.openai_codex')
    case 'claude_code':
      return t('ai.authProvider.claude_code')
    case 'openai':
      return t('ai.authProvider.openai')
    case 'anthropic':
      return t('ai.authProvider.anthropic')
    case 'gemini':
      return 'Gemini'
  }
}

function resolveProviderProfileId(
  providerId: AiRuntimeProviderId,
  draft: ProviderSettingsDraft,
) {
  if (providerId === 'openai' || providerId === 'anthropic') {
    return providerId
  }

  if (providerId === 'gemini' && draft.preferredSource !== 'cli') {
    return 'google'
  }

  return null
}

function providerNeedsCredential(
  providerId: AiRuntimeProviderId,
  draft: ProviderSettingsDraft,
) {
  return resolveProviderProfileId(providerId, draft) !== null
}

function buildNextRuntimeSettings(
  settings: AiRuntimeSettings,
  providerId: AiRuntimeProviderId,
  draft: ProviderSettingsDraft,
  defaultProfileId: string | null,
) {
  return {
    providers: settings.providers.map((provider) =>
      provider.providerId === providerId
        ? {
            ...provider,
            displayName: normalizeOptionalText(draft.displayName),
            defaultModel: normalizeOptionalText(draft.defaultModel),
            defaultProfileId,
            preferredSource:
              providerId === 'gemini' ? draft.preferredSource : provider.preferredSource ?? null,
          }
        : provider,
    ),
  } satisfies AiRuntimeSettings
}

function SessionSetupCard({
  games,
  sessions,
  selectedGameId,
  selectedSessionId,
  activeGameLabel,
  syncLabel,
  turnLabel,
  statusLabel,
  winnerLabel,
  isCheck,
  error,
  onCreateSession,
  onGameChange,
  onSessionChange,
  onRefreshSession,
  onResetSession,
  onOpenAiSettings,
}: SessionSetupCardProps) {
  const { language, setLanguage, t } = useI18n()
  const filteredSessions = sessions.filter((session) => session.gameId === selectedGameId)

  return (
    <div className="app-toolbar" role="toolbar" aria-label={t('toolbar.aria')}>
      <div className="app-toolbar-row app-toolbar-row-primary">
        <div className="app-brand">
          <span className="app-brand-label">Human Agent Playground</span>
          <span className="app-brand-context">{activeGameLabel}</span>
        </div>

        <div className="app-toolbar-controls">
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
              <option value="en">{t('toolbar.language.en')}</option>
              <option value="zh-CN">{t('toolbar.language.zh-CN')}</option>
            </select>
          </label>

          <label className="toolbar-field">
            <span>{t('toolbar.session')}</span>
            <select
              aria-label={t('toolbar.session')}
              value={selectedSessionId ?? ''}
              onChange={(event) => onSessionChange?.(event.target.value)}
              disabled={filteredSessions.length === 0 || !onSessionChange}
            >
              {filteredSessions.length === 0 ? (
                <option value="">{t('toolbar.noSessions')}</option>
              ) : null}
              {filteredSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatSessionOption(session)}
                </option>
              ))}
            </select>
          </label>

          <button className="primary-button toolbar-button" type="button" onClick={onCreateSession}>
            {t('toolbar.createSession')}
          </button>
        </div>
      </div>

      <div className="app-toolbar-row app-toolbar-row-secondary">
        <div className="status-strip" aria-label="Session status">
          <span>
            {t('meta.game')}: {activeGameLabel}
          </span>
          <span>
            {t('meta.sync')}: {syncLabel}
          </span>
          <span>
            {t('meta.turn')}: {turnLabel}
          </span>
          <span>
            {t('meta.status')}: {statusLabel}
          </span>
          <span>
            {t('meta.winner')}: {winnerLabel}
          </span>
          {isCheck ? (
            <span>
              {t('meta.check')}: {t('meta.checkActive')}
            </span>
          ) : null}
        </div>

        <div className="app-toolbar-actions">
          {onOpenAiSettings ? (
            <button className="secondary-button toolbar-button" type="button" onClick={onOpenAiSettings}>
              {t('toolbar.aiSettings')}
            </button>
          ) : null}
          {selectedSessionId && onRefreshSession ? (
            <button
              className="secondary-button toolbar-button"
              type="button"
              onClick={onRefreshSession}
            >
              {t('toolbar.refresh')}
            </button>
          ) : null}
          {selectedSessionId && onResetSession ? (
            <button className="secondary-button toolbar-button" type="button" onClick={onResetSession}>
              {t('toolbar.reset')}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="toolbar-inline-alert" role="alert">
          <strong>{t('hero.error')}</strong>
          <p>{error}</p>
        </div>
      ) : null}
    </div>
  )
}

function PlayersPanel({
  players,
  restartingSide,
  onOpenEditPlayers,
  onRestartAi,
}: PlayersPanelProps) {
  const { language, t } = useI18n()

  if (players.length === 0) {
    return null
  }

  return (
    <section className="players-panel">
      <div className="players-panel-header">
        <div>
          <p className="eyebrow">{t('players.title')}</p>
          <h2>{t('players.title')}</h2>
        </div>
        {onOpenEditPlayers ? (
          <button className="secondary-button players-edit-button" type="button" onClick={onOpenEditPlayers}>
            {t('players.edit')}
          </button>
        ) : null}
      </div>

      <div className="players-panel-list" role="list" aria-label={t('players.title')}>
        {players.map((item) => (
          <article
            key={item.side}
            className={`players-seat-card is-${item.status}`}
            title={item.lastError ?? undefined}
            role="listitem"
          >
            <div className="players-seat-card-header">
              <strong>{getSideLabel(language, item.side)}</strong>
              <span className={`players-seat-status status-${item.status}`}>
                <span className="players-seat-status-dot" aria-hidden="true" />
                <span>{item.statusLabel}</span>
              </span>
            </div>
            <p className="players-seat-launcher">{item.launcherLabel}</p>
            {item.lastError ? <p className="players-seat-error">{item.lastError}</p> : null}
            {item.canRestart && onRestartAi ? (
              <button
                className="secondary-button players-restart-button"
                type="button"
                onClick={() => onRestartAi(item.side)}
                disabled={restartingSide === item.side}
              >
                {restartingSide === item.side ? t('ai.restarting') : t('ai.restart')}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}

function AppContent() {
  const { language, t } = useI18n()
  const [games, setGames] = useState<GameCatalogItem[]>([])
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [session, setSession] = useState<GameSession | null>(null)
  const [providers, setProviders] = useState<ProviderCapability[]>([])
  const [profiles, setProfiles] = useState<AuthProfileSummary[]>([])
  const [runtimeSettings, setRuntimeSettings] = useState<AiRuntimeSettings>({ providers: [] })
  const [providerDrafts, setProviderDrafts] = useState<
    Record<AiRuntimeProviderId, ProviderSettingsDraft>
  >(() =>
    buildProviderDraftMap({ providers: [] }, []),
  )
  const [editSeatLauncherDrafts, setEditSeatLauncherDrafts] = useState<
    Record<string, SeatLauncherDraft>
  >({})
  const [createSeatLauncherDrafts, setCreateSeatLauncherDrafts] = useState<
    Record<string, SeatLauncherDraft>
  >({})
  const [selectedGameId, setSelectedGameId] = useState('chess')
  const [createSessionGameId, setCreateSessionGameId] = useState('chess')
  const [syncState, setSyncState] = useState<LiveSyncState>('offline')
  const [error, setError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [playerDialogError, setPlayerDialogError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(true)
  const [providerBusyId, setProviderBusyId] = useState<string | null>(null)
  const [playersBusy, setPlayersBusy] = useState(false)
  const [restartingSide, setRestartingSide] = useState<string | null>(null)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [createSessionOpen, setCreateSessionOpen] = useState(false)
  const [editPlayersOpen, setEditPlayersOpen] = useState(false)
  const [focusedRuntimeProviderId, setFocusedRuntimeProviderId] =
    useState<AiRuntimeProviderId | null>(null)
  const [aiNotice, setAiNotice] = useState<string | null>(null)
  const [activeGameOverSessionKey, setActiveGameOverSessionKey] = useState<string | null>(null)
  const previousStatusBySessionRef = useRef<Map<string, string>>(new Map())

  const activeGame = games.find((game) => game.id === (session?.gameId ?? selectedGameId))

  function applySessionSnapshot(nextSession: GameSession) {
    setSession((current) => pickFresherSession(current, nextSession))
    setSessions((current) => upsertSessionCollection(current, nextSession))
  }

  async function loadAiRuntime() {
    setAiLoading(true)

    try {
      const payload = await getAiRuntimeSettings()
      setProviders(payload.providers)
      setProfiles(payload.profiles)
      setRuntimeSettings(payload.settings)
      setProviderDrafts(buildProviderDraftMap(payload.settings, payload.providers))
      setAiError(null)
    } catch (nextError) {
      setAiError(nextError instanceof Error ? nextError.message : 'Failed to load AI runtime')
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        setLoading(true)
        const { games: availableGames, sessions: existingSessions, session: active } =
          await loadBootstrapPayload()
        if (!cancelled) {
          setGames(availableGames)
          setSessions(existingSessions)
          setSelectedGameId(active.gameId)
          setCreateSessionGameId(resolvePreferredGameId(availableGames))
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
    void loadAiRuntime()
  }, [])

  useEffect(() => {
    if (!session) {
      setSyncState('offline')
      return
    }

    const stream = openSessionStream(
      session.id,
      (nextSession) => {
        applySessionSnapshot(nextSession)
      },
      setSyncState,
    )

    return () => {
      stream.close()
    }
  }, [session?.id])

  useEffect(() => {
    if (editPlayersOpen) {
      return
    }

    setEditSeatLauncherDrafts((current) =>
      buildSeatLauncherDraftMap(session, activeGame, providers, runtimeSettings, current),
    )
  }, [editPlayersOpen, session?.id, session?.updatedAt, activeGame?.id, providers, runtimeSettings])

  useEffect(() => {
    if (!createSessionOpen) {
      return
    }

    const selectedGame = games.find((candidate) => candidate.id === createSessionGameId)
    if (!selectedGame) {
      setCreateSeatLauncherDrafts({})
      return
    }

    const sides = resolveGameSides(selectedGame)

    setCreateSeatLauncherDrafts((current) =>
      buildSeatLauncherDraftMapForSides(
        sides,
        providers,
        runtimeSettings,
        current,
      ),
    )
  }, [createSessionOpen, createSessionGameId, games, providers, runtimeSettings])

  async function refreshSession(sessionId: string) {
    const [latest, latestSessions] = await Promise.all([getSession(sessionId), listSessions()])
    applySessionSnapshot(latest)
    setSessions((current) => {
      let merged = [...current]
      for (const candidate of latestSessions) {
        merged = upsertSessionCollection(merged, candidate)
      }
      return sortSessionsByUpdatedAt(merged)
    })
    return latest
  }

  function openAiSettingsForLauncherError(
    nextError: unknown,
    side: string,
    drafts: Record<string, SeatLauncherDraft>,
  ) {
    const requestError =
      nextError instanceof RequestError
        ? nextError
        : typeof nextError === 'object' && nextError !== null && 'code' in nextError
          ? (nextError as RequestError)
          : null

    if (!requestError || !['config_missing', 'cli_unavailable', 'test_failed'].includes(requestError.code ?? '')) {
      return
    }

    const draft = drafts[side]
    const providerId =
      resolveProviderIdFromRequestError(requestError) ??
      (draft ? mapLauncherToProviderSettingId(draft.launcher) : null)

    if (!providerId) {
      return
    }

    setFocusedRuntimeProviderId(providerId)
    setAiSettingsOpen(true)
  }

  function handleOpenCreateSession() {
    const nextGameId =
      (selectedGameId && games.some((candidate) => candidate.id === selectedGameId)
        ? selectedGameId
        : null) ??
      (games.length > 0 ? resolvePreferredGameId(games) : createSessionGameId)
    const selectedGame = games.find((candidate) => candidate.id === nextGameId)
    setPlayerDialogError(null)
    setCreateSessionGameId(nextGameId)
    setCreateSeatLauncherDrafts(
      selectedGame
        ? buildSeatLauncherDraftMapForSides(resolveGameSides(selectedGame), providers, runtimeSettings)
        : {},
    )
    setCreateSessionOpen(true)
  }

  async function handleCreateSession() {
    const selectedGame = games.find((candidate) => candidate.id === createSessionGameId)
    if (!selectedGame) {
      return
    }

    try {
      setPlayersBusy(true)
      setError(null)
      setPlayerDialogError(null)
      const sides = resolveGameSides(selectedGame)
      const seatLaunchers = Object.fromEntries(
        sides.map((side) => [
          side,
          buildSeatLauncherCreateInput(
            createSeatLauncherDrafts[side] ??
              createSeatLauncherDraft(undefined, providers, runtimeSettings),
          ),
        ]),
      )
      const nextSession = await createSession({
        gameId: selectedGame.id,
        seatLaunchers,
      })
      const latestSessions = sortSessionsByUpdatedAt(await listSessions())
      setSelectedGameId(nextSession.gameId)
      applySessionSnapshot(nextSession)
      setSessions((current) => {
        let merged = [...current]
        for (const candidate of latestSessions) {
          merged = upsertSessionCollection(merged, candidate)
        }
        return sortSessionsByUpdatedAt(merged)
      })
      setCreateSessionOpen(false)
    } catch (nextError) {
      setPlayerDialogError(
        nextError instanceof Error ? nextError.message : 'Session creation failed',
      )

      const failingSide = resolveGameSides(selectedGame).find(
        (side) => (createSeatLauncherDrafts[side]?.launcher ?? 'human') !== 'human',
      )
      if (failingSide) {
        openAiSettingsForLauncherError(nextError, failingSide, createSeatLauncherDrafts)
      }
    } finally {
      setPlayersBusy(false)
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
      applySessionSnapshot(updated)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Reset failed')
    }
  }

  async function handleSessionChange(sessionId: string) {
    if (!sessionId) {
      return
    }

    try {
      setError(null)
      const nextSession = await getSession(sessionId)
      setSelectedGameId(nextSession.gameId)
      applySessionSnapshot(nextSession)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Session switch failed')
    }
  }

  async function handleGameChange(gameId: string) {
    setSelectedGameId(gameId)
    if (session?.gameId === gameId) {
      return
    }

    const matchingSession = sessions.find((candidate) => candidate.gameId === gameId) ?? null
    if (!matchingSession) {
      setSession(null)
      setSyncState('offline')
      return
    }

    await handleSessionChange(matchingSession.id)
  }

  function handleProviderDraftChange(
    providerId: AiRuntimeProviderId,
    patch: Partial<ProviderSettingsDraft>,
  ) {
    setAiNotice(null)
    setProviderDrafts((current) => ({
      ...current,
      [providerId]: {
        ...current[providerId],
        ...patch,
      },
    }))
  }

  async function handleSaveProviderSettings(providerId: AiRuntimeProviderId) {
    const draft = providerDrafts[providerId]
    const currentSetting = resolveSettingsProvider(runtimeSettings, providerId)

    if (!draft || !currentSetting) {
      return
    }

    try {
      setProviderBusyId(providerId)

      let defaultProfileId = currentSetting.defaultProfileId
      if (providerNeedsCredential(providerId, draft)) {
        const providerKey = resolveProviderProfileId(providerId, draft)
        if (!providerKey) {
          throw new RequestError('This provider requires a supported profile type.', 'config_missing', {
            providerId,
          })
        }

        const credentialValue = normalizeOptionalText(draft.credentialValue)
        if (credentialValue) {
          const result = await createAuthProfile({
            name: normalizeOptionalText(draft.displayName) ?? `${providerId} default`,
            provider: providerKey,
            credentialType: draft.credentialType,
            credentialValue,
            email: normalizeOptionalText(draft.email) ?? undefined,
          })
          defaultProfileId = result.id
        } else if (defaultProfileId) {
          await updateAuthProfile(defaultProfileId, {
            name: normalizeOptionalText(draft.displayName) ?? undefined,
            enabled: true,
            credentialType: draft.credentialType,
            email: normalizeOptionalText(draft.email),
          })
        } else {
          throw new RequestError('No credential configured for this provider.', 'config_missing', {
            providerId,
          })
        }
      } else {
        defaultProfileId = providerId === 'gemini' ? currentSetting.defaultProfileId : null
      }

      const nextSettings = buildNextRuntimeSettings(
        runtimeSettings,
        providerId,
        draft,
        defaultProfileId ?? null,
      )

      await saveAiRuntimeSettings(nextSettings)
      await loadAiRuntime()
      setAiError(null)
      setAiNotice(t('ai.notice.saved', { provider: getRuntimeProviderLabel(t, providerId) }))
    } catch (nextError) {
      setAiNotice(null)
      setAiError(
        nextError instanceof Error ? nextError.message : 'Failed to save AI provider settings',
      )
    } finally {
      setProviderBusyId(null)
    }
  }

  async function handleTestProvider(providerId: AiRuntimeProviderId) {
    const draft = providerDrafts[providerId]
    const setting = resolveSettingsProvider(runtimeSettings, providerId)
    if (!draft || !setting) {
      return
    }

    try {
      setProviderBusyId(providerId)

      if (providerNeedsCredential(providerId, draft)) {
        if (!setting.defaultProfileId) {
          throw new RequestError('No saved connection exists for this provider.', 'config_missing', {
            providerId,
          })
        }

        const result = await testAuthProfile(setting.defaultProfileId)
        if (result.available) {
          setAiError(null)
          setAiNotice(t('ai.notice.testReady', { provider: getRuntimeProviderLabel(t, providerId) }))
        } else {
          setAiNotice(null)
          setAiError(`${providerId} is currently unavailable.`)
        }
        return
      }

      const capabilityId =
        providerId === 'codex'
          ? 'codex-cli'
          : providerId === 'claude_code'
            ? 'claude-code'
            : providerId === 'gemini'
              ? 'gemini-cli'
              : providerId

      const capability = providers.find((provider) => provider.id === capabilityId)
      if (capability?.status === 'not_logged_in') {
        throw new RequestError(
          t('ai.notice.cliNotLoggedIn', {
            provider: getRuntimeProviderLabel(t, providerId),
          }),
          'config_missing',
          {
            providerId,
          },
        )
      }

      if (!capability?.available) {
        throw new RequestError(`${providerId} is unavailable on this machine.`, 'cli_unavailable', {
          providerId,
        })
      }

      setAiError(null)
      setAiNotice(t('ai.notice.testReady', { provider: getRuntimeProviderLabel(t, providerId) }))
    } catch (nextError) {
      setAiNotice(null)
      setAiError(
        nextError instanceof Error ? nextError.message : 'Failed to test AI provider settings',
      )
    } finally {
      setProviderBusyId(null)
    }
  }

  function handleEditSeatLauncherDraftChange(side: string, patch: Partial<SeatLauncherDraft>) {
    setEditSeatLauncherDrafts((current) => ({
      ...current,
      [side]: {
        ...createSeatLauncherDraft(session?.aiSeats?.[side], providers, runtimeSettings),
        ...current[side],
        ...patch,
      },
    }))
  }

  function handleCreateSeatLauncherDraftChange(side: string, patch: Partial<SeatLauncherDraft>) {
    setCreateSeatLauncherDrafts((current) => ({
      ...current,
      [side]: {
        ...createSeatLauncherDraft(undefined, providers, runtimeSettings),
        ...current[side],
        ...patch,
      },
    }))
  }

  async function handleSavePlayers() {
    if (!session || !activeGame) {
      return
    }

    try {
      setPlayersBusy(true)
      setPlayerDialogError(null)
      const sides = resolveGameSides(activeGame, session)
      const updated = await updateAiSeatLaunchers(
        session.id,
        Object.fromEntries(
          sides.map((side) => {
            const draft =
              editSeatLauncherDrafts[side] ??
              createSeatLauncherDraft(session.aiSeats?.[side], providers, runtimeSettings)
            return [
              side,
              {
                launcher: draft.launcher,
                model: draft.launcher === 'human' ? undefined : draft.model || undefined,
                autoPlay: draft.launcher === 'human' ? undefined : draft.autoPlay,
              },
            ]
          }),
        ),
      )
      applySessionSnapshot(updated)

      setEditPlayersOpen(false)
      setAiError(null)
    } catch (nextError) {
      setPlayerDialogError(
        nextError instanceof Error ? nextError.message : 'Failed to save player setup',
      )
      const failingSide = resolveGameSides(activeGame, session).find(
        (side) => (editSeatLauncherDrafts[side]?.launcher ?? 'human') !== 'human',
      )
      if (failingSide) {
        openAiSettingsForLauncherError(nextError, failingSide, editSeatLauncherDrafts)
      }
    } finally {
      setPlayersBusy(false)
    }
  }

  async function handleRestartAi(side: string) {
    if (!session) {
      return
    }

    const seat = session.aiSeats?.[side]
    if (!seat?.enabled || seat.launcher === 'human') {
      return
    }

    try {
      setRestartingSide(side)
      setAiError(null)
      const updated = await updateAiSeatLauncher(session.id, side, {
        launcher: seat.launcher,
        model: seat.model || undefined,
        autoPlay: seat.autoPlay,
      })
      applySessionSnapshot(updated)
    } catch (nextError) {
      setAiError(nextError instanceof Error ? nextError.message : 'Failed to restart AI seat')
      openAiSettingsForLauncherError(nextError, side, {
        [side]: createSeatLauncherDraft(seat, providers, runtimeSettings),
      })
    } finally {
      setRestartingSide(null)
    }
  }

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
  const playerSummaries: PlayerSummary[] =
    session && activeGame
      ? resolveGameSides(activeGame, session).map((side) => {
          const seat = session.aiSeats?.[side]
          const launcher = seat?.enabled ? (seat.launcher ?? 'human') : 'human'
          const status = seat?.enabled ? (seat.status ?? 'idle') : 'idle'

          return {
            side,
            launcherLabel: getLauncherDisplayLabel(t, launcher),
            status,
            statusLabel: getAiSeatStatusLabel(language, status),
            lastError: seat?.lastError ?? null,
            canRestart: Boolean(
              seat?.enabled &&
                seat.launcher !== 'human' &&
                status === 'errored',
            ),
          }
        })
      : []
  const activeThinkingPlayer = playerSummaries.find((item) => item.status === 'thinking')
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

  function handleOpenEditPlayers() {
    if (!session || !activeGame) {
      return
    }

    setPlayerDialogError(null)
    setEditSeatLauncherDrafts(
      buildSeatLauncherDraftMap(session, activeGame, providers, runtimeSettings, {}),
    )
    setEditPlayersOpen(true)
  }

  return (
    <main className="app-shell">
      <header className="app-chrome">
        <SessionSetupCard
          games={games}
          sessions={sessions}
          selectedGameId={selectedGameId}
          selectedSessionId={session?.id}
          activeGameLabel={activeGameLabel}
          syncLabel={getSyncStateLabel(language, syncState)}
          turnLabel={summary ? getWinnerLabel(language, summary.turn) : '...'}
          statusLabel={summary ? getStatusLabel(language, summary.status) : '...'}
          winnerLabel={summary ? getWinnerLabel(language, summary.winner) : t('winner.none')}
          isCheck={Boolean(isCheck)}
          error={error}
          onCreateSession={handleOpenCreateSession}
          onGameChange={(gameId) => {
            void handleGameChange(gameId)
          }}
          onSessionChange={handleSessionChange}
          onRefreshSession={handleRefreshSession}
          onResetSession={handleResetSession}
          onOpenAiSettings={() => {
            setFocusedRuntimeProviderId(null)
            setAiSettingsOpen(true)
          }}
        />
      </header>

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
            sideRailHeader={
              <PlayersPanel
                players={playerSummaries}
                restartingSide={restartingSide}
                onOpenEditPlayers={handleOpenEditPlayers}
                onRestartAi={handleRestartAi}
              />
            }
            setupPanel={
              activeThinkingPlayer ? (
                <li
                  className="message-feed-item message-feed-item-system message-feed-item-pending"
                  role="status"
                  aria-live="polite"
                >
                  <article className="message-feed-bubble">
                    <p className="message-feed-meta">restflow-bridge</p>
                    <strong>{t('ai.status.thinking')}</strong>
                    <p className="message-feed-summary message-feed-summary-pending">
                      <span className="message-feed-pending-dot" aria-hidden="true" />
                      <span>
                        {t('ai.activity.thinking', {
                          side: getSideLabel(language, activeThinkingPlayer.side),
                          launcher: activeThinkingPlayer.launcherLabel,
                        })}
                      </span>
                    </p>
                  </article>
                </li>
              ) : null
            }
            onSessionUpdate={applySessionSnapshot}
            onError={setError}
          />
        )}
      </section>

      <AiSettingsDialog
        open={aiSettingsOpen}
        focusedProviderId={focusedRuntimeProviderId}
        providers={providers}
        profiles={profiles}
        settings={runtimeSettings}
        drafts={providerDrafts}
        loading={aiLoading}
        error={aiError}
        notice={aiNotice}
        busyProviderId={providerBusyId}
        onClose={() => {
          setAiSettingsOpen(false)
          setFocusedRuntimeProviderId(null)
        }}
        onRefresh={loadAiRuntime}
        onDraftChange={handleProviderDraftChange}
        onSaveProvider={handleSaveProviderSettings}
        onTestProvider={handleTestProvider}
      />

      <SeatLauncherDialog
        open={createSessionOpen}
        mode="create"
        game={games.find((candidate) => candidate.id === createSessionGameId)}
        games={games}
        selectedGameId={createSessionGameId}
        providers={providers}
        settings={runtimeSettings}
        drafts={createSeatLauncherDrafts}
        saving={playersBusy}
        error={playerDialogError}
        onClose={() => {
          setCreateSessionOpen(false)
          setPlayerDialogError(null)
        }}
        onSubmit={handleCreateSession}
        onDraftChange={handleCreateSeatLauncherDraftChange}
        onGameChange={(gameId) => {
          setCreateSessionGameId(gameId)
          setPlayerDialogError(null)
        }}
      />

      <SeatLauncherDialog
        open={editPlayersOpen}
        mode="edit"
        game={activeGame}
        games={games}
        selectedGameId={activeGame?.id ?? selectedGameId}
        providers={providers}
        settings={runtimeSettings}
        drafts={editSeatLauncherDrafts}
        saving={playersBusy}
        error={playerDialogError}
        onClose={() => {
          setEditPlayersOpen(false)
          setPlayerDialogError(null)
        }}
        onSubmit={handleSavePlayers}
        onDraftChange={handleEditSeatLauncherDraftChange}
      />
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
