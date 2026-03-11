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
}: GameWorkspaceProps) {
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
      </article>

      <aside className="side-panel" style={feedHeight ? { height: `${feedHeight}px` } : undefined}>
        <div className="panel-card panel-card-feed">
          <h2>Message Feed</h2>
          {sessionEvents.length === 0 ? (
            <p>No session events yet.</p>
          ) : (
            <ol className="message-feed-list">
              {sessionEvents.map((event) => (
                <MessageFeedItem key={event.id} event={event} />
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  )
}

function MessageFeedItem({ event }: { event: SessionEvent }) {
  const moveDetails = event.kind === 'move_played' ? formatMoveDetails(event) : ''

  return (
    <li className={`message-feed-item message-feed-item-${event.actorKind}`}>
      <article className="message-feed-bubble">
        <p className="message-feed-meta">
          {formatActorLabel(event)} · {formatTimestamp(event.createdAt)}
        </p>
        <strong>{formatEventHeadline(event)}</strong>
        <p className="message-feed-summary">{event.summary}</p>
        {moveDetails ? <p className="message-feed-summary">{moveDetails}</p> : null}
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
  return (
    <div className={`reasoning-summary ${compact ? 'reasoning-summary-compact' : ''}`}>
      <p className="reasoning-summary-title">Reasoning Summary</p>
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
        <p className="reasoning-confidence">Confidence: {explanation.confidence.toFixed(2)}</p>
      )}
    </div>
  )
}

function formatEventHeadline(event: SessionEvent) {
  if (
    event.kind === 'move_played' &&
    typeof event.details.from === 'string' &&
    typeof event.details.to === 'string'
  ) {
    return `${event.details.from} → ${event.details.to}`
  }

  if (event.kind === 'session_created') {
    return 'Session Created'
  }

  if (event.kind === 'session_reset') {
    return 'Session Reset'
  }

  return event.summary
}

function formatMoveDetails(event: SessionEvent) {
  const pieceDisplay = typeof event.details.pieceDisplay === 'string' ? event.details.pieceDisplay : null
  const capturedDisplay =
    typeof event.details.capturedDisplay === 'string' ? event.details.capturedDisplay : null

  if (!pieceDisplay) {
    return ''
  }

  return capturedDisplay ? `${pieceDisplay} captured ${capturedDisplay}` : pieceDisplay
}

function formatActorLabel(event: SessionEvent) {
  const actorLabel =
    event.actorName ??
    (event.actorKind === 'human'
      ? 'Human'
      : event.actorKind === 'agent'
        ? 'Agent'
        : event.actorKind === 'system'
          ? 'System'
          : 'Unknown')

  return `${actorLabel} via ${event.channel}`
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.valueOf())) {
    return timestamp
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
