import type { Square, XiangqiMove } from '@human-agent-playground/game-xiangqi'
import type { GameSession } from '@human-agent-playground/core'

import { request } from '../../api'

export async function getXiangqiLegalMoves(
  sessionId: string,
  from?: Square,
): Promise<XiangqiMove[]> {
  const search = from ? `?from=${from}` : ''
  const response = await request<{ moves: XiangqiMove[] }>(
    `/api/sessions/${sessionId}/legal-moves${search}`,
  )
  return response.moves
}

export function playXiangqiMove(sessionId: string, from: Square, to: Square): Promise<GameSession> {
  return request(`/api/sessions/${sessionId}/moves`, {
    method: 'POST',
    body: JSON.stringify({
      from,
      to,
      actorKind: 'human',
      channel: 'ui',
    }),
  })
}
