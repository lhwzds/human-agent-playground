import type { GameSession } from '@human-agent-playground/core'
import type {
  ConnectFourColumn,
  ConnectFourGameState,
} from '@human-agent-playground/game-connect-four'

import {
  type AppLanguage,
  getSideLabel,
  useI18n,
} from '../../i18n'
import { ActivityFeed } from '../shared/ActivityFeed'
import type { GameWorkspaceProps } from '../types'
import { getConnectFourLegalMoves, playConnectFourMove } from './api'
import { ConnectFourBoard } from './components/ConnectFourBoard'

function toConnectFourSession(session: GameSession): GameSession<ConnectFourGameState> {
  if (
    session.gameId !== 'connect-four' ||
    typeof session.state !== 'object' ||
    session.state === null ||
    (session.state as { kind?: unknown }).kind !== 'connect-four'
  ) {
    throw new Error('Invalid Connect Four session payload')
  }

  return session as GameSession<ConnectFourGameState>
}

export function ConnectFourWorkspace({
  session: rawSession,
  onSessionUpdate,
  onError,
  gameOverDialog,
  sideRailHeader,
  setupPanel,
}: GameWorkspaceProps) {
  const { t } = useI18n()
  const session = toConnectFourSession(rawSession)

  async function handleColumnClick(column: ConnectFourColumn) {
    try {
      onError(null)

      if (session.state.status === 'finished') {
        return
      }

      const legalMoves = await getConnectFourLegalMoves(session.id, column)
      if (legalMoves.length === 0) {
        return
      }

      const updated = await playConnectFourMove(session.id, column)
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
      <article className="board-panel">
        <ConnectFourBoard
          board={session.state.board}
          lastMovePoint={lastMovePoint}
          winningLine={winningLine}
          onColumnClick={handleColumnClick}
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
  const column = typeof event.details.column === 'number' ? event.details.column : null
  const point = typeof event.details.point === 'string' ? event.details.point : null
  const side = typeof event.details.side === 'string' ? event.details.side : null

  if (column === null) {
    return ''
  }

  const sideLabel = getSideLabel(language, side)
  const pointSuffix = point ? ` (${point})` : ''

  return language === 'zh-CN'
    ? `${sideLabel} 在第 ${column} 列落子${pointSuffix}`
    : `Dropped ${sideLabel} disc in column ${column}${pointSuffix}`
}
