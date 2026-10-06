import { expect, test } from '@playwright/test'
import { MAINNET } from '@caveat/sdk'

type NetworkQuote = { network: string; resolve: (quote: { expected: string; minimum: string }) => void }
type NetworkWindow = Window & { networkQuotes?: NetworkQuote[]; checkedNetwork?: string }

// Controlled quote/ledger responses exercise network isolation, never actual execution.
test('network switch discards Testnet terms, token addresses and late quotes', async ({ page }) => {
  await page.route('**/src/lib/executor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export function quoteAction(action, amount, direction, venue, network) {
      return new Promise(resolve => { (window.networkQuotes ??= []).push({ network, resolve }); });
    }
  ` }))
  await page.goto('/')
  await page.waitForFunction(() => (window as NetworkWindow).networkQuotes?.some(q => q.network === 'testnet'))
  await page.getByLabel('Minimum receipt amount').fill('99')
  await page.getByLabel('Stellar network').selectOption('mainnet')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('')
  await page.waitForFunction(() => (window as NetworkWindow).networkQuotes?.some(q => q.network === 'mainnet'))
  await page.evaluate(() => {
    const quotes = (window as NetworkWindow).networkQuotes!
    quotes.find(q => q.network === 'mainnet')!.resolve({ expected: '0.2', minimum: '0.198' })
    quotes.find(q => q.network === 'testnet')!.resolve({ expected: '99', minimum: '98' })
  })
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('0.198')
  await expect(page.locator(`[title="${MAINNET.route.token_a}"]`)).toBeVisible()
  await expect(page.locator(`[title="${MAINNET.route.token_b}"]`)).toBeVisible()
  await expect(page.getByLabel('Swap venue')).toHaveCount(0)
  await expect(page.getByText(/Mainnet pilot · real funds/)).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Stellar network')).toHaveValue('mainnet')
})

test('Mainnet pending recovery uses Mainnet RPC and explorer and locks network changes', async ({ page }) => {
  const hash = 'e'.repeat(64)
  await page.addInitScript(hash => {
    localStorage.setItem('caveat-network', 'mainnet')
    localStorage.setItem('caveat-action-pending', JSON.stringify({ hash: 'f'.repeat(64), action: 'swap' }))
    localStorage.setItem('caveat-mainnet-action-pending', JSON.stringify({ hash, action: 'swap', direction: 'usdc-to-xlm' }))
  }, hash)
  await page.route('**/src/lib/executor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `export async function quoteAction() { return { expected: '0.2', minimum: '0.198' }; }` }))
  await page.route('**/src/lib/stellar.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function restoreWallet() { return ''; }
    export async function transactionStatus(hash, network) { window.checkedNetwork = network; return { hash, status: 'pending' }; }
  ` }))
  await page.goto('/')
  const dialog = page.getByRole('dialog', { name: 'Transaction status' })
  await expect(dialog.getByRole('link', { name: /View on Stellar Expert/ })).toHaveAttribute('href', `${MAINNET.explorer}/tx/${hash}`)
  await expect(page.getByLabel('Stellar network')).toBeDisabled()
  await dialog.getByRole('button', { name: 'Check confirmation', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as NetworkWindow).checkedNetwork)).toBe('mainnet')
  await expect(dialog.getByRole('heading', { name: 'Awaiting confirmation' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('caveat-action-pending'))).toContain('f'.repeat(64))
})
