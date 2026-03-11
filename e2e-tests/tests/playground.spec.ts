import { expect, test } from '@playwright/test'

const apiBaseUrl = process.env.PLAYGROUND_API_URL ?? 'http://127.0.0.1:8791'

test('creates a Xiangqi session and plays a legal opening move', async ({ page }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')

  await expect(page.getByText('Shared Tabletop Sessions For Humans And Agents')).toBeVisible()
  await page.locator('select').first().selectOption('xiangqi')
  await expect(page.locator('.mono').first()).toBeVisible()
  const previousSessionId = (await page.locator('.mono').first().textContent())?.trim()
  await page.getByRole('button', { name: 'Create Session' }).click()
  await expect(page.getByText('楚河')).toBeVisible()
  await expect(page.getByText('汉界')).toBeVisible()
  await expect(page.locator('[data-square="a6"] .board-point-segment-down')).toHaveCount(0)
  await expect(page.locator('[data-square="a5"] .board-point-segment-up')).toHaveCount(0)
  await expect(page.locator('[data-square="e9"] .board-point-diagonal')).toHaveCount(4)
  await expect(page.getByText('Sync: live')).toBeVisible()
  await expect(page.getByText('Turn: red')).toBeVisible()
  await expect(page.locator('.mono').first()).not.toHaveText(previousSessionId ?? '')
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible()

  const heroHeights = await page.evaluate(() => {
    const heroPanel = document.querySelector('.hero-panel')?.getBoundingClientRect()
    const toolbar = document.querySelector('.hero-toolbar')?.getBoundingClientRect()
    const primaryRow = document.querySelector('.toolbar-row-primary')?.getBoundingClientRect()
    const select = document.querySelector('.toolbar-row-primary select')?.getBoundingClientRect()
    const createButton = document
      .querySelector('.toolbar-row-session .primary-button')
      ?.getBoundingClientRect()
    const sessionCard = document.querySelector('.toolbar-row-session .toolbar-session')?.getBoundingClientRect()
    const languageTrigger = document.querySelector('.language-menu-trigger')?.getBoundingClientRect()
    const languageOverlapsCreateButton =
      !!languageTrigger &&
      !!createButton &&
      !(
        languageTrigger.right <= createButton.left ||
        languageTrigger.left >= createButton.right ||
        languageTrigger.bottom <= createButton.top ||
        languageTrigger.top >= createButton.bottom
      )

    return {
      heroHeight: heroPanel?.height ?? 0,
      toolbarHeight: toolbar?.height ?? 0,
      toolbarWidth: toolbar?.width ?? 0,
      primaryRowWidth: primaryRow?.width ?? 0,
      toolbarTop: toolbar?.top ?? 0,
      selectTop: select?.top ?? 0,
      buttonTop: createButton?.top ?? 0,
      sessionTop: sessionCard?.top ?? 0,
      languageBottom: languageTrigger?.bottom ?? 0,
      overlapsCreateButton: languageOverlapsCreateButton,
    }
  })

  expect(Math.abs(heroHeights.heroHeight - heroHeights.toolbarHeight)).toBeLessThan(3)
  expect(heroHeights.primaryRowWidth).toBeLessThan(heroHeights.toolbarWidth * 0.7)
  expect(heroHeights.buttonTop - heroHeights.selectTop).toBeGreaterThan(8)
  expect(Math.abs(heroHeights.sessionTop - heroHeights.buttonTop)).toBeLessThan(2)
  expect(heroHeights.buttonTop - heroHeights.languageBottom).toBeGreaterThan(8)
  expect(heroHeights.overlapsCreateButton).toBe(false)

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

  const messageFeedMetrics = await page.evaluate(() => {
    const feedList = document.querySelector('.message-feed-list')?.getBoundingClientRect()
    const firstItem = document.querySelector('.message-feed-item')?.getBoundingClientRect()

    return {
      feedHeight: feedList?.height ?? 0,
      firstItemHeight: firstItem?.height ?? 0,
    }
  })

  expect(messageFeedMetrics.firstItemHeight).toBeLessThan(messageFeedMetrics.feedHeight * 0.7)
})

