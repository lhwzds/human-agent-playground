import type { GameSession } from '@human-agent-playground/core'
import type {
  ChessGameState,
  ChessSquare,
} from '@human-agent-playground/game-chess'
import { useEffect, useState } from 'react'

import {
  type AppLanguage,
  useI18n,
} from '../../i18n'
import { ActivityFeed } from '../shared/ActivityFeed'
import { useBoardViewport } from '../shared/boardViewport'
import type { GameWorkspaceProps } from '../types'
import { getChessLegalMoves, playChessMove } from './api'
import { ChessBoard } from './components/ChessBoard'

function toChessSession(session: GameSession): GameSession<ChessGameState> {
  if (
    session.gameId !== 'chess' ||
    typeof session.state !== 'object' ||
    session.state === null ||
    (session.state as { kind?: unknown }).kind !== 'chess'
  ) {
    throw new Error('Invalid Chess session payload')
  }

  return session as GameSession<ChessGameState>
}

export function ChessWorkspace({
  session: rawSession,
  onSessionUpdate,
  onError,
  gameOverDialog,
  sideRailHeader,
  setupPanel,
}: GameWorkspaceProps) {
  const { t } = useI18n()
  const session = toChessSession(rawSession)
  const [selectedSquare, setSelectedSquare] = useState<ChessSquare | null>(null)
  const [legalTargets, setLegalTargets] = useState<Set<ChessSquare>>(new Set())
  const { boardPanelRef, boardPanelStyle } = useBoardViewport(1)

  useEffect(() => {
    setSelectedSquare(null)
    setLegalTargets(new Set())
  }, [session.id, session.updatedAt])

  async function selectSquare(square: ChessSquare) {
    const moves = await getChessLegalMoves(session.id, square)
    if (moves.length === 0) {
      setSelectedSquare(null)
      setLegalTargets(new Set())
      return []
    }

    setSelectedSquare(square)
    setLegalTargets(new Set(moves.map((move) => move.to)))
    return moves
  }

  async function handleSquareClick(square: ChessSquare) {
    try {
      onError(null)

      if (session.state.status === 'finished') {
        return
      }

      if (selectedSquare && legalTargets.has(square)) {
        const moves = await getChessLegalMoves(session.id, selectedSquare)
        const candidates = moves.filter((move) => move.to === square)
        const selectedMove = candidates.find((move) => move.promotion === 'queen') ?? candidates[0]
        if (!selectedMove) {
          return
        }

        const updated = await playChessMove(
          session.id,
          selectedSquare,
          square,
          selectedMove.promotion ?? undefined,
        )
        setSelectedSquare(null)
        setLegalTargets(new Set())
        onSessionUpdate(updated)
        return
      }

      await selectSquare(square)
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : 'Move failed')
    }
  }

  const sessionEvents = [...session.events].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )
  const lastMoveFrom = session.state.lastMove?.from ?? null
  const lastMoveTo = session.state.lastMove?.to ?? null

  return (
    <div className="game-workspace-layout">
      <article className="board-panel" ref={boardPanelRef} style={boardPanelStyle}>
        <ChessBoard
          board={session.state.board}
          selectedSquare={selectedSquare}
          legalTargets={legalTargets}
          lastMoveFrom={lastMoveFrom}
          lastMoveTo={lastMoveTo}
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
  const details: string[] = []

  if (typeof event.details.san === 'string') {
    details.push(
      language === 'zh-CN' ? `SAN：${event.details.san}` : `SAN: ${event.details.san}`,
    )
  }

  const pieceDisplay =
    typeof event.details.pieceDisplay === 'string' ? event.details.pieceDisplay : null
  const capturedDisplay =
    typeof event.details.capturedDisplay === 'string' ? event.details.capturedDisplay : null
  const promotionDisplay =
    typeof event.details.promotionDisplay === 'string' ? event.details.promotionDisplay : null

  if (pieceDisplay && capturedDisplay) {
    details.push(
      language === 'zh-CN'
        ? `${pieceDisplay} 吃 ${capturedDisplay}`
        : `${pieceDisplay} captured ${capturedDisplay}`,
    )
  }

  if (promotionDisplay) {
    details.push(
      language === 'zh-CN'
        ? `升变为 ${promotionDisplay}`
        : `Promoted to ${promotionDisplay}`,
    )
  }

  return details.join(' · ')
}
