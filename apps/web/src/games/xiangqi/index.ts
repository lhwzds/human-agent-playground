import type { GameSession } from '@human-agent-playground/core'
import type { XiangqiGameState } from '@human-agent-playground/game-xiangqi'

import type { GameModule, GameSummary } from '../types'
import { XiangqiWorkspace } from './XiangqiWorkspace'

function getXiangqiSummary(session: GameSession): GameSummary {
  const state = (session as GameSession<XiangqiGameState>).state

  return {
    turn: state.turn,
    status: state.status,
    winner: state.winner ?? 'none',
  }
}

export const xiangqiGameModule: GameModule = {
  gameId: 'xiangqi',
  Workspace: XiangqiWorkspace,
  getSummary: getXiangqiSummary,
}
