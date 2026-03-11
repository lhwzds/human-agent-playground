import type {
  DecisionExplanation,
  GameSession,
  SessionEvent,
} from '@human-agent-playground/core'
import type {
  ConnectFourColumn,
  ConnectFourGameState,
} from '@human-agent-playground/game-connect-four'
import { useEffect, useRef, useState } from 'react'

import {
  formatActorLabel,
  formatEventHeadline,
  formatEventSummary,
  formatTimestamp,
  getSideLabel,
  useI18n,
} from '../../i18n'
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
}: GameWorkspaceProps) {
  const { t } = useI18n()
  const session = toConnectFourSession(rawSession)
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
      <article ref={boardPanelRef} className="board-panel">
        <ConnectFourBoard
          board={session.state.board}
          lastMovePoint={lastMovePoint}
          winningLine={winningLine}
          onColumnClick={handleColumnClick}
        />
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
