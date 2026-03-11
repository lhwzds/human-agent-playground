import type { GameSession } from '@human-agent-playground/core'
import type {
  ConnectFourColumn,
  ConnectFourLegalMove,
} from '@human-agent-playground/game-connect-four'

import { request } from '../../api'

export async function getConnectFourLegalMoves(
  sessionId: string,
  column?: ConnectFourColumn,
): Promise<ConnectFourLegalMove[]> {
  const search = typeof column === 'number' ? `?column=${column}` : ''
  const response = await request<{ moves: ConnectFourLegalMove[] }>(
    `/api/sessions/${sessionId}/legal-moves${search}`,
  )
  return response.moves
}

export function playConnectFourMove(
  sessionId: string,
  column: ConnectFourColumn,
): Promise<GameSession> {
  return request(`/api/sessions/${sessionId}/moves`, {
    method: 'POST',
    body: JSON.stringify({
      column,
      actorKind: 'human',
      channel: 'ui',
    }),
  })
}
