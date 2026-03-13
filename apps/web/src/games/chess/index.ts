import type { GameSession } from '@human-agent-playground/core'
import type { ChessGameState } from '@human-agent-playground/game-chess'

import type { GameModule, GameSummary } from '../types'
import { ChessWorkspace } from './ChessWorkspace'

function getChessSummary(session: GameSession): GameSummary {
  const state = (session as GameSession<ChessGameState>).state

  return {
    turn: state.turn,
    status: state.status,
    winner: state.status === 'finished' ? state.winner ?? 'draw' : state.winner ?? 'none',
  }
}

export const chessGameModule: GameModule = {
  gameId: 'chess',
  Workspace: ChessWorkspace,
  getSummary: getChessSummary,
}
