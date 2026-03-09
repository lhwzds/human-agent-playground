import { describe, expect, it } from 'vitest'

import { demoSnapshots } from '../demo-session'

describe('demo session', () => {
  it('starts from the opening position and accumulates snapshots', () => {
    expect(demoSnapshots.length).toBeGreaterThan(5)
    expect(demoSnapshots[0]?.moveCount).toBe(0)
    expect(demoSnapshots.at(-1)?.moveCount).toBe(demoSnapshots.length - 1)
  })

  it('keeps the replay active with a cumulative feed', () => {
    const opening = demoSnapshots[0]
    const next = demoSnapshots[1]
    const latest = demoSnapshots.at(-1)

    expect(opening?.feed).toHaveLength(1)
    expect(next?.feed.length).toBeGreaterThan(opening?.feed.length ?? 0)
    expect(latest?.status).toBe('active')
    expect(latest?.winner).toBeNull()
  })

  it('preserves agent reasoning in the replay feed', () => {
    const agentEntries = demoSnapshots.flatMap((snapshot) =>
      snapshot.feed.filter((entry) => entry.actor === 'agent' && entry.reasoning),
    )

    expect(agentEntries.length).toBeGreaterThan(0)
    expect(agentEntries[0]?.reasoning).toContain('message feed')
  })
})
