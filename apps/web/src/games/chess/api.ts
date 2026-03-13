import type { GameSession } from '@human-agent-playground/core'
import type {
  ChessLegalMove,
  ChessPromotion,
  ChessSquare,
} from '@human-agent-playground/game-chess'

import { request } from '../../api'

export async function getChessLegalMoves(
  sessionId: string,
  from?: ChessSquare,
): Promise<ChessLegalMove[]> {
  const search = from ? `?from=${from}` : ''
  const response = await request<{ moves: ChessLegalMove[] }>(
    `/api/sessions/${sessionId}/legal-moves${search}`,
  )
  return response.moves
}

export function playChessMove(
  sessionId: string,
  from: ChessSquare,
  to: ChessSquare,
  promotion?: ChessPromotion,
): Promise<GameSession> {
  return request(`/api/sessions/${sessionId}/moves`, {
    method: 'POST',
    body: JSON.stringify({
      from,
      to,
      promotion,
      actorKind: 'human',
      channel: 'ui',
    }),
  })
}
