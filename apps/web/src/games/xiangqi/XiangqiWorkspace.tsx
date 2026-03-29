import type { GameSession } from '@human-agent-playground/core'
import {
  squareToCoordinates,
  type Square,
  type XiangqiGameState,
  type XiangqiMove,
} from '@human-agent-playground/game-xiangqi'
import { useEffect, useState } from 'react'

import {
  type AppLanguage,
  useI18n,
} from '../../i18n'
import { ActivityFeed } from '../shared/ActivityFeed'
import { useBoardViewport } from '../shared/boardViewport'
import type { GameWorkspaceProps } from '../types'
import { getXiangqiLegalMoves, playXiangqiMove } from './api'
import { XiangqiBoard } from './components/XiangqiBoard'

const XIANGQI_BOARD_SHELL_ASPECT_RATIO = 0.915

function toXiangqiSession(session: GameSession): GameSession<XiangqiGameState> {
  if (
    session.gameId !== 'xiangqi' ||
    typeof session.state !== 'object' ||
    session.state === null ||
    (session.state as { kind?: unknown }).kind !== 'xiangqi'
  ) {
    throw new Error('Invalid Xiangqi session payload')
  }

  return session as GameSession<XiangqiGameState>
}

export function XiangqiWorkspace({
  session: rawSession,
  onSessionUpdate,
  onError,
  gameOverDialog,
  sideRailHeader,
  setupPanel,
}: GameWorkspaceProps) {
  const { t } = useI18n()
  const session = toXiangqiSession(rawSession)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [legalMoves, setLegalMoves] = useState<XiangqiMove[]>([])
  const { boardPanelRef, boardPanelStyle } = useBoardViewport(XIANGQI_BOARD_SHELL_ASPECT_RATIO)

  useEffect(() => {
    setSelectedSquare(null)
    setLegalMoves([])
  }, [session.id, session.updatedAt])

  async function handleSquareClick(square: Square) {
    const { row, col } = squareToCoordinates(square)
    const piece = session.state.board[row][col]

    try {
      onError(null)

      if (selectedSquare && legalMoves.some((move) => move.to === square)) {
        const updated = await playXiangqiMove(session.id, selectedSquare, square)
        onSessionUpdate(updated)
        setSelectedSquare(null)
        setLegalMoves([])
        return
      }

      if (piece?.side === session.state.turn) {
        const moves = await getXiangqiLegalMoves(session.id, square)
        setSelectedSquare(square)
        setLegalMoves(moves)
        return
      }

      setSelectedSquare(null)
      setLegalMoves([])
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : 'Move failed')
    }
  }

  const legalTargets = new Set(legalMoves.map((move) => move.to))
  const lastMove = session.state.lastMove
  const sessionEvents = [...session.events].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )

  return (
    <div className="game-workspace-layout">
      <article className="board-panel" ref={boardPanelRef} style={boardPanelStyle}>
        <XiangqiBoard
          board={session.state.board}
          selectedSquare={selectedSquare}
          legalTargets={legalTargets}
          lastMoveFrom={lastMove?.from ?? null}
          lastMoveTo={lastMove?.to ?? null}
          onSquareClick={handleSquareClick}
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
  const pieceDisplay = typeof event.details.pieceDisplay === 'string' ? event.details.pieceDisplay : null
  const capturedDisplay =
    typeof event.details.capturedDisplay === 'string' ? event.details.capturedDisplay : null

  if (!pieceDisplay) {
    return ''
  }

  return capturedDisplay
    ? language === 'zh-CN'
      ? `${pieceDisplay} 吃 ${capturedDisplay}`
      : `${pieceDisplay} captured ${capturedDisplay}`
    : language === 'zh-CN'
      ? `${pieceDisplay} 落子`
      : pieceDisplay
}
