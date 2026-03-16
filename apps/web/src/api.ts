import type {
  AiSeatConfig,
  AiRuntimeSettings,
  CreateAuthProfileInput,
  GameCatalogItem,
  GameSession,
  ProviderCapability,
  SessionStreamEvent,
  UpdateAiSeatInput,
  UpdateAiSeatLauncherInput,
  UpdateAuthProfileInput,
  AuthProfileSummary,
  CreateSessionInput,
} from '@human-agent-playground/core'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8787'

export class RequestError extends Error {
  readonly code?: string
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'RequestError'
    this.code = code
    this.details = details
  }
}

export interface AiRuntimeSettingsPayload {
  settings: AiRuntimeSettings
  providers: ProviderCapability[]
  profiles: AuthProfileSummary[]
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string; code?: string } & Record<string, unknown>)
      | null
    throw new RequestError(payload?.error ?? `Request failed: ${response.status}`, payload?.code, payload ?? undefined)
  }

  return (await response.json()) as T
}

export async function listSessions(): Promise<GameSession[]> {
  const response = await request<{ sessions: GameSession[] }>('/api/sessions')
  return response.sessions
}

export async function listGames(): Promise<GameCatalogItem[]> {
  const response = await request<{ games: GameCatalogItem[] }>('/api/games')
  return response.games
}

export function createSession(input: Partial<CreateSessionInput> = {}): Promise<GameSession> {
  return request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({
      gameId: 'xiangqi',
      actorKind: 'human',
      channel: 'ui',
      ...input,
    }),
  })
}

export function getSession(sessionId: string): Promise<GameSession> {
  return request(`/api/sessions/${sessionId}`)
}

export async function listProviders(): Promise<ProviderCapability[]> {
  const response = await request<{ providers: ProviderCapability[] }>('/api/ai/providers')
  return response.providers
}

export function getAiRuntimeSettings(): Promise<AiRuntimeSettingsPayload> {
  return request('/api/ai/runtime-settings')
}

export async function saveAiRuntimeSettings(
  settings: AiRuntimeSettings,
): Promise<AiRuntimeSettings> {
  const response = await request<{ settings: AiRuntimeSettings }>('/api/ai/runtime-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
  return response.settings
}

export async function listAuthProfiles(): Promise<AuthProfileSummary[]> {
  const response = await request<{ profiles: AuthProfileSummary[] }>('/api/ai/auth-profiles')
  return response.profiles
}

export function createAuthProfile(
  input: CreateAuthProfileInput,
): Promise<{ id: string; created: true }> {
  return request('/api/ai/auth-profiles', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateAuthProfile(
  profileId: string,
  input: UpdateAuthProfileInput,
): Promise<{ id: string; name: string; enabled: boolean; priority: number }> {
  return request(`/api/ai/auth-profiles/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteAuthProfile(profileId: string): Promise<{ deleted: true; id: string }> {
  return request(`/api/ai/auth-profiles/${profileId}`, {
    method: 'DELETE',
  })
}

export function testAuthProfile(
  profileId: string,
): Promise<{ id: string; available: boolean }> {
  return request(`/api/ai/auth-profiles/${profileId}/test`, {
    method: 'POST',
  })
}

export async function getAiSeats(sessionId: string): Promise<Record<string, AiSeatConfig>> {
  const response = await request<{ seats: Record<string, AiSeatConfig> }>(`/api/sessions/${sessionId}/ai-seats`)
  return response.seats
}

export function updateAiSeat(
  sessionId: string,
  side: string,
  input: UpdateAiSeatInput,
): Promise<GameSession> {
  return request(`/api/sessions/${sessionId}/ai-seats/${side}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function updateAiSeatLauncher(
  sessionId: string,
  side: string,
  input: UpdateAiSeatLauncherInput,
): Promise<GameSession> {
  return request(`/api/sessions/${sessionId}/ai-seats/${side}/launcher`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function resetSession(sessionId: string): Promise<GameSession> {
  return request(`/api/sessions/${sessionId}/reset`, {
    method: 'POST',
    body: JSON.stringify({
      actorKind: 'human',
      channel: 'ui',
    }),
  })
}

export function openSessionStream(
  sessionId: string,
  onSession: (session: GameSession) => void,
  onStateChange?: (state: 'connecting' | 'live' | 'reconnecting') => void,
): EventSource {
  onStateChange?.('connecting')

  const eventSource = new EventSource(
    new URL(`/api/sessions/${sessionId}/stream`, baseUrl).toString(),
  )

  eventSource.onopen = () => {
    onStateChange?.('live')
  }

  eventSource.onmessage = (event) => {
    const payload = JSON.parse(event.data) as SessionStreamEvent
    onSession(payload.session)
    onStateChange?.('live')
  }

  eventSource.onerror = () => {
    onStateChange?.('reconnecting')
  }

  return eventSource
}
