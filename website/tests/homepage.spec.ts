import { expect, test } from '@playwright/test'

test('renders the landing page with the local-agent positioning', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'One shared game table for humans and AI agent apps.' }),
  ).toBeVisible()
  await expect(page.locator('.hero-badges li', { hasText: 'Codex' })).toBeVisible()
  await expect(page.locator('.hero-badges li', { hasText: 'Claude Code' })).toBeVisible()
  await expect(page.getByText('Live demo target not configured yet.')).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'A finished shared Xiangqi session with the board, move feed, and session controls.' }),
  ).toBeVisible()
})
