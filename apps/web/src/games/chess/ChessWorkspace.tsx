import type {
  DecisionExplanation,
  GameSession,
  SessionEvent,
} from '@human-agent-playground/core'
import type {
  ChessGameState,
  ChessSquare,
} from '@human-agent-playground/game-chess'
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
  setupPanel,
}: GameWorkspaceProps) {
  const { t } = useI18n()
  const session = toChessSession(rawSession)
  const [selectedSquare, setSelectedSquare] = useState<ChessSquare | null>(null)
  const [legalTargets, setLegalTargets] = useState<Set<ChessSquare>>(new Set())
  const [feedHeight, setFeedHeight] = useState<number | null>(null)
  const boardPanelRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setSelectedSquare(null)
    setLegalTargets(new Set())
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
      <article ref={boardPanelRef} className="board-panel">
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
