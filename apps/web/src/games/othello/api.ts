import type { GameSession } from '@human-agent-playground/core'
import type { OthelloLegalMove, OthelloPoint } from '@human-agent-playground/game-othello'

import { request } from '../../api'

export async function getOthelloLegalMoves(
  sessionId: string,
  point?: OthelloPoint,
): Promise<OthelloLegalMove[]> {
  const search = point ? `?point=${point}` : ''
  const response = await request<{ moves: OthelloLegalMove[] }>(
    `/api/sessions/${sessionId}/legal-moves${search}`,
  )
  return response.moves
}

export function playOthelloMove(sessionId: string, point: OthelloPoint): Promise<GameSession> {
  return request(`/api/sessions/${sessionId}/moves`, {
    method: 'POST',
    body: JSON.stringify({
      point,
      actorKind: 'human',
      channel: 'ui',
    }),
  })
}
