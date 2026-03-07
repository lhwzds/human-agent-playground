import { expect, test } from '@playwright/test'

test('creates a Xiangqi session and plays a legal opening move', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Shared Tabletop Sessions For Humans And Agents')).toBeVisible()
  await page.getByRole('button', { name: 'Create Session' }).click()
  await expect(page.getByText('Sync: live')).toBeVisible()

  await page.locator('[data-square="a4"]').click()
  await expect(page.locator('[data-square="a5"].board-cell-target')).toBeVisible()

  await page.locator('[data-square="a5"]').click()

  await expect(page.getByText('a4 → a5')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
})

test('reflects external session moves in real time', async ({ page, request }) => {
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

  const resetResponse = await request.post(`http://127.0.0.1:8787/api/sessions/${sessionId}/reset`)
  expect(resetResponse.ok()).toBe(true)
  await expect(page.getByText('Turn: red')).toBeVisible()

  const response = await request.post(`http://127.0.0.1:8787/api/sessions/${sessionId}/moves`, {
    data: {
      from: 'a4',
      to: 'a5',
    },
  })

  expect(response.ok()).toBe(true)
  await expect(page.getByText('a4 → a5')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
})
