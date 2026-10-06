import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { StrKey } from '@stellar/stellar-sdk'
import { TESTNET_USDC_ADDRESS, TESTNET_XLM_ADDRESS } from '../../src/lib/tokens'

// Controlled quote responses exercise UI races only. No contract execution,
// signature, or ledger-confirmation response is simulated by these tests.
type Request = { action: string; amount: string; resolve: (value: { expected: string; minimum: string; maxB?: string }) => void; reject: (error: Error) => void }
type QuoteWindow = Window & { quoteRequests: Request[] }
async function controlQuotes(page: Page) {
  await page.route('**/src/lib/executor.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export function quoteAction(action, amount) {
      return new Promise((resolve, reject) => {
        (window.quoteRequests ??= []).push({ action, amount, resolve, reject });
      });
    }`,
  }))
}
async function waitForAmount(page: Page, amount: string, count = 1) {
  await page.waitForFunction(({ amount, count }) => ((window as QuoteWindow).quoteRequests ?? []).filter(request => request.amount === amount).length >= count, { amount, count })
}
async function resolveQuote(page: Page, amount: string, expected: string, minimum: string) {
  await page.evaluate(({ amount, expected, minimum }) => {
    const request = (window as QuoteWindow).quoteRequests.findLast(request => request.amount === amount)
    if (!request) throw new Error('No pending quote')
    request.resolve({ expected, minimum })
  }, { amount, expected, minimum })
}

test('automatic quotes discard late responses and preserve manually chosen minimums', async ({ page }) => {
  await controlQuotes(page)
  await page.goto('/')
  await waitForAmount(page, '1')
  await resolveQuote(page, '1', '1.25', '1.2375')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('1.2375')

  await page.getByLabel('Maximum spending amount').fill('2')
  await waitForAmount(page, '2')
  await page.getByLabel('Maximum spending amount').fill('3')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('')
  await waitForAmount(page, '3')
  await resolveQuote(page, '3', '3.5', '3.465')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('3.465')
  await resolveQuote(page, '2', '2.5', '2.475')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('3.465')

  await page.getByLabel('Minimum receipt amount').fill('4')
  await page.getByRole('button', { name: 'Refresh live quote' }).click()
  await waitForAmount(page, '3', 2)
  await resolveQuote(page, '3', '3.6', '3.564')
  await expect(page.getByText('Expected receipt: 3.6 USDC')).toBeVisible()
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('4')
  await page.getByRole('button', { name: 'Use automatic minimum · 1% tolerance' }).click()
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('3.564')
  await page.getByLabel('Intent expiration').selectOption('5')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('3.564')

  await page.getByLabel('Maximum spending amount').fill('')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('')
  await expect(page.getByText('Enter an amount to see the live quote.')).toBeVisible()
})

test('failed quote updates clear old automatic bounds and block preparation until retry succeeds', async ({ page }) => {
  await controlQuotes(page)
  await page.addInitScript(config => localStorage.setItem('caveat-deployment', JSON.stringify(config)), {
    account: StrKey.encodeContract(new Uint8Array(32)),
    router: 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
    input: TESTNET_XLM_ADDRESS, output: TESTNET_USDC_ADDRESS,
  })
  // Only the wallet connection is stubbed; these tests never invoke signing.
  await page.route('**/src/lib/stellar.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `export async function restoreWallet() { return ''; } export async function connectWallet() { return 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'; }` }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await expect(page.getByText('Testnet wallet connected.')).toBeVisible()
  await page.waitForTimeout(450)
  await waitForAmount(page, '1')
  await resolveQuote(page, '1', '0.5', '0.495')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('0.495')
  await expect(page.getByRole('button', { name: 'Prepare & review intent' })).toBeEnabled()

  const count = await page.evaluate(() => (window as QuoteWindow).quoteRequests.length)
  await page.getByRole('button', { name: 'Refresh live quote' }).click()
  await waitForAmount(page, '1', count + 1)
  await page.evaluate(() => (window as QuoteWindow).quoteRequests.at(-1)!.reject(new Error('RPC unavailable')))
  await expect(page.getByText('RPC unavailable', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Prepare & review intent' })).toBeDisabled()
  await expect(page.locator('a[href*="/tx/"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Retry live quote' }).click()
  await waitForAmount(page, '1', count + 2)
  await resolveQuote(page, '1', '0.6', '0.594')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('0.594')
  await expect(page.getByRole('button', { name: 'Prepare & review intent' })).toBeEnabled()
})

test('liquidity uses a separate quote and signed matched-token cap without an account deposit', async ({ page }) => {
  await controlQuotes(page)
  await page.goto('/')
  await waitForAmount(page, '1')
  await page.getByRole('button', { name: 'Provide liquidity', exact: true }).click()
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('')
  await page.waitForFunction(() => (window as QuoteWindow).quoteRequests?.some(request => request.action === 'liquidity'))
  await page.evaluate(() => {
    const requests = (window as QuoteWindow).quoteRequests
    requests.findLast(request => request.action === 'liquidity')!.resolve({ expected: '0.003', minimum: '0.00297', maxB: '0.106' })
    requests.find(request => request.action === 'swap')!.resolve({ expected: '0.1', minimum: '0.099' })
  })
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('0.00297')
  await expect(page.getByText('0.106', { exact: true })).toBeVisible()
  await expect(page.getByText('Expected receipt: 0.003 pool shares')).toBeVisible()
  await expect(page.getByText('Create your Caveat account to start.')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/liquidity-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Swap', exact: true }).click()
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('')
  await expect(page.getByText('Matched test USDC', { exact: true })).toHaveCount(0)
})
