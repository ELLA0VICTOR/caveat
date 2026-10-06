import { test, expect } from '@playwright/test'

test('separate SDK integration opens its own working interface without fabricated receipts', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort())
  await page.goto('/integrations/pool/index.html')
  await expect(page.getByRole('heading', { name: 'Two tokens in. Pool shares out.' })).toBeVisible()
  await expect(page.getByText('A SEPARATE APP · POWERED BY THE CAVEAT SDK')).toBeVisible()
  await expect(page.getByLabel('Maximum XLM contribution')).toHaveValue('1')
  await expect(page.getByRole('button', { name: 'Review pool deposit' })).toBeDisabled()
  await expect(page.locator('a[href*="/tx/"]')).toHaveCount(0)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.screenshot({ path: 'test-results/integration-mobile.png', fullPage: true })
  expect(errors).toEqual([])
})