test('reflects external session moves in real time', async ({ page, request }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await page.locator('select').first().selectOption('xiangqi')
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

test('keeps the hero controls aligned and leaves room in a single-message feed', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('select').first().selectOption('gomoku')
  await page.getByRole('button', { name: 'Create Session' }).click()

  await expect(page.getByText('Game: Gomoku')).toBeVisible()

  const layoutMetrics = await page.evaluate(() => {
    const heroPanel = document.querySelector('.hero-panel')?.getBoundingClientRect()
    const heroToolbar = document.querySelector('.hero-toolbar')?.getBoundingClientRect()
    const select = document.querySelector('.toolbar-row-primary select')?.getBoundingClientRect()
    const createButton = document
      .querySelector('.toolbar-row-session .primary-button')
      ?.getBoundingClientRect()
    const sessionCard = document.querySelector('.toolbar-row-session .toolbar-session')?.getBoundingClientRect()
    const languageTrigger = document.querySelector('.language-menu-trigger')?.getBoundingClientRect()
    const feedList = document.querySelector('.message-feed-list')?.getBoundingClientRect()
    const firstItem = document.querySelector('.message-feed-item')?.getBoundingClientRect()
    const languageOverlapsCreateButton =
      !!languageTrigger &&
      !!createButton &&
      !(
        languageTrigger.right <= createButton.left ||
        languageTrigger.left >= createButton.right ||
        languageTrigger.bottom <= createButton.top ||
        languageTrigger.top >= createButton.bottom
      )

    return {
      heroHeight: heroPanel?.height ?? 0,
      toolbarHeight: heroToolbar?.height ?? 0,
      toolbarTop: heroToolbar?.top ?? 0,
      selectTop: select?.top ?? 0,
      buttonTop: createButton?.top ?? 0,
      sessionTop: sessionCard?.top ?? 0,
      languageBottom: languageTrigger?.bottom ?? 0,
      overlapsCreateButton: languageOverlapsCreateButton,
      feedHeight: feedList?.height ?? 0,
      firstItemHeight: firstItem?.height ?? 0,
      messageCount: document.querySelectorAll('.message-feed-item').length,
    }
  })

  expect(Math.abs(layoutMetrics.heroHeight - layoutMetrics.toolbarHeight)).toBeLessThan(3)
  expect(layoutMetrics.buttonTop - layoutMetrics.selectTop).toBeGreaterThan(8)
  expect(Math.abs(layoutMetrics.sessionTop - layoutMetrics.buttonTop)).toBeLessThan(2)
  expect(layoutMetrics.buttonTop - layoutMetrics.languageBottom).toBeGreaterThan(8)
  expect(layoutMetrics.overlapsCreateButton).toBe(false)
  expect(layoutMetrics.messageCount).toBe(1)
  expect(layoutMetrics.firstItemHeight).toBeLessThan(layoutMetrics.feedHeight * 0.7)
})

test('switches the shared interface to Chinese', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Language' }).click()
  await page.getByRole('menuitemradio', { name: '中文' }).click()
  await page.locator('select').first().selectOption('gomoku')
  await page.getByRole('button', { name: '创建对局' }).click()

  await expect(page.getByText('供人类与智能体共享的棋盘对局')).toBeVisible()
  await expect(page.getByText('游戏: 五子棋')).toBeVisible()
  await expect(page.getByText('同步: 实时同步')).toBeVisible()
  await expect(page.getByText('当前行棋: 黑方')).toBeVisible()
  await expect(page.getByRole('heading', { name: '消息流' })).toBeVisible()
  await expect(page.getByText('已创建对局')).toBeVisible()
})

