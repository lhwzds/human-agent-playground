import type {
  DecisionExplanation,
  SessionEvent,
} from '@human-agent-playground/core'
import { type ReactNode, useLayoutEffect, useMemo, useRef } from 'react'

import {
  formatActorLabel,
  formatEventHeadline,
  formatEventSummary,
  formatRuntimeMeta,
  formatTimestamp,
  type AppLanguage,
  useI18n,
} from '../../i18n'

interface ActivityFeedProps {
  gameId: string
  events: SessionEvent[]
  emptyText: string
  pendingItem?: ReactNode
  renderMoveDetails?: (language: AppLanguage, event: SessionEvent) => string
}

export function ActivityFeed({
  gameId,
  events,
  emptyText,
  pendingItem,
  renderMoveDetails,
}: ActivityFeedProps) {
  const { t } = useI18n()
  const feedEndRef = useRef<HTMLLIElement | null>(null)
  const scrollKey = useMemo(
    () =>
      JSON.stringify({
        eventCount: events.length,
        lastEventId: events.at(-1)?.id ?? null,
        hasPendingItem: Boolean(pendingItem),
      }),
    [events, pendingItem],
  )

  useLayoutEffect(() => {
    feedEndRef.current?.scrollIntoView({
      block: 'end',
    })
  }, [scrollKey])

  return (
    <div className="panel-card panel-card-feed">
      <h2>{t('feed.title')}</h2>
      {events.length === 0 && !pendingItem ? (
        <p>{emptyText}</p>
      ) : (
        <ol className="message-feed-list">
          {events.map((event) => (
            <MessageFeedItem
              key={event.id}
              event={event}
              gameId={gameId}
              renderMoveDetails={renderMoveDetails}
            />
          ))}
          {pendingItem}
          <li aria-hidden="true" className="message-feed-end-anchor" ref={feedEndRef} />
        </ol>
      )}
    </div>
  )
}

function MessageFeedItem({
  event,
  gameId,
  renderMoveDetails,
}: {
  event: SessionEvent
  gameId: string
  renderMoveDetails?: (language: AppLanguage, event: SessionEvent) => string
}) {
  const { language } = useI18n()
  const moveDetails = renderMoveDetails ? renderMoveDetails(language, event) : ''
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
        {event.reasoning ? <ReasoningSummary explanation={event.reasoning} /> : null}
      </article>
    </li>
  )
}

function ReasoningSummary({ explanation }: { explanation: DecisionExplanation }) {
  const { t } = useI18n()

  return (
    <details className="reasoning-summary">
      <summary className="reasoning-summary-trigger">
        <span className="reasoning-summary-title">{t('feed.reasoningSummary')}</span>
      </summary>
      <div className="reasoning-summary-body">
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
    </details>
  )
}
