import type { GameSession } from '@human-agent-playground/core'
import type { GomokuGameState } from '@human-agent-playground/game-gomoku'

import type { GameModule, GameSummary } from '../types'
import { GomokuWorkspace } from './GomokuWorkspace'

function getGomokuSummary(session: GameSession): GameSummary {
  const state = (session as GameSession<GomokuGameState>).state

  return {
    turn: state.turn,
    status: state.status,
    winner: state.winner ?? 'none',
  }
}

export const gomokuGameModule: GameModule = {
  gameId: 'gomoku',
  Workspace: GomokuWorkspace,
  getSummary: getGomokuSummary,
}
