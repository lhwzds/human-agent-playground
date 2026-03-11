import type { GameSession } from '@human-agent-playground/core'
import type { ConnectFourGameState } from '@human-agent-playground/game-connect-four'

import type { GameModule, GameSummary } from '../types'
import { ConnectFourWorkspace } from './ConnectFourWorkspace'

function getConnectFourSummary(session: GameSession): GameSummary {
  const state = (session as GameSession<ConnectFourGameState>).state

  return {
    turn: state.turn,
    status: state.status,
    winner: state.status === 'finished' ? state.winner ?? 'draw' : state.winner ?? 'none',
  }
}

export const connectFourGameModule: GameModule = {
  gameId: 'connect-four',
  Workspace: ConnectFourWorkspace,
  getSummary: getConnectFourSummary,
}
