import type {
  AuthProfileSummary,
  CreateAuthProfileInput,
  ProviderCapability,
  SessionEvent,
  UpdateAuthProfileInput,
} from '@human-agent-playground/core'

export interface DecideTurnInput {
  gameId: string
  sessionId: string
  seatSide: string
  state: unknown
  legalMoves: unknown[]
  recentEvents: SessionEvent[]
  seatConfig: {
    providerProfileId?: string
    provider?: string
    model: string
    promptOverride?: string | null
    timeoutMs?: number
  }
}

export interface DecideTurnResult {
  action: unknown | null
  reasoning: unknown | null
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    costUsd?: number | null
  } | null
  model: string | null
  provider: string | null
  error: string | null
  errorCode?: string | null
  rawResponsePreview?: string | null
}

export interface AiRuntimeClient {
  listProviders(): Promise<ProviderCapability[]>
  listAuthProfiles(): Promise<AuthProfileSummary[]>
  createAuthProfile(input: CreateAuthProfileInput): Promise<{ id: string; created: true }>
  updateAuthProfile(
    profileId: string,
    input: UpdateAuthProfileInput,
  ): Promise<{ id: string; name: string; enabled: boolean; priority: number }>
  deleteAuthProfile(profileId: string): Promise<{ deleted: true; id: string }>
  testAuthProfile(profileId: string): Promise<{ id: string; available: boolean }>
  decideTurn(input: DecideTurnInput): Promise<DecideTurnResult>
}

export class HttpAiRuntimeClient implements AiRuntimeClient {
  constructor(
    private readonly baseUrl = process.env.HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_URL ??
      'http://127.0.0.1:8795',
  ) {}

  async listProviders(): Promise<ProviderCapability[]> {
    const response = await this.request<{ providers: ProviderCapability[] }>('/api/providers')
    return response.providers
  }

  async listAuthProfiles(): Promise<AuthProfileSummary[]> {
    const response = await this.request<{ profiles: AuthProfileSummary[] }>('/api/auth-profiles')
    return response.profiles
  }

  createAuthProfile(input: CreateAuthProfileInput): Promise<{ id: string; created: true }> {
    return this.request('/api/auth-profiles', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  updateAuthProfile(
    profileId: string,
    input: UpdateAuthProfileInput,
  ): Promise<{ id: string; name: string; enabled: boolean; priority: number }> {
    return this.request(`/api/auth-profiles/${profileId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  deleteAuthProfile(profileId: string): Promise<{ deleted: true; id: string }> {
    return this.request(`/api/auth-profiles/${profileId}`, {
      method: 'DELETE',
    })
  }

  testAuthProfile(profileId: string): Promise<{ id: string; available: boolean }> {
    return this.request(`/api/auth-profiles/${profileId}/test`, {
      method: 'POST',
    })
  }

  decideTurn(input: DecideTurnInput): Promise<DecideTurnResult> {
    return this.request('/api/turns/decide', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) {
      throw new Error(payload?.error ?? `AI runtime request failed: ${response.status}`)
    }

    return payload as T
  }
}
