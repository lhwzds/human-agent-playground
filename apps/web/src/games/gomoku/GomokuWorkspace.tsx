import type { GameSession } from '@human-agent-playground/core'
import type {
  GomokuGameState,
  GomokuPoint,
} from '@human-agent-playground/game-gomoku'

import {
  type AppLanguage,
  useI18n,
} from '../../i18n'
import { ActivityFeed } from '../shared/ActivityFeed'
import { useBoardViewport } from '../shared/boardViewport'
import type { GameWorkspaceProps } from '../types'
import { getGomokuLegalMoves, playGomokuMove } from './api'
import { GomokuBoard } from './components/GomokuBoard'

function toGomokuSession(session: GameSession): GameSession<GomokuGameState> {
  if (
    session.gameId !== 'gomoku' ||
    typeof session.state !== 'object' ||
    session.state === null ||
    (session.state as { kind?: unknown }).kind !== 'gomoku'
  ) {
    throw new Error('Invalid Gomoku session payload')
  }

  return session as GameSession<GomokuGameState>
}

export function GomokuWorkspace({
  session: rawSession,
  onSessionUpdate,
  onError,
  gameOverDialog,
  sideRailHeader,
  setupPanel,
}: GameWorkspaceProps) {
  const { t } = useI18n()
  const session = toGomokuSession(rawSession)
  const { boardPanelRef, boardPanelStyle } = useBoardViewport(1)

  async function handlePointClick(point: GomokuPoint) {
    try {
      onError(null)

      if (session.state.status === 'finished') {
        return
      }

      const legalMoves = await getGomokuLegalMoves(session.id, point)
      if (legalMoves.length === 0) {
        return
      }

      const updated = await playGomokuMove(session.id, point)
      onSessionUpdate(updated)
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : 'Move failed')
    }
  }

  const lastMovePoint = session.state.lastMove?.point ?? null
  const winningLine = new Set(session.state.winningLine ?? [])
  const sessionEvents = [...session.events].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )

  return (
    <div className="game-workspace-layout">
      <article className="board-panel" ref={boardPanelRef} style={boardPanelStyle}>
        <GomokuBoard
          board={session.state.board}
          lastMovePoint={lastMovePoint}
          winningLine={winningLine}
          onPointClick={handlePointClick}
        />
        {gameOverDialog}
      </article>

      <aside className="side-panel">
        {sideRailHeader ? <div className="panel-card panel-card-side-rail">{sideRailHeader}</div> : null}
        <ActivityFeed
          gameId={session.gameId}
          events={sessionEvents}
          emptyText={t('feed.empty')}
          pendingItem={setupPanel}
          renderMoveDetails={formatMoveDetails}
        />
      </aside>
    </div>
  )
}

function formatMoveDetails(language: AppLanguage, event: GameSession['events'][number]) {
  const stoneDisplay =
    typeof event.details.stoneDisplay === 'string' ? event.details.stoneDisplay : null

  if (!stoneDisplay) {
    return ''
  }

  return language === 'zh-CN' ? `落下 ${stoneDisplay}` : `Placed ${stoneDisplay}`
}
