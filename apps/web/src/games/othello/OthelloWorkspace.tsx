import type {
  DecisionExplanation,
  GameSession,
  SessionEvent,
} from '@human-agent-playground/core'
import type {
  OthelloGameState,
  OthelloPoint,
} from '@human-agent-playground/game-othello'
import { useEffect, useRef, useState } from 'react'

import {
  formatActorLabel,
  formatEventHeadline,
  formatEventSummary,
  formatTimestamp,
  useI18n,
} from '../../i18n'
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
}: GameWorkspaceProps) {
  const { t } = useI18n()
  const session = toOthelloSession(rawSession)
  const [legalMoves, setLegalMoves] = useState<Set<OthelloPoint>>(new Set())
  const [feedHeight, setFeedHeight] = useState<number | null>(null)
  const boardPanelRef = useRef<HTMLElement | null>(null)

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
      <article ref={boardPanelRef} className="board-panel">
        <OthelloBoard
          board={session.state.board}
          legalMoves={legalMoves}
          lastMovePoint={lastMovePoint}
          onPointClick={handlePointClick}
        />
        {gameOverDialog}
      </article>

      <aside className="side-panel" style={feedHeight ? { height: `${feedHeight}px` } : undefined}>
        <div className="panel-card panel-card-feed">
          <h2>{t('feed.title')}</h2>
          {sessionEvents.length === 0 ? (
            <p>{t('feed.empty')}</p>
          ) : (
            <ol className="message-feed-list">
              {sessionEvents.map((event) => (
                <MessageFeedItem key={event.id} event={event} gameId={session.gameId} />
              ))}
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

  return (
    <li className={`message-feed-item message-feed-item-${event.actorKind}`}>
      <article className="message-feed-bubble">
        <p className="message-feed-meta">
          {formatActorLabel(language, event)} · {formatTimestamp(language, event.createdAt)}
        </p>
        <strong>{formatEventHeadline(language, event)}</strong>
        <p className="message-feed-summary">{formatEventSummary(language, event, gameId)}</p>
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
