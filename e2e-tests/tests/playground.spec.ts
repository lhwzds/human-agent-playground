import { expect, test } from '@playwright/test'

test('creates a Xiangqi session and plays a legal opening move', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Shared Tabletop Sessions For Humans And Agents')).toBeVisible()
  await page.getByRole('button', { name: 'Create Session' }).click()

  await page.locator('[data-square="a4"]').click()
  await expect(page.locator('[data-square="a5"].board-cell-target')).toBeVisible()

  await page.locator('[data-square="a5"]').click()

  await expect(page.getByText('a4 → a5')).toBeVisible()
  await expect(page.getByText('Turn: black')).toBeVisible()
})
