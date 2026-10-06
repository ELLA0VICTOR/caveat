import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Controlled wallet/ledger fixtures verify UI transitions only. Contract and
// real-network protection are verified by the separate host and Testnet harnesses.
const owner = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
const hash = 'b'.repeat(64)
type Controls = Window & {
  transactionControls: { approve: () => void; submit: () => void; finish: (status: string) => void; decline: () => void }
  testLedgerStatus?: string
  testLedgerError?: boolean
}
async function controlTransactions(page: Page, trustline = true) {
  await page.addInitScript(value => { (window as Window & { testTrustline: boolean }).testTrustline = value }, trustline)
  await page.route('**/src/lib/executor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    const source = ${JSON.stringify(owner)};
    export async function quoteAction(action) { return action === 'liquidity' ? { expected: '0.3', minimum: '0.297', maxB: '0.10604' } : { expected: '0.105', minimum: '0.10395' }; }
    export const executor = {
      async verifyExecutor() {},
      async wallet() { return { xlm: '100', usdc: '10', shares: '0', nonce: 0n, trustline: window.testTrustline }; },
      async prepare(source, action, terms) { return { source, action, terms: { ...terms }, nonce: 0n, executor: 'CCQMSZDYKY7TO6O65FEH663CISHHNWWUFY7N56GD2CWYGKETELXX554O', expiresAt: Math.floor(Date.now()/1000)+600, fee: '100', xdr: 'UI fixture: no executable transaction', simulation: { spent_a: 0n, spent_b: 0n, received: 0n } }; },
      async prepareTrustline() { return { source, fee: '100', expiresAt: Math.floor(Date.now()/1000)+300, xdr: 'UI fixture: no executable transaction' }; }
    };
  ` }))
  await page.route('**/src/lib/stellar.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function restoreWallet() { return ${JSON.stringify(owner)}; }
    export async function connectWallet() { return ${JSON.stringify(owner)}; }
    const outcome = action => action === 'liquidity' ? { spent_a: 10000000n, spent_b: 1060400n, received: 3088669n } : { spent_a: 500000n, spent_b: 0n, received: 4701154n };
    export function submitTransaction(source, prepared, progress, submitted) {
      return new Promise((resolve, reject) => {
        window.transactionControls = {
          approve() { progress('Submitting your signed transaction…', 'submitting'); },
          submit() { submitted(${JSON.stringify(hash)}); },
          finish(status) { window.testTrustline = status === 'confirmed' || window.testTrustline; resolve({ hash: ${JSON.stringify(hash)}, status, value: prepared.action ? outcome(prepared.action) : undefined }); },
          decline() { reject(new Error('Wallet signature declined.')); }
        };
      });
    }
    export async function transactionStatus(hash) { if (window.testLedgerError) throw new Error('RPC temporarily unavailable.'); return { hash, status: window.testLedgerStatus ?? 'pending', value: outcome('swap') }; }
  ` }))
}
async function prepareAndSign(page: Page) {
  await expect(page.getByRole('button', { name: 'Prepare & review intent' })).toBeEnabled()
  await page.getByRole('button', { name: 'Prepare & review intent' }).click()
  await page.getByRole('button', { name: 'Sign & submit to testnet' }).click()
  await page.waitForFunction(() => Boolean((window as Controls).transactionControls))
}

