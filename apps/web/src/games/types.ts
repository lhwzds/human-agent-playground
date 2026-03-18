import type { GameCatalogItem, GameSession } from '@human-agent-playground/core'
import type { ComponentType, ReactNode } from 'react'

export interface GameSummary {
  turn: string
  status: string
  winner: string
}

export interface GameWorkspaceProps {
  game: GameCatalogItem
  session: GameSession
  error: string | null
  onSessionUpdate: (session: GameSession) => void
  gameOverDialog?: ReactNode
  sideRailHeader?: ReactNode
  setupPanel?: ReactNode
  onRefreshSession?: (sessionId: string) => Promise<GameSession>
  onResetSession?: (sessionId: string) => Promise<GameSession>
  onError: (message: string | null) => void
}

export interface GameModule {
  gameId: string
  Workspace: ComponentType<GameWorkspaceProps>
  getSummary(session: GameSession): GameSummary
}
