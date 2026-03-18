import type { GameSession } from '@human-agent-playground/core'
import type {
  OthelloGameState,
  OthelloPoint,
} from '@human-agent-playground/game-othello'
import { useEffect, useState } from 'react'

import {
  type AppLanguage,
  useI18n,
} from '../../i18n'
import { ActivityFeed } from '../shared/ActivityFeed'
import type { GameWorkspaceProps } from '../types'
import { getOthelloLegalMoves, playOthelloMove } from './api'
import { OthelloBoard } from './components/OthelloBoard'

function toOthelloSession(session: GameSession): GameSession<OthelloGameState> {
  if (
    session.gameId !== 'othello' ||
    typeof session.state !== 'object' ||
    session.state === null ||
    (session.state as { kind?: unknown }).kind !== 'othello'
  ) {
    throw new Error('Invalid Othello session payload')
  }

  return session as GameSession<OthelloGameState>
}

export function OthelloWorkspace({
  session: rawSession,
  onSessionUpdate,
  onError,
  gameOverDialog,
  sideRailHeader,
  setupPanel,
}: GameWorkspaceProps) {
  const { t } = useI18n()
  const session = toOthelloSession(rawSession)
  const [legalMoves, setLegalMoves] = useState<Set<OthelloPoint>>(new Set())

  useEffect(() => {
    let cancelled = false

    void getOthelloLegalMoves(session.id)
      .then((moves) => {
        if (!cancelled) {
          setLegalMoves(new Set(moves.map((move) => move.point)))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLegalMoves(new Set())
        }
      })

    return () => {
      cancelled = true
    }
  }, [session.id, session.updatedAt])

  async function handlePointClick(point: OthelloPoint) {
    try {
      onError(null)

      if (session.state.status === 'finished') {
        return
      }

      const legalMove = await getOthelloLegalMoves(session.id, point)
      if (legalMove.length === 0) {
        return
      }

      const updated = await playOthelloMove(session.id, point)
      onSessionUpdate(updated)
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : 'Move failed')
    }
  }

  const lastMovePoint = session.state.lastMove?.point ?? null
  const sessionEvents = [...session.events].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )

  return (
    <div className="game-workspace-layout">
      <article className="board-panel">
        <OthelloBoard
          board={session.state.board}
          legalMoves={legalMoves}
          lastMovePoint={lastMovePoint}
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
  const flippedPoints = Array.isArray(event.details.flippedPoints)
    ? event.details.flippedPoints.filter((point): point is string => typeof point === 'string')
    : []

  if (!stoneDisplay) {
    return ''
  }

  if (flippedPoints.length === 0) {
    return language === 'zh-CN' ? `落下 ${stoneDisplay}` : `Placed ${stoneDisplay}`
  }

  return language === 'zh-CN'
    ? `落下 ${stoneDisplay}，翻转 ${flippedPoints.length} 枚棋子：${flippedPoints.join(', ')}`
    : `Placed ${stoneDisplay} and flipped ${flippedPoints.length} disc${flippedPoints.length > 1 ? 's' : ''}: ${flippedPoints.join(', ')}`
}
