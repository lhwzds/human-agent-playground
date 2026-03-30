import type { SessionEvent } from '@human-agent-playground/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '../../../i18n'
import { ActivityFeed } from '../ActivityFeed'

const scrollIntoViewMock = vi.fn()
const originalScrollIntoView = Element.prototype.scrollIntoView

function createMoveEvent(id: string): SessionEvent {
  return {
    id,
    kind: 'move_played',
    actorKind: 'human',
    actorName: 'Tester',
    channel: 'ui',
    summary: `Move ${id}`,
    createdAt: '2026-03-29T12:00:00.000Z',
    details: {
      side: 'white',
      from: 'e2',
      to: 'e4',
    },
  }
}

describe('ActivityFeed', () => {
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView
    scrollIntoViewMock.mockReset()
  })

  it('scrolls to the newest message when events change', () => {
    Element.prototype.scrollIntoView = scrollIntoViewMock

    const { rerender } = render(
      <I18nProvider>
        <ActivityFeed emptyText="No events yet." events={[createMoveEvent('event-1')]} gameId="chess" />
      </I18nProvider>,
    )

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1)

    rerender(
      <I18nProvider>
        <ActivityFeed
          emptyText="No events yet."
          events={[createMoveEvent('event-1'), createMoveEvent('event-2')]}
          gameId="chess"
        />
      </I18nProvider>,
    )

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2)
  })

  it('scrolls when a pending thinking item appears', () => {
    Element.prototype.scrollIntoView = scrollIntoViewMock

    const { rerender } = render(
      <I18nProvider>
        <ActivityFeed emptyText="No events yet." events={[createMoveEvent('event-1')]} gameId="chess" />
      </I18nProvider>,
    )

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1)

    rerender(
      <I18nProvider>
        <ActivityFeed
          emptyText="No events yet."
          events={[createMoveEvent('event-1')]}
          gameId="chess"
          pendingItem={<li key="pending">thinking…</li>}
        />
      </I18nProvider>,
    )

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2)
  })

  it('renders runtime duration in the feed and reasoning summary', () => {
    Element.prototype.scrollIntoView = scrollIntoViewMock
    const event = createMoveEvent('event-runtime')
    event.actorKind = 'agent'
    event.actorName = 'restflow-bridge'
    event.channel = 'system'
    event.details = {
      ...event.details,
      provider: 'anthropic',
      model: 'claude-code-sonnet',
      runtimeSource: 'restflow-bridge',
      seatSide: 'white',
      durationMs: 4250,
    }
    event.reasoning = {
      summary: 'Play the classical central response.',
      reasoningSteps: ['Contest the center immediately.'],
      consideredAlternatives: [],
      confidence: 0.81,
    }

    render(
      <I18nProvider>
        <ActivityFeed emptyText="No events yet." events={[event]} gameId="chess" />
      </I18nProvider>,
    )

    expect(
      screen.getByText(/restflow-bridge · white · anthropic \/ claude-code-sonnet · 4\.3s/i),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByText('Reasoning Summary'))
    expect(screen.getByText('Time: 4.3s')).toBeInTheDocument()
  })
})
