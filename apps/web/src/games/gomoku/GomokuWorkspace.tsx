import type {
  DecisionExplanation,
  GameSession,
  SessionEvent,
} from '@human-agent-playground/core'
import type {
  GomokuGameState,
  GomokuPoint,
} from '@human-agent-playground/game-gomoku'
import { useEffect, useRef, useState } from 'react'

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
}: GameWorkspaceProps) {
  const session = toGomokuSession(rawSession)
  const [feedHeight, setFeedHeight] = useState<number | null>(null)
  const boardPanelRef = useRef<HTMLElement | null>(null)

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
      <article ref={boardPanelRef} className="board-panel">
        <GomokuBoard
          board={session.state.board}
          lastMovePoint={lastMovePoint}
          winningLine={winningLine}
          onPointClick={handlePointClick}
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
  if (event.kind === 'move_played' && typeof event.details.point === 'string') {
    return event.details.point
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
  const stoneDisplay =
    typeof event.details.stoneDisplay === 'string' ? event.details.stoneDisplay : null

  return stoneDisplay ? `Placed ${stoneDisplay}` : ''
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
