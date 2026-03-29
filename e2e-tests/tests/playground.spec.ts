import { expect, test } from '@playwright/test'

const apiBaseUrl = process.env.PLAYGROUND_API_URL ?? 'http://127.0.0.1:8791'

async function selectGame(page: Parameters<typeof test>[0]['page'], gameId: string) {
  await page.getByRole('combobox', { name: 'Game' }).selectOption(gameId)
}

async function createSessionThroughUi(
  page: Parameters<typeof test>[0]['page'],
  gameId?: string,
) {
  await page.getByRole('button', { name: 'Create Session' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Session' })
  await expect(dialog).toBeVisible()
  if (gameId) {
    await dialog.getByRole('combobox', { name: 'Game' }).selectOption(gameId)
  }
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
}

async function readSessionId(page: Parameters<typeof test>[0]['page']) {
  return await page.getByRole('combobox', { name: 'Session' }).inputValue()
}

async function getSessionSnapshot(
  request: Parameters<typeof test>[0]['request'],
  sessionId: string,
) {
  const response = await request.get(`${apiBaseUrl}/api/sessions/${sessionId}`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as {
    events: Array<{ kind: string }>
    state: { turn: string }
    aiSeats?: Record<string, { enabled?: boolean; model?: string | null }>
  }
}

async function listProviderCatalog(request: Parameters<typeof test>[0]['request']) {
  const response = await request.get(`${apiBaseUrl}/api/ai/providers`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as {
    providers: Array<{ id: string; label: string; available: boolean }>
  }
}

async function configureOpenAiProviderThroughApi(
  request: Parameters<typeof test>[0]['request'],
  profileName: string,
  modelId: string,
) {
  const createProfileResponse = await request.post(`${apiBaseUrl}/api/ai/auth-profiles`, {
    data: {
      name: profileName,
      provider: 'openai',
      credentialType: 'api_key',
      credentialValue: `sk-test-${profileName}`,
    },
  })
  expect(createProfileResponse.ok()).toBe(true)

  const { id: profileId } = (await createProfileResponse.json()) as { id: string }
  const runtimeSettingsResponse = await request.get(`${apiBaseUrl}/api/ai/runtime-settings`)
  expect(runtimeSettingsResponse.ok()).toBe(true)

  const runtimePayload = (await runtimeSettingsResponse.json()) as {
    settings: {
      providers: Array<{
        providerId: string
        displayName: string | null
        defaultModel: string | null
        defaultProfileId: string | null
        preferredSource: 'api' | 'cli' | null
      }>
    }
  }

  const nextProviders = runtimePayload.settings.providers.map((provider) =>
    provider.providerId === 'openai'
      ? {
          ...provider,
          displayName: profileName,
          defaultModel: modelId,
          defaultProfileId: profileId,
        }
      : provider,
  )

  const saveSettingsResponse = await request.put(`${apiBaseUrl}/api/ai/runtime-settings`, {
    data: { providers: nextProviders },
  })
  expect(saveSettingsResponse.ok()).toBe(true)
}

async function configureAiSeatThroughUi(
  page: Parameters<typeof test>[0]['page'],
  side: 'white' | 'black',
  launcher: 'openai' | 'codex',
  modelId: string,
) {
  await page.getByRole('button', { name: 'Edit Players' }).click()
  await page.getByRole('combobox', { name: `Launcher ${side}` }).selectOption(launcher)
  await expect(page.getByRole('combobox', { name: `Launcher ${side}` })).toHaveValue(launcher)
  await expect(page.getByRole('combobox', { name: `Model ${side}` })).toBeVisible()
  await page.getByRole('combobox', { name: `Model ${side}` }).selectOption(modelId)
  await expect(page.getByRole('combobox', { name: `Model ${side}` })).toHaveValue(modelId)
  await page.getByRole('button', { name: 'Save Players' }).click()
}

test('creates a Xiangqi session and plays a legal opening move', async ({ page }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')

  await expect(page.getByText('Human Agent Playground')).toBeVisible()
  await selectGame(page, 'xiangqi')
  const previousSessionId = await readSessionId(page)
  await createSessionThroughUi(page, 'xiangqi')
  await expect(page.getByText('楚河')).toBeVisible()
  await expect(page.getByText('汉界')).toBeVisible()
  await expect(page.locator('[data-square="a6"] .board-point-segment-down')).toHaveCount(0)
  await expect(page.locator('[data-square="a5"] .board-point-segment-up')).toHaveCount(0)
  await expect(page.locator('[data-square="e9"] .board-point-diagonal')).toHaveCount(4)
  await expect(page.getByText('Sync: live')).toBeVisible()
  await expect(page.getByText('Turn: red')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Session' })).not.toHaveValue(previousSessionId)
  await expect(
    page.locator('.app-toolbar').getByRole('button', { name: 'Refresh', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible()

  const heroHeights = await page.evaluate(() => {
    const chrome = document.querySelector('.app-chrome')?.getBoundingClientRect()
    const toolbar = document.querySelector('.app-toolbar')?.getBoundingClientRect()
    const primaryRow = document.querySelector('.app-toolbar-row-primary')?.getBoundingClientRect()
    const controls = document.querySelectorAll('.app-toolbar-controls select')
    const select = controls.item(0)?.getBoundingClientRect()
    const languageSelect = controls.item(1)?.getBoundingClientRect()
    const sessionSelect = controls.item(2)?.getBoundingClientRect()
    const createButton = document.querySelector('.app-toolbar-controls .primary-button')?.getBoundingClientRect()

    return {
      heroHeight: chrome?.height ?? 0,
      toolbarHeight: toolbar?.height ?? 0,
      primaryRowWidth: primaryRow?.width ?? 0,
      gameWidth: select?.width ?? 0,
      selectTop: select?.top ?? 0,
      selectRight: select?.right ?? 0,
      languageWidth: languageSelect?.width ?? 0,
      buttonTop: createButton?.top ?? 0,
      createButtonWidth: createButton?.width ?? 0,
      sessionTop: sessionSelect?.top ?? 0,
      sessionWidth: sessionSelect?.width ?? 0,
      languageLeft: languageSelect?.left ?? 0,
      languageTop: languageSelect?.top ?? 0,
    }
  })

  expect(Math.abs(heroHeights.heroHeight - heroHeights.toolbarHeight)).toBeLessThan(3)
  expect(heroHeights.gameWidth).toBeGreaterThan(0)
  expect(Math.abs(heroHeights.gameWidth - heroHeights.languageWidth)).toBeLessThan(4)
  expect(Math.abs(heroHeights.sessionWidth - heroHeights.createButtonWidth)).toBeLessThan(4)
  expect(heroHeights.languageLeft - heroHeights.selectRight).toBeGreaterThanOrEqual(8)
  expect(Math.abs(heroHeights.languageTop - heroHeights.selectTop)).toBeLessThan(6)
  expect(Math.abs(heroHeights.buttonTop - heroHeights.selectTop)).toBeLessThan(6)
  expect(Math.abs(heroHeights.sessionTop - heroHeights.buttonTop)).toBeLessThan(6)

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

  expect(messageFeedMetrics.feedHeight).toBeGreaterThan(0)
})

test('defaults the create-session flow to Chess', async ({ page, request }) => {
  await page.goto('/')
  const previousSessionId = await readSessionId(page)

  await page.getByRole('button', { name: 'Create Session' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Session' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Game' })).toHaveValue('chess')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page.getByRole('combobox', { name: 'Session' })).not.toHaveValue(previousSessionId)
  await expect(page.getByText('Game: Chess')).toBeVisible()
  const nextSessionId = await readSessionId(page)
  const nextSnapshot = await getSessionSnapshot(request, nextSessionId)
  expect((nextSnapshot as { state: { kind: string } }).state.kind).toBe('chess')
})

test('reflects external session moves in real time', async ({ page, request }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await selectGame(page, 'xiangqi')
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

  const previousSessionId = await readSessionId(page)
  await createSessionThroughUi(page, 'xiangqi')
  await expect(page.getByText('Sync: live')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Session' })).not.toHaveValue(previousSessionId)

  const sessionId = await readSessionId(page)
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
  await messageFeedCard.getByText('Reasoning Summary').last().click()
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

test('refreshes and switches to an externally created session', async ({ page, request }) => {
  await page.goto('/')
  await selectGame(page, 'gomoku')
  await createSessionThroughUi(page, 'gomoku')

  const sessionSelect = page.getByRole('combobox', { name: 'Session' })
  const createResponse = await request.post(`${apiBaseUrl}/api/sessions`, {
    data: {
      gameId: 'gomoku',
      actorKind: 'agent',
      channel: 'mcp',
    },
  })
  expect(createResponse.ok()).toBe(true)
  const createdSession = (await createResponse.json()) as { id: string }

  const moveResponse = await request.post(`${apiBaseUrl}/api/sessions/${createdSession.id}/moves`, {
    data: {
      point: 'h8',
      actorKind: 'agent',
      channel: 'mcp',
      reasoning: {
        summary: 'Occupy the center-adjacent point to start a balanced Gomoku shape.',
        reasoningSteps: ['Opening near the center maximizes future connection options.'],
        confidence: 0.62,
      },
    },
  })
  expect(moveResponse.ok()).toBe(true)

  await page.locator('.app-toolbar').getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect
    .poll(async () => {
      return await sessionSelect.evaluate(
        (element, expectedSessionId) =>
          Array.from((element as HTMLSelectElement).options).some(
            (option) => option.value === expectedSessionId,
          ),
        createdSession.id,
      )
    })
    .toBe(true)
  await sessionSelect.selectOption(createdSession.id)

  await expect(sessionSelect).toHaveValue(createdSession.id)
  await expect(page.getByText('Turn: white')).toBeVisible()
  await expect(page.getByText('black played h8.')).toBeVisible()
})

test('keeps the workbench controls aligned and leaves room in a single-message feed', async ({
  page,
}) => {
  await page.goto('/')
  await selectGame(page, 'gomoku')
  await createSessionThroughUi(page, 'gomoku')

  await expect(page.getByText('Game: Gomoku')).toBeVisible()

  const layoutMetrics = await page.evaluate(() => {
    const chrome = document.querySelector('.app-chrome')?.getBoundingClientRect()
    const toolbar = document.querySelector('.app-toolbar')?.getBoundingClientRect()
    const controls = document.querySelectorAll('.app-toolbar-controls select')
    const select = controls.item(0)?.getBoundingClientRect()
    const languageSelect = controls.item(1)?.getBoundingClientRect()
    const sessionSelect = controls.item(2)?.getBoundingClientRect()
    const createButton = document.querySelector('.app-toolbar-controls .primary-button')?.getBoundingClientRect()
    const feedList = document.querySelector('.message-feed-list')?.getBoundingClientRect()
    const firstItem = document.querySelector('.message-feed-item')?.getBoundingClientRect()
    const playersPanel = document.querySelector('.panel-card-side-rail')?.getBoundingClientRect()

    return {
      heroHeight: chrome?.height ?? 0,
      toolbarHeight: toolbar?.height ?? 0,
      selectTop: select?.top ?? 0,
      selectRight: select?.right ?? 0,
      buttonTop: createButton?.top ?? 0,
      sessionTop: sessionSelect?.top ?? 0,
      languageLeft: languageSelect?.left ?? 0,
      languageTop: languageSelect?.top ?? 0,
      feedHeight: feedList?.height ?? 0,
      firstItemHeight: firstItem?.height ?? 0,
      messageCount: document.querySelectorAll('.message-feed-item').length,
      playersBottom: playersPanel?.bottom ?? 0,
      feedTop: feedList?.top ?? 0,
    }
  })

  expect(Math.abs(layoutMetrics.heroHeight - layoutMetrics.toolbarHeight)).toBeLessThan(3)
  expect(layoutMetrics.languageLeft - layoutMetrics.selectRight).toBeGreaterThanOrEqual(8)
  expect(Math.abs(layoutMetrics.languageTop - layoutMetrics.selectTop)).toBeLessThan(6)
  expect(Math.abs(layoutMetrics.buttonTop - layoutMetrics.selectTop)).toBeLessThan(6)
  expect(Math.abs(layoutMetrics.sessionTop - layoutMetrics.buttonTop)).toBeLessThan(6)
  expect(layoutMetrics.playersBottom).toBeLessThanOrEqual(layoutMetrics.feedTop)
  expect(layoutMetrics.messageCount).toBeLessThan(3)
  expect(layoutMetrics.feedHeight).toBeGreaterThan(0)
})

test('switches the shared interface to Chinese', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-CN')
  await page.getByRole('combobox', { name: '游戏' }).selectOption('gomoku')
  await page.getByRole('button', { name: '创建对局' }).click()
  const dialog = page.getByRole('dialog', { name: '创建对局' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox', { name: '游戏' }).selectOption('gomoku')
  await dialog.getByRole('button', { name: '创建', exact: true }).click()

  await expect(page.getByText('Human Agent Playground')).toBeVisible()
  await expect(page.getByText('游戏: 五子棋')).toBeVisible()
  await expect(page.getByText('同步: 实时同步')).toBeVisible()
  await expect(page.getByText('当前行棋: 黑方')).toBeVisible()
  await expect(page.getByRole('heading', { name: '消息流' })).toBeVisible()
  await expect(page.getByText('已创建对局')).toBeVisible()
})

test('creates a Chess session and plays a legal opening move', async ({ page }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await selectGame(page, 'chess')
  await createSessionThroughUi(page, 'chess')

  await expect(page.getByText('Game: Chess')).toBeVisible()
  await expect(page.getByText('Turn: white')).toBeVisible()

  await page.locator('[data-square="e2"]').click()
  await expect(page.locator('[data-square="e4"]')).toHaveClass(/chess-square-target/)
  await page.locator('[data-square="e4"]').click()

  await expect(page.getByText('Turn: black')).toBeVisible()
  await expect(messageFeedCard.getByText('e2 → e4')).toBeVisible()
  await expect(messageFeedCard.getByText('SAN: e4')).toBeVisible()
  await expect(page.locator('[data-square="e2"]')).toHaveClass(/chess-square-last-from/)
  await expect(page.locator('[data-square="e4"]')).toHaveClass(/chess-square-last-to/)
})

test('keeps the toolbar game selection when opening create session', async ({ page }) => {
  await page.goto('/')
  await selectGame(page, 'gomoku')
  await page.getByRole('button', { name: 'Create Session' }).click()

  const dialog = page.getByRole('dialog', { name: 'Create Session' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Game' })).toHaveValue('gomoku')
})

test('auto-plays a black Chess seat through the Rust bridge after a human move', async ({
  page,
  request,
}) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await selectGame(page, 'chess')
  const previousSessionId = await readSessionId(page)
  await createSessionThroughUi(page, 'chess')
  await expect(page.getByRole('combobox', { name: 'Session' })).not.toHaveValue(previousSessionId)

  const sessionId = await readSessionId(page)
  expect(sessionId).toBeTruthy()
  await expect(page.getByText('Sync: live')).toBeVisible()
  const profileName = `Chess E2E ${Date.now()}`
  await configureOpenAiProviderThroughApi(request, profileName, 'gpt-5')
  await configureAiSeatThroughUi(page, 'black', 'openai', 'gpt-5')
  await expect
    .poll(async () => {
      const snapshot = await getSessionSnapshot(request, sessionId)
      return Boolean(
        snapshot.aiSeats?.black?.enabled && snapshot.aiSeats?.black?.model === 'gpt-5',
      )
    })
    .toBe(true)
  const blackPlayerChip = page.locator('.players-seat-card').filter({
    hasText: 'black',
  }).first()
  await expect(blackPlayerChip).toContainText(/idle|waiting/)

  await page.locator('[data-square="e2"]').click()
  await page.locator('[data-square="e4"]').click()

  await expect(messageFeedCard.getByText('e2 → e4')).toBeVisible()
  await expect
    .poll(
      async () => {
        const snapshot = await getSessionSnapshot(request, sessionId)
        return {
          events: snapshot.events.length,
          turn: snapshot.state.turn,
        }
      },
      { timeout: 10_000 },
    )
    .toEqual({
      events: 3,
      turn: 'white',
    })
  await expect(blackPlayerChip).toContainText('idle')
  await expect
    .poll(async () => await page.locator('.message-feed-item').count(), { timeout: 10_000 })
    .toBeGreaterThan(2)
  await expect(page.getByText('Turn: white')).toBeVisible()
  await expect(messageFeedCard.locator('.message-feed-summary', { hasText: /restflow-bridge/i })).toBeVisible()
  await expect(messageFeedCard.locator('.message-feed-summary', { hasText: /gpt-5/i })).toBeVisible()
})

test('creates a Gomoku session and reflects placed stones in real time', async ({ page, request }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await selectGame(page, 'gomoku')
  await createSessionThroughUi(page, 'gomoku')

  await expect(page.getByText('Game: Gomoku')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
  await expect(page.locator('[data-point="h8"]')).toBeVisible()
  await expect(page.locator('[data-point="d12"] .gomoku-star-point')).toBeVisible()

  await page.locator('[data-point="h8"]').click()

  await expect(messageFeedCard.locator('strong', { hasText: 'h8' })).toBeVisible()
  await expect(messageFeedCard.getByText('Placed ●')).toBeVisible()
  await expect(page.getByText('Turn: white')).toBeVisible()
  await expect(page.locator('[data-point="h8"]')).toHaveClass(/gomoku-point-last/)

  const sessionId = await readSessionId(page)
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
  await messageFeedCard.getByText('Reasoning Summary').last().click()
  await expect(messageFeedCard.getByText('Mirror the center extension to fight for the same row immediately.')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
  await expect(page.locator('[data-point="i8"]')).toHaveClass(/gomoku-point-last/)
})

test('auto-plays a white Gomoku seat through the Rust bridge after a human move', async ({
  page,
  request,
}) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await selectGame(page, 'gomoku')
  const previousSessionId = await readSessionId(page)
  await createSessionThroughUi(page, 'gomoku')
  await expect(page.getByRole('combobox', { name: 'Session' })).not.toHaveValue(previousSessionId)

  const sessionId = await readSessionId(page)
  expect(sessionId).toBeTruthy()
  await expect(page.getByText('Sync: live')).toBeVisible()
  const profileName = `Gomoku E2E ${Date.now()}`
  const profileResponse = await request.post(`${apiBaseUrl}/api/ai/auth-profiles`, {
    data: {
      name: profileName,
      provider: 'openai',
      credentialType: 'api_key',
      credentialValue: `sk-test-${Date.now()}`,
    },
  })
  expect(profileResponse.ok()).toBe(true)
  const profile = (await profileResponse.json()) as { id: string }

  const runtimeResponse = await request.get(`${apiBaseUrl}/api/ai/runtime-settings`)
  expect(runtimeResponse.ok()).toBe(true)
  const runtimePayload = (await runtimeResponse.json()) as {
    settings: {
      providers: Array<{
        providerId: string
        displayName: string | null
        defaultModel: string | null
        defaultProfileId: string | null
        preferredSource: 'api' | 'cli' | null
      }>
    }
  }
  runtimePayload.settings.providers = runtimePayload.settings.providers.map((provider) =>
    provider.providerId === 'openai'
      ? {
          ...provider,
          displayName: profileName,
          defaultModel: 'gpt-5',
          defaultProfileId: profile.id,
        }
      : provider,
  )
  const saveRuntimeResponse = await request.put(`${apiBaseUrl}/api/ai/runtime-settings`, {
    data: runtimePayload.settings,
  })
  expect(saveRuntimeResponse.ok()).toBe(true)

  const startSeatResponse = await request.patch(
    `${apiBaseUrl}/api/sessions/${sessionId}/ai-seats/white/launcher`,
    {
      data: {
        launcher: 'openai',
        model: 'gpt-5',
        autoPlay: true,
      },
    },
  )
  expect(startSeatResponse.ok()).toBe(true)
  await expect
    .poll(async () => {
      const snapshot = await getSessionSnapshot(request, sessionId)
      return Boolean(
        snapshot.aiSeats?.white?.enabled && snapshot.aiSeats?.white?.model === 'gpt-5',
      )
    })
    .toBe(true)

  await page.locator('[data-point="h8"]').click()

  await expect(messageFeedCard.locator('strong', { hasText: 'h8' })).toBeVisible()
  await expect
    .poll(
      async () => {
        const snapshot = await getSessionSnapshot(request, sessionId)
        return {
          events: snapshot.events.length,
          turn: snapshot.state.turn,
        }
      },
      { timeout: 10_000 },
    )
    .toEqual({
      events: 3,
      turn: 'black',
    })
  await expect
    .poll(async () => await page.locator('.message-feed-item').count(), { timeout: 10_000 })
    .toBeGreaterThan(2)
  await expect(page.getByText('Turn: black')).toBeVisible()
  await expect(messageFeedCard.locator('.message-feed-summary', { hasText: /restflow-bridge/i })).toBeVisible()
  await expect(messageFeedCard.locator('.message-feed-summary', { hasText: /gpt-5/i })).toBeVisible()
})

test('shows a game-over dialog for a finished Gomoku session and can restart it', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await selectGame(page, 'gomoku')
  const previousSessionId = await readSessionId(page)
  await createSessionThroughUi(page, 'gomoku')
  await expect(page.getByRole('combobox', { name: 'Session' })).not.toHaveValue(previousSessionId)
  await expect(page.getByText('Game: Gomoku')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()

  const sessionId = await readSessionId(page)
  expect(sessionId).toBeTruthy()

  const scriptedMoves = [
    { point: 'h8' },
    { point: 'h7' },
    { point: 'i8' },
    { point: 'i7' },
    { point: 'j8' },
    { point: 'j7' },
    { point: 'k8' },
    { point: 'k7' },
    { point: 'l8' },
  ]

  for (const move of scriptedMoves) {
    const response = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/moves`, {
      data: move,
    })

    expect(response.ok()).toBe(true)
  }

  const dialog = page.getByRole('dialog')

  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Game Over')).toBeVisible()
  await expect(dialog.getByText('Winner: black')).toBeVisible()

  await page.getByRole('button', { name: 'Restart' }).click()

  await expect(page.getByText('Turn: black')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('opens AI settings when a CLI launcher is unavailable for a seat launcher', async ({
  page,
  request,
}) => {
  const providerCatalog = await listProviderCatalog(request)
  const unavailableLauncher = [
    { providerId: 'codex-cli', launcher: 'codex', label: 'Codex' },
    { providerId: 'claude-code', launcher: 'claude_code', label: 'Claude Code' },
    { providerId: 'gemini-cli', launcher: 'gemini', label: 'Gemini' },
  ].find(({ providerId }) => {
    const provider = providerCatalog.providers.find((candidate) => candidate.id === providerId)
    return provider?.available === false
  })

  if (!unavailableLauncher) {
    return
  }

  await page.goto('/')
  await selectGame(page, 'gomoku')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.getByRole('combobox', { name: 'Launcher white' }).selectOption(
    unavailableLauncher.launcher,
  )
  await expect(page.getByRole('combobox', { name: 'Launcher white' })).toHaveValue(
    unavailableLauncher.launcher,
  )
  await page.getByRole('button', { name: 'Create' }).click()

  const dialog = page.locator('.ai-settings-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/is unavailable on this machine|is not configured yet/i)).toBeVisible()
  await expect(
    dialog.locator('.ai-settings-provider-card-focused').getByText(unavailableLauncher.label),
  ).toBeVisible()
})

test('shows visible feedback after saving CLI provider settings', async ({ page }) => {
  let runtimePayload: unknown
  let currentSettings: unknown

  await page.route('**/api/ai/runtime-settings', async (route, request) => {
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { settings?: unknown }
      currentSettings = body.settings ?? currentSettings
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          settings: currentSettings,
        }),
      })
      return
    }

    if (!runtimePayload) {
      runtimePayload = {
        settings: {
          providers: [
            {
              providerId: 'openai',
              displayName: 'OpenAI Default',
              defaultModel: 'gpt-5',
              defaultProfileId: 'profile-openai',
              preferredSource: null,
            },
            {
              providerId: 'anthropic',
              displayName: null,
              defaultModel: 'claude-sonnet-4.5',
              defaultProfileId: null,
              preferredSource: null,
            },
            {
              providerId: 'codex',
              displayName: null,
              defaultModel: 'codex-mini-latest',
              defaultProfileId: null,
              preferredSource: null,
            },
            {
              providerId: 'claude_code',
              displayName: null,
              defaultModel: 'claude-code-sonnet',
              defaultProfileId: null,
              preferredSource: null,
            },
            {
              providerId: 'gemini',
              displayName: null,
              defaultModel: 'gemini-2.5-pro',
              defaultProfileId: null,
              preferredSource: 'api',
            },
          ],
        },
        profiles: [],
        providers: [
          {
            id: 'openai',
            label: 'OpenAI',
            kind: 'api',
            available: true,
            status: 'ready',
            authProviders: ['openai'],
            models: [
              {
                id: 'gpt-5',
                label: 'GPT-5',
                provider: 'openai',
                supportsTemperature: true,
              },
            ],
          },
          {
            id: 'codex-cli',
            label: 'Codex CLI',
            kind: 'cli',
            available: false,
            status: 'missing_command:codex',
            authProviders: [],
            models: [
              {
                id: 'codex-mini-latest',
                label: 'Codex CLI · Codex GPT-5',
                provider: 'codex-cli',
                supportsTemperature: false,
              },
            ],
          },
          {
            id: 'claude-code',
            label: 'Claude Code',
            kind: 'cli',
            available: true,
            status: 'ready',
            authProviders: [],
            models: [
              {
                id: 'claude-code-sonnet',
                label: 'Claude Code Sonnet',
                provider: 'claude-code',
                supportsTemperature: false,
              },
            ],
          },
        ],
      }
      currentSettings = (runtimePayload as { settings: unknown }).settings
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...(runtimePayload as object),
        settings: currentSettings,
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'AI Settings' }).click()

  const dialog = page.locator('.ai-settings-dialog')
  await expect(dialog).toBeVisible()

  const codexCard = dialog
    .locator('.ai-settings-provider-card')
    .filter({ hasText: 'Codex' })
    .first()
  await codexCard.getByRole('button', { name: 'Save Settings' }).click()

  await expect(dialog.getByText('Saved settings for Codex CLI.')).toBeVisible()
})

test('shows a Claude Code sign-in warning when the CLI is installed but not logged in', async ({
  page,
  request,
}) => {
  const runtimeResponse = await request.get(`${apiBaseUrl}/api/ai/runtime-settings`)
  expect(runtimeResponse.ok()).toBe(true)
  const runtimePayload = (await runtimeResponse.json()) as {
    settings: unknown
    profiles: unknown[]
    providers: Array<{
      id: string
      label: string
      kind: string
      available: boolean
      status: string
      authProviders: string[]
      models: Array<{
        id: string
        label: string
        provider: string
        supportsTemperature: boolean
      }>
    }>
  }

  await page.route('**/api/ai/runtime-settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...runtimePayload,
        providers: runtimePayload.providers.map((provider) =>
          provider.id === 'claude-code'
            ? {
                ...provider,
                available: false,
                status: 'not_logged_in',
              }
            : provider,
        ),
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'AI Settings' }).click()

  const dialog = page.locator('.ai-settings-dialog')
  const claudeCard = dialog
    .locator('.ai-settings-provider-card')
    .filter({ hasText: 'Claude Code' })
    .first()

  await expect(claudeCard.getByText('not signed in')).toBeVisible()
  await claudeCard.getByRole('button', { name: 'Test' }).click()
  await expect(dialog.getByText('Claude Code is installed, but you are not signed in yet.')).toBeVisible()
})

test('stops an auto-play seat when the launcher is switched back to human', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await selectGame(page, 'gomoku')
  const previousSessionId = await readSessionId(page)
  await createSessionThroughUi(page, 'gomoku')
  await expect(page.getByRole('combobox', { name: 'Session' })).not.toHaveValue(previousSessionId)

  const sessionId = await readSessionId(page)
  const profileName = `Stop Seat ${Date.now()}`
  const profileResponse = await request.post(`${apiBaseUrl}/api/ai/auth-profiles`, {
    data: {
      name: profileName,
      provider: 'openai',
      credentialType: 'api_key',
      credentialValue: `sk-test-${Date.now()}`,
    },
  })
  expect(profileResponse.ok()).toBe(true)
  const profile = (await profileResponse.json()) as { id: string }

  const runtimeResponse = await request.get(`${apiBaseUrl}/api/ai/runtime-settings`)
  expect(runtimeResponse.ok()).toBe(true)
  const runtimePayload = (await runtimeResponse.json()) as {
    settings: {
      providers: Array<{
        providerId: string
        displayName: string | null
        defaultModel: string | null
        defaultProfileId: string | null
        preferredSource: 'api' | 'cli' | null
      }>
    }
  }
  runtimePayload.settings.providers = runtimePayload.settings.providers.map((provider) =>
    provider.providerId === 'openai'
      ? {
          ...provider,
          displayName: profileName,
          defaultModel: 'gpt-5',
          defaultProfileId: profile.id,
        }
      : provider,
  )
  const saveRuntimeResponse = await request.put(`${apiBaseUrl}/api/ai/runtime-settings`, {
    data: runtimePayload.settings,
  })
  expect(saveRuntimeResponse.ok()).toBe(true)

  const startSeatResponse = await request.patch(
    `${apiBaseUrl}/api/sessions/${sessionId}/ai-seats/white/launcher`,
    {
      data: {
        launcher: 'openai',
        model: 'gpt-5',
        autoPlay: true,
      },
    },
  )
  expect(startSeatResponse.ok()).toBe(true)

  await page.getByRole('button', { name: 'Edit Players' }).click()
  await expect(page.getByRole('combobox', { name: 'Launcher white' })).toHaveValue('openai')
  await page.getByRole('combobox', { name: 'Launcher white' }).selectOption('human')
  await page.getByRole('button', { name: 'Save Players' }).click()

  const playersSummary = page.locator('.players-panel-list')
  await expect(playersSummary.getByText('white').first()).toBeVisible()
  await expect(
    playersSummary.locator('.players-seat-card').filter({ hasText: 'white' }).getByText('Human'),
  ).toBeVisible()

  await page.locator('[data-point="h8"]').click()
  await expect(page.getByText('Turn: white')).toBeVisible()

  await page.waitForTimeout(1500)
  const snapshot = await getSessionSnapshot(request, sessionId)
  expect(snapshot.events).toHaveLength(2)
  expect(snapshot.state.turn).toBe('white')
})

test('creates a Connect Four session and drops a legal opening disc', async ({ page }) => {
  const messageFeedCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Message Feed' }),
  })

  await page.goto('/')
  await selectGame(page, 'connect-four')
  await createSessionThroughUi(page, 'connect-four')

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
  await selectGame(page, 'othello')
  await createSessionThroughUi(page, 'othello')

  await expect(page.getByText('Game: Othello')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
  await expect(page.locator('.othello-disc')).toHaveCount(4)
  await expect(page.locator('.othello-legal-marker')).toHaveCount(4)

  const sessionId = await readSessionId(page)
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
  await messageFeedCard.getByText('Reasoning Summary').last().click()
  await expect(messageFeedCard.getByText('Take the standard opening edge and flip one central disc.')).toBeVisible()
  await expect(page.getByText('Turn: white')).toBeVisible()
  await expect(page.locator('[data-point="d3"]')).toHaveClass(/othello-cell-last/)
})
