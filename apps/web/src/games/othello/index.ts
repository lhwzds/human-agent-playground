import type { GameSession } from '@human-agent-playground/core'
import type { OthelloGameState } from '@human-agent-playground/game-othello'

import type { GameModule, GameSummary } from '../types'
import { OthelloWorkspace } from './OthelloWorkspace'

function getOthelloSummary(session: GameSession): GameSummary {
  const state = (session as GameSession<OthelloGameState>).state

  return {
    turn: state.turn,
    status: state.status,
    winner: state.status === 'finished' ? state.winner ?? 'draw' : state.winner ?? 'none',
  }
}

export const othelloGameModule: GameModule = {
  gameId: 'othello',
  Workspace: OthelloWorkspace,
  getSummary: getOthelloSummary,
}
