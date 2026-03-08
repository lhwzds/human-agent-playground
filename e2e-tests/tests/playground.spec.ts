import { expect, test } from '@playwright/test'

const apiBaseUrl = process.env.PLAYGROUND_API_URL ?? 'http://127.0.0.1:8787'

test('creates a Xiangqi session and plays a legal opening move', async ({ page }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')

  await expect(page.getByText('Shared Tabletop Sessions For Humans And Agents')).toBeVisible()
  await expect(page.getByText('楚河')).toBeVisible()
  await expect(page.getByText('汉界')).toBeVisible()
  await expect(page.locator('[data-square="a6"] .board-point-segment-down')).toHaveCount(0)
  await expect(page.locator('[data-square="a5"] .board-point-segment-up')).toHaveCount(0)
  await expect(page.locator('[data-square="e9"] .board-point-diagonal')).toHaveCount(4)
  await expect(page.locator('.mono').first()).toBeVisible()
  const previousSessionId = (await page.locator('.mono').first().textContent())?.trim()
  await page.getByRole('button', { name: 'Create Session' }).click()
  await expect(page.getByText('Sync: live')).toBeVisible()
  await expect(page.getByText('Turn: red')).toBeVisible()
  await expect(page.locator('.mono').first()).not.toHaveText(previousSessionId ?? '')
  await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible()

  const panelHeights = await page.evaluate(() => {
    const boardPanel = document.querySelector('.game-workspace-layout .board-panel')?.getBoundingClientRect()
    const sidePanel = document.querySelector('.game-workspace-layout .side-panel')?.getBoundingClientRect()

    return {
      boardHeight: boardPanel?.height ?? 0,
      sideHeight: sidePanel?.height ?? 0,
    }
  })

  expect(Math.abs(panelHeights.boardHeight - panelHeights.sideHeight)).toBeLessThan(2)

  await page.locator('[data-square="a4"]').click()
  await expect(page.locator('[data-square="a5"]')).toHaveClass(/board-cell-target/)

  await page.locator('[data-square="a5"]').click()

  await expect(messageFeedCard.getByText('a4 → a5')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
})

test('reflects external session moves in real time', async ({ page, request }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await expect(page.locator('.mono').first()).toBeVisible()
  const streamUrls: string[] = []

  page.on('response', (response) => {
    if (
      response.request().method() === 'GET' &&
      response.url().includes('/api/sessions/') &&
      response.url().endsWith('/stream')
    ) {
      streamUrls.push(response.url())
    }
  })

  const previousSessionId = (await page.locator('.mono').first().textContent())?.trim()
  await page.getByRole('button', { name: 'Create Session' }).click()
  await expect(page.getByText('Sync: live')).toBeVisible()
  await expect(page.locator('.mono').first()).not.toHaveText(previousSessionId ?? '')

  const sessionId = (await page.locator('.mono').first().textContent())?.trim()
  expect(sessionId).toBeTruthy()
  await expect
    .poll(() =>
      streamUrls.some((url) => url.endsWith(`/api/sessions/${sessionId}/stream`)),
    )
    .toBe(true)

  const resetResponse = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/reset`)
  expect(resetResponse.ok()).toBe(true)
  await expect(page.getByText('Turn: red')).toBeVisible()

  for (let index = 0; index < 30; index += 1) {
    const repeatedResetResponse = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/reset`)
    expect(repeatedResetResponse.ok()).toBe(true)
  }

  await expect.poll(async () => {
    return await page.locator('.message-feed-list > li').count()
  }).toBeGreaterThan(10)

  const feedMetrics = await page.evaluate(() => {
    const boardPanel = document.querySelector('.game-workspace-layout .board-panel')?.getBoundingClientRect()
    const sidePanel = document.querySelector('.game-workspace-layout .side-panel')?.getBoundingClientRect()
    const feedList = document.querySelector('.message-feed-list')

    return {
      boardHeight: boardPanel?.height ?? 0,
      sideHeight: sidePanel?.height ?? 0,
      scrollHeight: feedList?.scrollHeight ?? 0,
      clientHeight: feedList?.clientHeight ?? 0,
    }
  })

  expect(Math.abs(feedMetrics.boardHeight - feedMetrics.sideHeight)).toBeLessThan(2)
  expect(feedMetrics.scrollHeight).toBeGreaterThan(feedMetrics.clientHeight)

  const response = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/moves`, {
    data: {
      from: 'a4',
      to: 'a5',
    },
  })

  expect(response.ok()).toBe(true)
  await expect(messageFeedCard.getByText('a4 → a5')).toBeVisible()
  await expect(messageFeedCard.getByText('Session Created')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()

  const secondResponse = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/moves`, {
    data: {
      from: 'a7',
      to: 'a6',
      actorKind: 'agent',
      channel: 'mcp',
      reasoning: {
        summary: 'Contest the file immediately and challenge the advanced pawn.',
        reasoningSteps: ['Matching the pawn push keeps the file balanced.'],
        confidence: 0.67,
      },
    },
  })

  expect(secondResponse.ok()).toBe(true)
  await expect(messageFeedCard.getByText('a7 → a6')).toBeVisible()
  await expect(messageFeedCard.getByText('Reasoning Summary')).toBeVisible()
  await expect(messageFeedCard.getByText('Contest the file immediately and challenge the advanced pawn.')).toBeVisible()
  await expect(messageFeedCard.getByText('a4 → a5')).toBeVisible()
  await expect(page.getByText('Turn: red')).toBeVisible()

  const thirdResponse = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/moves`, {
    data: {
      from: 'a5',
      to: 'a6',
    },
  })

  expect(thirdResponse.ok()).toBe(true)
  await expect(page.getByText('Message Feed')).toBeVisible()
  await expect(messageFeedCard.getByText('a5 → a6')).toBeVisible()
  await expect(messageFeedCard.getByText('兵 captured 卒')).toBeVisible()
  await expect(messageFeedCard.getByText('a7 → a6')).toBeVisible()
  await expect(messageFeedCard.getByText('Contest the file immediately and challenge the advanced pawn.')).toBeVisible()
  await expect(page.locator('[data-square="a5"]')).toHaveClass(/board-cell-last-from/)
  await expect(page.locator('[data-square="a6"]')).toHaveClass(/board-cell-last-to/)
  await expect(messageFeedCard.getByText('a4 → a5')).toBeVisible()
})
