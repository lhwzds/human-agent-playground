import type {
  CreateSessionInput,
  GameCatalogItem,
  GameSession,
  SessionStreamEvent,
} from '@human-agent-playground/core'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8787'

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? `Request failed: ${response.status}`)
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
