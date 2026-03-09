import { expect, test } from '@playwright/test'

test('renders the landing page with the local-agent positioning', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'One shared game table for humans and AI agent apps.' }),
  ).toBeVisible()
  await expect(page.locator('.hero-badges li', { hasText: 'Codex' })).toBeVisible()
  await expect(page.locator('.hero-badges li', { hasText: 'Claude Code' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Show the real interaction model without deploying a live backend.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Autoplay' })).toBeVisible()
  await expect(page.getByText('Replay one shared session directly on the landing page.')).toBeVisible()
  await expect(
    page.getByText('Session created'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.locator('.demo-feed-card strong', { hasText: 'b3 -> b10' })).toBeVisible()
  await expect(page.getByText('Move 1')).toBeVisible()
})
