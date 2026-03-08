import { expect, test } from '@playwright/test'

const apiBaseUrl = process.env.PLAYGROUND_API_URL ?? 'http://127.0.0.1:8787'

test('creates a Xiangqi session and plays a legal opening move', async ({ page }) => {
  const lastMoveCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Last Move' }),
  })

  await page.goto('/')

  await expect(page.getByText('Shared Tabletop Sessions For Humans And Agents')).toBeVisible()
  await expect(page.getByText('楚河')).toBeVisible()
  await expect(page.getByText('汉界')).toBeVisible()
  await expect(page.locator('.board-cell-river-line')).toHaveCount(9)
  await expect(page.locator('.mono').first()).toBeVisible()
  const previousSessionId = (await page.locator('.mono').first().textContent())?.trim()
  await page.getByRole('button', { name: 'Create Session' }).click()
  await expect(page.getByText('Sync: live')).toBeVisible()
  await expect(page.getByText('Turn: red')).toBeVisible()
  await expect(page.locator('.mono').first()).not.toHaveText(previousSessionId ?? '')

  await page.locator('[data-square="a4"]').click()
  await expect(page.locator('[data-square="a5"]')).toHaveClass(/board-cell-target/)

  await page.locator('[data-square="a5"]').click()

  await expect(lastMoveCard.getByText('a4 → a5')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
})

test('reflects external session moves in real time', async ({ page, request }) => {
  const lastMoveCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Last Move' }),
  })
  const recentActivityCard = page.locator('.panel-card', {
    has: page.getByRole('heading', { name: 'Recent Activity' }),
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

  const response = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/moves`, {
    data: {
      from: 'a4',
      to: 'a5',
    },
  })

  expect(response.ok()).toBe(true)
  await expect(lastMoveCard.getByText('a4 → a5')).toBeVisible()
  await expect(recentActivityCard.getByText('No earlier moves yet.')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()

  const secondResponse = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/moves`, {
    data: {
      from: 'a7',
      to: 'a6',
    },
  })

  expect(secondResponse.ok()).toBe(true)
  await expect(lastMoveCard.getByText('a7 → a6')).toBeVisible()
  await expect(recentActivityCard.getByText('a4 → a5')).toBeVisible()
  await expect(page.getByText('Turn: red')).toBeVisible()

  const thirdResponse = await request.post(`${apiBaseUrl}/api/sessions/${sessionId}/moves`, {
    data: {
      from: 'a5',
      to: 'a6',
    },
  })

  expect(thirdResponse.ok()).toBe(true)
  await expect(page.getByText('Recent Activity')).toBeVisible()
  await expect(lastMoveCard.getByText('a5 → a6')).toBeVisible()
  await expect(lastMoveCard.getByText('兵 captured 卒')).toBeVisible()
  await expect(recentActivityCard.getByText('a7 → a6')).toBeVisible()
  await expect(recentActivityCard.getByText('Black 卒')).toBeVisible()
  await expect(page.locator('[data-square="a5"]')).toHaveClass(/board-cell-last-from/)
  await expect(page.locator('[data-square="a6"]')).toHaveClass(/board-cell-last-to/)
  await expect(recentActivityCard.getByText('a4 → a5')).toBeVisible()
})
