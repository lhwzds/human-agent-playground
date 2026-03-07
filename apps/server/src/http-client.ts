const defaultBaseUrl = process.env.HUMAN_AGENT_PLAYGROUND_SERVER_URL ?? 'http://127.0.0.1:8787'

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  baseUrl = defaultBaseUrl,
): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `API request failed: ${response.status}`)
  }

  return (await response.json()) as T
}
