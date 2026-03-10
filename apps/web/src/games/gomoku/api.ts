import type { GameSession } from '@human-agent-playground/core'
import type { GomokuLegalMove, GomokuPoint } from '@human-agent-playground/game-gomoku'

import { request } from '../../api'

export async function getGomokuLegalMoves(
  sessionId: string,
  point?: GomokuPoint,
): Promise<GomokuLegalMove[]> {
  const search = point ? `?point=${point}` : ''
  const response = await request<{ moves: GomokuLegalMove[] }>(
    `/api/sessions/${sessionId}/legal-moves${search}`,
  )
  return response.moves
}

export function playGomokuMove(sessionId: string, point: GomokuPoint): Promise<GameSession> {
  return request(`/api/sessions/${sessionId}/moves`, {
    method: 'POST',
    body: JSON.stringify({
      point,
      actorKind: 'human',
      channel: 'ui',
    }),
  })
}
