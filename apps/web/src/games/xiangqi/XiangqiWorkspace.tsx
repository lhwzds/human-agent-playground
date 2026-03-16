import type {
  DecisionExplanation,
  GameSession,
  SessionEvent,
} from '@human-agent-playground/core'
import {
  squareToCoordinates,
  type Square,
  type XiangqiGameState,
  type XiangqiMove,
} from '@human-agent-playground/game-xiangqi'
import { useEffect, useRef, useState } from 'react'

import {
  formatActorLabel,
  formatEventHeadline,
  formatRuntimeMeta,
  formatEventSummary,
  formatTimestamp,
  useI18n,
} from '../../i18n'
import type { GameWorkspaceProps } from '../types'
import { getXiangqiLegalMoves, playXiangqiMove } from './api'
import { XiangqiBoard } from './components/XiangqiBoard'

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
  setupPanel,
}: GameWorkspaceProps) {
  const { t } = useI18n()
  const session = toXiangqiSession(rawSession)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [legalMoves, setLegalMoves] = useState<XiangqiMove[]>([])
  const [feedHeight, setFeedHeight] = useState<number | null>(null)
  const boardPanelRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setSelectedSquare(null)
    setLegalMoves([])
  }, [session.id, session.updatedAt])

  useEffect(() => {
    const boardPanel = boardPanelRef.current
    const boardShell = boardPanel?.querySelector<HTMLElement>('.board-shell')

    if (!boardPanel || !boardShell) {
      return
    }

    const updateFeedHeight = () => {
      if (window.innerWidth <= 1080) {
        setFeedHeight(null)
        return
      }

      const boardPanelStyles = window.getComputedStyle(boardPanel)
      const verticalChrome =
        Number.parseFloat(boardPanelStyles.paddingTop) +
        Number.parseFloat(boardPanelStyles.paddingBottom) +
        Number.parseFloat(boardPanelStyles.borderTopWidth) +
        Number.parseFloat(boardPanelStyles.borderBottomWidth)

      setFeedHeight(boardShell.getBoundingClientRect().height + verticalChrome)
    }

    updateFeedHeight()

    const resizeObserver = new ResizeObserver(() => {
      updateFeedHeight()
    })

    resizeObserver.observe(boardShell)
    window.addEventListener('resize', updateFeedHeight)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateFeedHeight)
    }
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
      <article ref={boardPanelRef} className="board-panel">
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

      <aside className="side-panel" style={feedHeight ? { height: `${feedHeight}px` } : undefined}>
        <div className="panel-card panel-card-feed">
          <h2>{t('feed.title')}</h2>
          {sessionEvents.length === 0 && !setupPanel ? (
            <p>{t('feed.empty')}</p>
          ) : (
            <ol className="message-feed-list">
              {sessionEvents.map((event) => (
                <MessageFeedItem key={event.id} event={event} gameId={session.gameId} />
              ))}
              {setupPanel}
            </ol>
          )}
        </div>
      </aside>
    </div>
  )
}

function MessageFeedItem({ event, gameId }: { event: SessionEvent; gameId: string }) {
  const { language } = useI18n()
  const moveDetails = event.kind === 'move_played' ? formatMoveDetails(language, event) : ''
  const runtimeMeta = formatRuntimeMeta(language, event)

  return (
    <li className={`message-feed-item message-feed-item-${event.actorKind}`}>
      <article className="message-feed-bubble">
        <p className="message-feed-meta">
          {formatActorLabel(language, event)} · {formatTimestamp(language, event.createdAt)}
        </p>
        <strong>{formatEventHeadline(language, event)}</strong>
        <p className="message-feed-summary">{formatEventSummary(language, event, gameId)}</p>
        {moveDetails ? <p className="message-feed-summary">{moveDetails}</p> : null}
        {runtimeMeta ? <p className="message-feed-summary">{runtimeMeta}</p> : null}
        {event.reasoning ? <ReasoningSummary explanation={event.reasoning} compact /> : null}
      </article>
    </li>
  )
}

function ReasoningSummary({
  explanation,
  compact = false,
}: {
  explanation: DecisionExplanation
  compact?: boolean
}) {
  const { t } = useI18n()

  return (
    <div className={`reasoning-summary ${compact ? 'reasoning-summary-compact' : ''}`}>
      <p className="reasoning-summary-title">{t('feed.reasoningSummary')}</p>
      <p>{explanation.summary}</p>

      {explanation.reasoningSteps.length > 0 && (
        <ul className="reasoning-list">
          {explanation.reasoningSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      )}

      {explanation.consideredAlternatives.length > 0 && (
        <ul className="reasoning-list">
          {explanation.consideredAlternatives.map((alternative) => (
            <li key={`${alternative.action}:${alternative.summary}`}>
              {alternative.action}: {alternative.summary}
              {alternative.rejectedBecause ? ` (${alternative.rejectedBecause})` : ''}
            </li>
          ))}
        </ul>
      )}

      {typeof explanation.confidence === 'number' && (
        <p className="reasoning-confidence">
          {t('feed.confidence', { value: explanation.confidence.toFixed(2) })}
        </p>
      )}
    </div>
  )
}

function formatMoveDetails(language: 'en' | 'zh-CN', event: SessionEvent) {
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
