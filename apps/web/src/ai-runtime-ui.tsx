import type {
  AiLauncherId,
  AiRuntimeProviderId,
  AiRuntimeProviderSetting,
  AiRuntimeSettings,
  AiSeatConfig,
  AuthProfileSummary,
  GameCatalogItem,
  GameSession,
  ProviderCapability,
} from '@human-agent-playground/core'

import { getAiSeatStatusLabel, getGameLabel, getSideLabel, useI18n } from './i18n'

export interface ProviderSettingsDraft {
  displayName: string
  credentialType: 'api_key' | 'token'
  credentialValue: string
  email: string
  defaultModel: string
  preferredSource: 'api' | 'cli'
}

export interface SeatLauncherDraft {
  launcher: AiLauncherId
  model: string
  autoPlay: boolean
  promptOverride: string
  timeoutMs: number
  providerProfileId: string
  advancedOpen: boolean
}

const launcherOptions: AiLauncherId[] = [
  'human',
  'codex',
  'claude_code',
  'openai',
  'anthropic',
  'gemini',
]

const settingsProviderOrder: AiRuntimeProviderId[] = [
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

export function mapLauncherToProviderSettingId(
  launcher: AiLauncherId,
): AiRuntimeProviderId | null {
  if (launcher === 'human') {
    return null
  }

  return launcher
}

function providerLabel(providerId: AiRuntimeProviderId) {
  switch (providerId) {
    case 'openai':
      return 'OpenAI'
    case 'anthropic':
      return 'Anthropic'
    case 'codex':
      return 'Codex'
    case 'claude_code':
      return 'Claude Code'
    case 'gemini':
      return 'Gemini'
  }
}

function launcherLabel(t: ReturnType<typeof useI18n>['t'], launcher: AiLauncherId) {
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

function resolveProviderSetting(
  settings: AiRuntimeSettings,
  providerId: AiRuntimeProviderId,
): AiRuntimeProviderSetting | undefined {
  return settings.providers.find((provider) => provider.providerId === providerId)
}

function resolveCapabilityIds(
  launcher: AiLauncherId,
  settings: AiRuntimeSettings,
): string[] {
  switch (launcher) {
    case 'openai':
      return ['openai']
    case 'anthropic':
      return ['anthropic']
    case 'codex':
      return ['codex-cli']
    case 'claude_code':
      return ['claude-code']
    case 'gemini': {
      const setting = resolveProviderSetting(settings, 'gemini')
      return setting?.preferredSource === 'cli' ? ['gemini-cli'] : ['google']
    }
    default:
      return []
  }
}

export function getLauncherModelOptions(
  launcher: AiLauncherId,
  providers: ProviderCapability[],
  settings: AiRuntimeSettings,
) {
  const providerIds = resolveCapabilityIds(launcher, settings)
  return providers
    .filter((provider) => providerIds.includes(provider.id))
    .flatMap((provider) =>
      provider.models.map((model) => ({
        id: model.id,
        label: model.label,
        providerLabel: provider.label,
      })),
    )
}

export function createSeatLauncherDraft(
  seat: AiSeatConfig | undefined,
  providers: ProviderCapability[],
  settings: AiRuntimeSettings,
): SeatLauncherDraft {
  const launcher = seat?.enabled ? (seat.launcher ?? 'human') : 'human'
  const modelOptions = getLauncherModelOptions(launcher, providers, settings)

  return {
    launcher,
    model: seat?.model ?? modelOptions[0]?.id ?? '',
    autoPlay: seat?.autoPlay ?? true,
    promptOverride: seat?.promptOverride ?? '',
    timeoutMs: seat?.timeoutMs ?? 60_000,
    providerProfileId: seat?.providerProfileId ?? '',
    advancedOpen: false,
  }
}

export function createProviderSettingsDraft(
  providerId: AiRuntimeProviderId,
  settings: AiRuntimeSettings,
  providers: ProviderCapability[],
): ProviderSettingsDraft {
  const setting = resolveProviderSetting(settings, providerId)
  const models = getLauncherModelOptions(providerId, providers, settings)

  return {
    displayName: setting?.displayName ?? '',
    credentialType: 'api_key',
    credentialValue: '',
    email: '',
    defaultModel: setting?.defaultModel ?? models[0]?.id ?? '',
    preferredSource: setting?.preferredSource ?? 'api',
  }
}

function profileLabel(profile: AuthProfileSummary) {
  return `${profile.name}`
}

function filterProfilesForLauncher(
  launcher: AiLauncherId,
  profiles: AuthProfileSummary[],
  settings: AiRuntimeSettings,
) {
  if (launcher === 'human' || launcher === 'codex' || launcher === 'claude_code') {
    return []
  }

  if (launcher === 'gemini') {
    const provider = resolveProviderSetting(settings, 'gemini')?.preferredSource === 'cli' ? null : 'google'
    return provider ? profiles.filter((profile) => profile.provider === provider) : []
  }

  return profiles.filter((profile) => profile.provider === launcher)
}

function resolveGameSides(
  game: GameCatalogItem | undefined,
  session?: GameSession | null,
) {
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

interface AiSeatLauncherStripProps {
  session: GameSession | null
  game: GameCatalogItem | undefined
  providers: ProviderCapability[]
  profiles: AuthProfileSummary[]
  settings: AiRuntimeSettings
  drafts: Record<string, SeatLauncherDraft>
  seatSavingSide: string | null
  onDraftChange: (side: string, patch: Partial<SeatLauncherDraft>) => void
  onStart: (side: string) => Promise<void>
  onStop: (side: string) => Promise<void>
}

export function AiSeatLauncherStrip({
  session,
  game,
  providers,
  profiles,
  settings,
  drafts,
  seatSavingSide,
  onDraftChange,
  onStart,
  onStop,
}: AiSeatLauncherStripProps) {
  const { language, t } = useI18n()

  if (!session || !game) {
    return null
  }

  const sides =
    Array.isArray(game.sides) && game.sides.length > 0
      ? game.sides
      : Object.keys(session.aiSeats ?? {})

  return (
    <section className="ai-seat-strip panel-card">
      <div className="ai-seat-strip-header">
        <div>
          <p className="eyebrow">AI Seats</p>
          <h2>{t('ai.seats')}</h2>
        </div>
      </div>
      <div className="ai-seat-strip-grid">
        {sides.map((side) => {
          const seat = session.aiSeats?.[side]
          const draft = drafts[side] ?? createSeatLauncherDraft(seat, providers, settings)
          const modelOptions = getLauncherModelOptions(draft.launcher, providers, settings)
          const profileOptions = filterProfilesForLauncher(draft.launcher, profiles, settings)
          const running = Boolean(seat?.enabled && seat.launcher !== 'human')

          return (
            <article key={side} className="ai-seat-launcher-card">
              <div className="ai-provider-card-header">
                <strong>{getSideLabel(language, side)}</strong>
                <span className="meta-badge">{getAiSeatStatusLabel(language, seat?.status)}</span>
              </div>

              <label className="toolbar-field">
                <span>{t('ai.launcher')}</span>
                <select
                  aria-label={`${t('ai.launcher')} ${side}`}
                  value={draft.launcher}
                  onChange={(event) => {
                    const launcher = event.target.value as AiLauncherId
                    const nextModelOptions = getLauncherModelOptions(launcher, providers, settings)
                    onDraftChange(side, {
                      launcher,
                      model: nextModelOptions[0]?.id ?? '',
                      autoPlay: launcher === 'human' ? false : true,
                    })
                  }}
                >
                  {launcherOptions.map((option) => (
                    <option key={option} value={option}>
                      {launcherLabel(t, option)}
                    </option>
                  ))}
                </select>
              </label>

              {draft.launcher !== 'human' ? (
                <label className="toolbar-field">
                  <span>{t('ai.seat.model')}</span>
                  <select
                    aria-label={`${t('ai.seat.model')} ${side}`}
                    value={draft.model}
                    onChange={(event) => onDraftChange(side, { model: event.target.value })}
                  >
                    <option value="">--</option>
                    {modelOptions.map((option) => (
                      <option key={`${side}:${option.id}`} value={option.id}>
                        {option.providerLabel} · {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="ai-seat-launcher-actions">
                {running ? (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={seatSavingSide === side}
                    onClick={() => void onStop(side)}
                  >
                    {t('ai.stop')}
                  </button>
                ) : null}
                {draft.launcher !== 'human' ? (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={seatSavingSide === side}
                    onClick={() => void onStart(side)}
                  >
                    {t('ai.start')}
                  </button>
                ) : null}
              </div>

              {seat?.runtimeSource ? (
                <p className="ai-runtime-copy">{t('ai.seat.runtime', { runtime: seat.runtimeSource })}</p>
              ) : null}
              {seat?.lastError ? (
                <p className="ai-runtime-error">{t('ai.seat.error', { error: seat.lastError })}</p>
              ) : null}

              <details
                className="ai-seat-advanced"
                open={draft.advancedOpen}
                onToggle={(event) =>
                  onDraftChange(side, {
                    advancedOpen: (event.currentTarget as HTMLDetailsElement).open,
                  })
                }
              >
                <summary>{t('ai.advanced')}</summary>
                <div className="ai-seat-advanced-grid">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={draft.autoPlay}
                      onChange={(event) => onDraftChange(side, { autoPlay: event.target.checked })}
                    />
                    <span>{t('ai.seat.autoPlay')}</span>
                  </label>
                  <label className="toolbar-field">
                    <span>{t('ai.seat.timeout')}</span>
                    <input
                      type="number"
                      min={1000}
                      max={600000}
                      step={1000}
                      value={draft.timeoutMs}
                      onChange={(event) =>
                        onDraftChange(side, {
                          timeoutMs: Number(event.target.value) || 60_000,
                        })
                      }
                    />
                  </label>
                  {profileOptions.length > 0 ? (
                    <label className="toolbar-field">
                      <span>{t('ai.seat.profile')}</span>
                      <select
                        aria-label={`${t('ai.seat.profile')} ${side}`}
                        value={draft.providerProfileId}
                        onChange={(event) => onDraftChange(side, { providerProfileId: event.target.value })}
                      >
                        <option value="">{t('ai.seat.none')}</option>
                        {profileOptions.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profileLabel(profile)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="toolbar-field ai-seat-prompt-field">
                    <span>{t('ai.seat.prompt')}</span>
                    <textarea
                      rows={3}
                      value={draft.promptOverride}
                      onChange={(event) => onDraftChange(side, { promptOverride: event.target.value })}
                    />
                  </label>
                </div>
              </details>
            </article>
          )
        })}
      </div>
    </section>
  )
}

interface PlayersSummaryBarProps {
  session: GameSession | null
  game: GameCatalogItem | undefined
  onEdit: () => void
}

export function PlayersSummaryBar({ session, game, onEdit }: PlayersSummaryBarProps) {
  const { language, t } = useI18n()

  if (!session || !game) {
    return null
  }

  const sides = resolveGameSides(game, session)
  if (sides.length === 0) {
    return null
  }

  return (
    <section className="players-summary panel-card">
      <div className="players-summary-header">
        <div>
          <p className="eyebrow">Players</p>
          <h2>{t('players.title')}</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onEdit}>
          {t('players.edit')}
        </button>
      </div>
      <div className="players-summary-list">
        {sides.map((side) => {
          const seat = session.aiSeats?.[side]
          const launcher = seat?.enabled ? (seat.launcher ?? 'human') : 'human'

          return (
            <div key={side} className="players-summary-item">
              <strong>{getSideLabel(language, side)}</strong>
              <span>{launcherLabel(t, launcher)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

interface SeatLauncherDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  game: GameCatalogItem | undefined
  games: GameCatalogItem[]
  selectedGameId: string
  providers: ProviderCapability[]
  settings: AiRuntimeSettings
  drafts: Record<string, SeatLauncherDraft>
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: () => Promise<void>
  onDraftChange: (side: string, patch: Partial<SeatLauncherDraft>) => void
  onGameChange?: (gameId: string) => void
}

export function SeatLauncherDialog({
  open,
  mode,
  game,
  games,
  selectedGameId,
  providers,
  settings,
  drafts,
  saving,
  error,
  onClose,
  onSubmit,
  onDraftChange,
  onGameChange,
}: SeatLauncherDialogProps) {
  const { language, t } = useI18n()

  if (!open || !game) {
    return null
  }

  const sides = resolveGameSides(game)
  if (sides.length === 0) {
    return null
  }

  return (
    <div className="ai-settings-modal" role="presentation">
      <section
        className="seat-launcher-dialog panel-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seat-launcher-dialog-title"
      >
        <div className="ai-settings-header">
          <div>
            <p className="eyebrow">Players</p>
            <h2 id="seat-launcher-dialog-title">
              {mode === 'create' ? t('players.createTitle') : t('players.editTitle')}
            </h2>
            <p className="ai-runtime-copy">
              {mode === 'create' ? t('players.createCopy') : t('players.editCopy')}
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            {t('modal.close')}
          </button>
        </div>

        {error ? <p className="ai-runtime-error">{error}</p> : null}

        <label className="toolbar-field">
          <span>{t('toolbar.game')}</span>
          <select
            aria-label={t('toolbar.game')}
            value={selectedGameId}
            onChange={(event) => onGameChange?.(event.target.value)}
            disabled={!onGameChange}
          >
            {games.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {getGameLabel(language, candidate.id, candidate.shortName)}
              </option>
            ))}
          </select>
        </label>

        <div className="seat-launcher-dialog-grid">
          {sides.map((side) => {
            const draft = drafts[side] ?? createSeatLauncherDraft(undefined, providers, settings)
            const modelOptions = getLauncherModelOptions(draft.launcher, providers, settings)

            return (
              <article key={side} className="seat-launcher-dialog-card">
                <div className="ai-provider-card-header">
                  <strong>{getSideLabel(language, side)}</strong>
                </div>

                <label className="toolbar-field">
                  <span>{t('ai.launcher')}</span>
                  <select
                    aria-label={`${t('ai.launcher')} ${side}`}
                    value={draft.launcher}
                    onChange={(event) => {
                      const launcher = event.target.value as AiLauncherId
                      const nextModelOptions = getLauncherModelOptions(launcher, providers, settings)
                      onDraftChange(side, {
                        launcher,
                        model: launcher === 'human' ? '' : nextModelOptions[0]?.id ?? '',
                        autoPlay: launcher === 'human' ? false : true,
                      })
                    }}
                  >
                    {launcherOptions.map((option) => (
                      <option key={option} value={option}>
                        {launcherLabel(t, option)}
                      </option>
                    ))}
                  </select>
                </label>

                {draft.launcher !== 'human' ? (
                  <>
                    <label className="toolbar-field">
                      <span>{t('ai.seat.model')}</span>
                      <select
                        aria-label={`${t('ai.seat.model')} ${side}`}
                        value={draft.model}
                        onChange={(event) => onDraftChange(side, { model: event.target.value })}
                      >
                        <option value="">{t('players.useDefaultModel')}</option>
                        {modelOptions.map((option) => (
                          <option key={`${side}:${option.id}`} value={option.id}>
                            {option.providerLabel} · {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={draft.autoPlay}
                        onChange={(event) =>
                          onDraftChange(side, { autoPlay: event.target.checked })
                        }
                      />
                      <span>{t('ai.seat.autoPlay')}</span>
                    </label>
                  </>
                ) : null}
              </article>
            )
          })}
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>
            {t('players.cancel')}
          </button>
          <button className="primary-button" type="button" onClick={() => void onSubmit()} disabled={saving}>
            {mode === 'create' ? t('players.createAction') : t('players.saveAction')}
          </button>
        </div>
      </section>
    </div>
  )
}

interface AiSettingsDialogProps {
  open: boolean
  focusedProviderId: AiRuntimeProviderId | null
  providers: ProviderCapability[]
  profiles: AuthProfileSummary[]
  settings: AiRuntimeSettings
  drafts: Record<string, ProviderSettingsDraft>
  loading: boolean
  error: string | null
  notice: string | null
  busyProviderId: string | null
  onClose: () => void
  onRefresh: () => Promise<void>
  onDraftChange: (providerId: AiRuntimeProviderId, patch: Partial<ProviderSettingsDraft>) => void
  onSaveProvider: (providerId: AiRuntimeProviderId) => Promise<void>
  onTestProvider: (providerId: AiRuntimeProviderId) => Promise<void>
}

export function AiSettingsDialog({
  open,
  focusedProviderId,
  providers,
  profiles,
  settings,
  drafts,
  loading,
  error,
  notice,
  busyProviderId,
  onClose,
  onRefresh,
  onDraftChange,
  onSaveProvider,
  onTestProvider,
}: AiSettingsDialogProps) {
  const { t } = useI18n()

  if (!open) {
    return null
  }

  return (
    <div className="ai-settings-modal" role="presentation">
      <section className="ai-settings-dialog panel-card" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
        <div className="ai-settings-header">
          <div>
            <p className="eyebrow">AI Runtime</p>
            <h2 id="ai-settings-title">{t('toolbar.aiSettings')}</h2>
            <p className="ai-runtime-copy">{t('ai.subtitle')}</p>
          </div>
          <div className="ai-settings-actions">
            <button className="secondary-button" type="button" onClick={() => void onRefresh()}>
              {t('ai.refresh')}
            </button>
            <button className="secondary-button" type="button" onClick={onClose}>
              {t('modal.close')}
            </button>
          </div>
        </div>

        {loading ? <p className="empty-state">{t('ai.loading')}</p> : null}
        {error ? <p className="ai-runtime-error">{error}</p> : null}
        {notice ? <p className="ai-runtime-success">{notice}</p> : null}

        <div className="ai-settings-grid">
          {settingsProviderOrder.map((providerId) => {
            const draft = drafts[providerId]
            const setting = resolveProviderSetting(settings, providerId)
            const capabilityIds =
              providerId === 'codex'
                ? ['codex-cli']
                : providerId === 'claude_code'
                  ? ['claude-code']
                  : providerId === 'gemini' && draft?.preferredSource === 'cli'
                    ? ['gemini-cli']
                    : providerId === 'gemini'
                      ? ['google', 'gemini-cli']
                      : [providerId]
            const capabilityList = providers.filter((provider) => capabilityIds.includes(provider.id))
            const modelOptions =
              providerId === 'gemini'
                ? getLauncherModelOptions('gemini', providers, {
                    providers: settings.providers.map((provider) =>
                      provider.providerId === 'gemini'
                        ? {
                            ...provider,
                            preferredSource: draft?.preferredSource ?? provider.preferredSource,
                          }
                        : provider,
                    ),
                  })
                : getLauncherModelOptions(providerId, providers, settings)
            const activeProfile =
              setting?.defaultProfileId
                ? profiles.find((profile) => profile.id === setting.defaultProfileId)
                : null
            const showsCredentialFields =
              providerId === 'openai' ||
              providerId === 'anthropic' ||
              (providerId === 'gemini' && draft?.preferredSource !== 'cli')

            return (
              <article
                key={providerId}
                className={`ai-settings-provider-card${focusedProviderId === providerId ? ' ai-settings-provider-card-focused' : ''}`}
              >
                <div className="ai-provider-card-header">
                  <strong>{providerLabel(providerId)}</strong>
                  <span className="meta-badge">
                    {capabilityList.every((provider) => provider.available) ? t('ai.provider.ready') : t('ai.provider.missing')}
                  </span>
                </div>

                {providerId === 'gemini' ? (
                  <label className="toolbar-field">
                    <span>{t('ai.connectionMode')}</span>
                    <select
                      value={draft?.preferredSource ?? 'api'}
                      onChange={(event) =>
                        onDraftChange(providerId, {
                          preferredSource: event.target.value as 'api' | 'cli',
                        })
                      }
                    >
                      <option value="api">Gemini API</option>
                      <option value="cli">Gemini CLI</option>
                    </select>
                  </label>
                ) : null}

                {showsCredentialFields ? (
                  <label className="toolbar-field">
                    <span>{t('ai.profile.name')}</span>
                    <input
                      value={draft?.displayName ?? ''}
                      onChange={(event) =>
                        onDraftChange(providerId, { displayName: event.target.value })
                      }
                    />
                  </label>
                ) : null}

                {showsCredentialFields ? (
                  <>
                    <label className="toolbar-field">
                      <span>{t('ai.profile.credentialType')}</span>
                      <select
                        value={draft?.credentialType ?? 'api_key'}
                        onChange={(event) =>
                          onDraftChange(providerId, {
                            credentialType: event.target.value as 'api_key' | 'token',
                          })
                        }
                      >
                        <option value="api_key">API Key</option>
                        <option value="token">Token</option>
                      </select>
                    </label>
                    <label className="toolbar-field">
                      <span>{t('ai.profile.credentialValue')}</span>
                      <input
                        type="password"
                        placeholder={activeProfile?.maskedValue ?? ''}
                        value={draft?.credentialValue ?? ''}
                        onChange={(event) => onDraftChange(providerId, { credentialValue: event.target.value })}
                      />
                    </label>
                    <label className="toolbar-field">
                      <span>{t('ai.profile.email')}</span>
                      <input
                        value={draft?.email ?? ''}
                        onChange={(event) => onDraftChange(providerId, { email: event.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <p className="ai-runtime-copy">{t('ai.cliHint')}</p>
                )}

                <label className="toolbar-field">
                  <span>{t('ai.defaultModel')}</span>
                  <select
                    value={draft?.defaultModel ?? ''}
                    onChange={(event) => onDraftChange(providerId, { defaultModel: event.target.value })}
                  >
                    <option value="">--</option>
                    {modelOptions.map((model) => (
                      <option key={`${providerId}:${model.id}`} value={model.id}>
                        {model.providerLabel} · {model.label}
                      </option>
                    ))}
                  </select>
                </label>

                {activeProfile?.maskedValue ? (
                  <p className="ai-runtime-copy">{t('ai.profile.masked', { value: activeProfile.maskedValue })}</p>
                ) : null}

                <div className="ai-profile-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busyProviderId === providerId}
                    onClick={() => void onTestProvider(providerId)}
                  >
                    {t('ai.profile.test')}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busyProviderId === providerId}
                    onClick={() => void onSaveProvider(providerId)}
                  >
                    {t('ai.settings.save')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