test('swap status moves through wallet, submission, and measured confirmation in one modal', async ({ page }) => {
  await controlTransactions(page)
  await page.goto('/')
  await prepareAndSign(page)
  const dialog = page.getByRole('dialog', { name: 'Transaction status' })
  await expect(dialog.getByRole('heading', { name: 'Confirm in Freighter' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeDisabled()
  await page.evaluate(() => (window as Controls).transactionControls.approve())
  await expect(dialog.getByRole('heading', { name: 'Submitting transaction' })).toBeVisible()
  await expect(dialog.locator('a[href*="/tx/"]')).toHaveCount(0)
  await page.evaluate(() => (window as Controls).transactionControls.submit())
  await expect(dialog.getByRole('heading', { name: 'Awaiting confirmation' })).toBeVisible()
  await expect(dialog.getByRole('link', { name: /View on Stellar Expert/ })).toHaveAttribute('href', `https://stellar.expert/explorer/testnet/tx/${hash}`)
  await expect(dialog.getByRole('heading', { name: 'Swap complete' })).toHaveCount(0)
  await page.evaluate(() => (window as Controls).transactionControls.finish('confirmed'))
  await expect(dialog.getByRole('heading', { name: 'Swap complete' })).toBeVisible()
  await expect(dialog.locator('dd').last()).toHaveText('0.4701154 test USDC')
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.inline-feedback a[href*="/tx/"]')).toHaveCount(0)
  await page.getByRole('button', { name: /^Receipts/ }).click()
  await expect(page.locator('.receipt-record')).toHaveCount(1)
})

test('a declined signature and a failed ledger result have distinct transaction states', async ({ page }) => {
  await controlTransactions(page)
  await page.goto('/')
  await prepareAndSign(page)
  await page.evaluate(() => (window as Controls).transactionControls.decline())
  const dialog = page.getByRole('dialog', { name: 'Transaction status' })
  await expect(dialog.getByRole('heading', { name: 'Transaction interrupted' })).toBeVisible()
  await dialog.getByText('View error details').click()
  await expect(dialog.getByText('Wallet signature declined.')).toBeVisible()
  await expect(dialog.locator('a[href*="/tx/"]')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Done' }).click()
  await prepareAndSign(page)
  await page.evaluate(() => { (window as Controls).transactionControls.submit(); (window as Controls).transactionControls.finish('failed') })
  await expect(dialog.getByRole('heading', { name: 'Transaction failed' })).toBeVisible()
  await expect(dialog).toContainText('Contract changes rolled back')
  await expect(dialog.getByRole('link', { name: /View on Stellar Expert/ })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Swap complete' })).toHaveCount(0)
})

test('restored pending swaps stay pending and check the stored direction before showing success', async ({ page }) => {
  await controlTransactions(page)
  await page.clock.install()
  await page.addInitScript(({ hash, owner }) => localStorage.setItem('caveat-action-pending', JSON.stringify({ hash, source: owner, action: 'swap', direction: 'usdc-to-xlm' })), { hash, owner })
  await page.goto('/')
  const dialog = page.getByRole('dialog', { name: 'Transaction status' })
  await expect(dialog.getByRole('heading', { name: 'Awaiting confirmation' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Check confirmation', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Awaiting confirmation' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Swap complete' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await page.evaluate(() => { (window as Controls).testLedgerStatus = 'confirmed' })
  await page.clock.fastForward(5100)
  await expect(dialog.getByRole('heading', { name: 'Swap complete' })).toBeVisible()
  await expect(dialog.locator('dd').last()).toHaveText('0.4701154 XLM')
  expect(await page.evaluate(() => localStorage.getItem('caveat-action-pending'))).toBeNull()
})

test('USDC setup reports confirmation and returns to the preserved wallet setup view', async ({ page }) => {
  await controlTransactions(page, false)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Disconnect wallet' })).toBeVisible()
  await page.getByRole('button', { name: 'Deployment settings' }).click()
  await page.getByRole('button', { name: 'Review test USDC setup' }).click()
  await page.getByRole('button', { name: 'Sign USDC setup in Freighter' }).click()
  await page.waitForFunction(() => Boolean((window as Controls).transactionControls))
  const dialog = page.getByRole('dialog', { name: 'Transaction status' })
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(dialog.getByRole('heading', { name: 'Confirm in Freighter' })).toBeVisible()
  await page.evaluate(() => { (window as Controls).transactionControls.submit(); (window as Controls).transactionControls.finish('confirmed') })
  await expect(dialog.getByRole('heading', { name: 'Test USDC enabled' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog', { name: 'Testnet wallet setup' })).toBeVisible()
  await expect(page.getByText('Test USDC enabled. Ready for wallet-funded actions.')).toBeVisible()
})

test('liquidity confirmation displays both spends and actual shares on mobile', async ({ page }) => {
  await controlTransactions(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Provide liquidity', exact: true }).click()
  await prepareAndSign(page)
  await page.evaluate(() => { (window as Controls).transactionControls.submit(); (window as Controls).transactionControls.finish('confirmed') })
  const dialog = page.getByRole('dialog', { name: 'Transaction status' })
  await expect(dialog.getByRole('heading', { name: 'Liquidity added' })).toBeVisible()
  await expect(dialog.locator('dd')).toHaveText(['1 XLM', '0.10604 test USDC', '0.3088669 pool shares'])
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeInViewport()
  await page.screenshot({ path: 'test-results/transaction-desktop.png' })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.screenshot({ path: 'test-results/transaction-mobile.png' })
})

test('the independent integration reopens its persisted transaction status in a native modal', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pool-example-pending', 'c'.repeat(64)))
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort())
  await page.goto('/integrations/pool/index.html')
  const dialog = page.getByRole('dialog', { name: 'Awaiting confirmation' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: /View on Stellar Expert/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Liquidity added' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close transaction status' }).click()
  await page.getByRole('button', { name: 'View submitted transaction' }).click()
  await expect(dialog).toBeVisible()
})

test('confirmation errors preserve the pending hash and can be checked again', async ({ page }) => {
  await controlTransactions(page)
  await page.addInitScript(({ hash, owner }) => localStorage.setItem('caveat-action-pending', JSON.stringify({ hash, source: owner, action: 'swap' })), { hash, owner })
  await page.goto('/')
  await page.evaluate(() => { (window as Controls).testLedgerError = true })
  const dialog = page.getByRole('dialog', { name: 'Transaction status' })
  await dialog.getByRole('button', { name: 'Check confirmation', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Awaiting confirmation' })).toBeVisible()
  await dialog.getByText('View error details').click()
  await expect(dialog.getByText('RPC temporarily unavailable.')).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('caveat-action-pending')!).hash)).toBe(hash)
  await page.evaluate(() => { (window as Controls).testLedgerError = false; (window as Controls).testLedgerStatus = 'confirmed' })
  await dialog.getByRole('button', { name: 'Check confirmation', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Swap complete' })).toBeVisible()
})

test('earlier account recovery shows its confirmed wallet receipt in the transaction modal', async ({ page }) => {
  await controlTransactions(page)
  await page.addInitScript(() => localStorage.setItem('caveat-deployment', JSON.stringify({ account: 'CDLHUYQNQ3N22WXFG72A6RP5JQIFTHZTR2RXFM3XGVZYWBQSZGLNUMQK' })))
  await page.route('**/src/lib/testnet.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function inspectAccount() { return { input: '4', output: '0.105722', nonce: '1', ledger: 5055017 }; }
    export async function prepareWithdrawal(source, config, token, amount) { return { kind: 'withdraw', config, token, amount, transaction: { source, fee: '100', expiresAt: Math.floor(Date.now()/1000)+300, xdr: 'UI fixture: no executable transaction' } }; }
  ` }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Disconnect wallet' })).toBeVisible()
  await page.getByRole('button', { name: 'Deployment settings' }).click()
  await page.getByText('Recover funds from an earlier account', { exact: true }).click()
  await page.getByText('Owner recovery', { exact: true }).click()
  await page.getByLabel('Amount to withdraw').fill('1')
  await page.getByRole('button', { name: 'Review withdrawal' }).click()
  await page.getByRole('button', { name: 'Sign in Freighter', exact: true }).click()
  await page.waitForFunction(() => Boolean((window as Controls).transactionControls))
  await page.evaluate(() => { (window as Controls).transactionControls.submit(); (window as Controls).transactionControls.finish('confirmed') })
  const dialog = page.getByRole('dialog', { name: 'Transaction status' })
  await expect(dialog.getByRole('heading', { name: 'Recovery complete' })).toBeVisible()
  await expect(dialog.locator('dd')).toHaveText(['1 XLM'])
})