test('creates a Gomoku session and reflects placed stones in real time', async ({ page, request }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await page.locator('select').first().selectOption('gomoku')
  await page.getByRole('button', { name: 'Create Session' }).click()

  await expect(page.getByText('Game: Gomoku')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
  await expect(page.locator('[data-point="h8"]')).toBeVisible()
  await expect(page.locator('[data-point="d12"] .gomoku-star-point')).toBeVisible()

  await page.locator('[data-point="h8"]').click()

  await expect(messageFeedCard.locator('strong', { hasText: 'h8' })).toBeVisible()
  await expect(messageFeedCard.getByText('Placed ●')).toBeVisible()
  await expect(page.getByText('Turn: white')).toBeVisible()
  await expect(page.locator('[data-point="h8"]')).toHaveClass(/gomoku-point-last/)

  const sessionId = (await page.locator('.mono').first().textContent())?.trim()
  expect(sessionId).toBeTruthy()

  const response = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/moves`, {
    data: {
      point: 'i8',
      actorKind: 'agent',
      channel: 'mcp',
      reasoning: {
        summary: 'Mirror the center extension to fight for the same row immediately.',
        reasoningSteps: ['A nearby response contests the strongest existing line.'],
        confidence: 0.69,
      },
    },
  })

  expect(response.ok()).toBe(true)
  await expect(messageFeedCard.locator('strong', { hasText: 'i8' })).toBeVisible()
  await expect(messageFeedCard.getByText('Reasoning Summary')).toBeVisible()
  await expect(messageFeedCard.getByText('Mirror the center extension to fight for the same row immediately.')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
  await expect(page.locator('[data-point="i8"]')).toHaveClass(/gomoku-point-last/)
})

test('creates a Connect Four session and drops a legal opening disc', async ({ page }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await page.locator('select').first().selectOption('connect-four')
  await page.getByRole('button', { name: 'Create Session' }).click()

  await expect(page.getByText('Game: Connect Four')).toBeVisible()
  await expect(page.getByText('Turn: red')).toBeVisible()
  await expect(page.locator('[data-point="d6"]')).toBeVisible()

  await page.locator('[data-point="d6"]').click()

  await expect(messageFeedCard.locator('strong', { hasText: 'd1' })).toBeVisible()
  await expect(messageFeedCard.getByText('Dropped red disc in column 4 (d1)')).toBeVisible()
  await expect(page.getByText('Turn: yellow')).toBeVisible()
  await expect(page.locator('[data-point="d1"]')).toHaveClass(/connect-four-cell-last/)
})

test('creates an Othello session and reflects legal opening play', async ({ page, request }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await page.locator('select').first().selectOption('othello')
  await page.getByRole('button', { name: 'Create Session' }).click()

  await expect(page.getByText('Game: Othello')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
  await expect(page.locator('.othello-disc')).toHaveCount(4)
  await expect(page.locator('.othello-legal-marker')).toHaveCount(4)

  const sessionId = (await page.locator('.mono').first().textContent())?.trim()
  expect(sessionId).toBeTruthy()

  const response = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/moves`, {
    data: {
      point: 'd3',
      actorKind: 'agent',
      channel: 'mcp',
      reasoning: {
        summary: 'Take the standard opening edge and flip one central disc.',
        reasoningSteps: ['d3 is legal and immediately flips d4 to black.'],
        confidence: 0.73,
      },
    },
  })

  expect(response.ok()).toBe(true)
  await expect(messageFeedCard.locator('strong', { hasText: 'd3' })).toBeVisible()
  await expect(messageFeedCard.getByText('Placed ● and flipped 1 disc: d4')).toBeVisible()
  await expect(messageFeedCard.getByText('Reasoning Summary')).toBeVisible()
  await expect(page.getByText('Turn: white')).toBeVisible()
  await expect(page.locator('[data-point="d3"]')).toHaveClass(/othello-cell-last/)
})
