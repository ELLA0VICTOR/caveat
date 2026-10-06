import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Presentation fixtures only. Real RPC checks of these deployed venues verify
// protection separately; this suite checks modal states and route isolation.
async function controlChecks(page: Page) {
  await page.route('**/src/lib/stellar.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function restoreWallet() { return 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'; }
    export async function connectWallet() { return 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'; }
    export function submitTransaction() { throw new Error('Test checks must never request signing or submit.'); }
  ` }))
  await page.route('**/src/lib/executor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function quoteAction(action, amount, direction, venue) { return venue === 'soroswap'
      ? { expected: '0.105', minimum: '0.10395', maxB: '0.1' } : { expected: '2', minimum: '1.9' }; }
    export const executor = { prepare() { throw new Error('Test venue used the production preparation path.'); } };
  ` }))
  await page.route('**/src/lib/fixture.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    import { TEST_VENUES } from '/src/lib/venues.ts';
    export function checkTestVenue(id, owner, terms) { return new Promise((resolve, reject) => {
      window.fixtureCheck = { id, terms, reject: () => reject(new Error('RPC unavailable; check could not run.')),
        finish: () => resolve({ phase: terms.minimum === '0.4' ? 'allowed' : 'blocked',
          detail: terms.minimum === '0.4' ? 'Your minimum permits this smaller receipt.' : id === 'underpayment' ? 'Actual receipt fell below your minimum.' : id === 'approval' ? 'Unlimited approval rejected.' : 'Extra transfer rejected.',
          ledger: 5056659, guard: TEST_VENUES[id].guard, venue: TEST_VENUES[id].venue,
          amounts: id === 'underpayment' ? [{ label: 'Your minimum', value: terms.minimum + ' test USDC' }, { label: 'Contract claimed', value: '2 test USDC' }, { label: 'Attempted actual delivery', value: '0.5 test USDC' }]
            : [{ label: 'Your rule', value: id === 'approval' ? 'None allowed' : '1 XLM' }, { label: 'Attempted action', value: id === 'approval' ? 'Unlimited' : '1.0000001 XLM' }]
        }) };
    }); }
  ` }))
}
type CheckWindow = Window & { fixtureCheck: { finish: () => void; reject: () => void } }
async function startCheck(page: Page, venue = 'underpayment') {
  await page.getByRole('combobox', { name: 'Swap venue' }).selectOption(venue)
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('1.9')
  await page.getByRole('button', { name: 'Check test contract', exact: true }).click()
  await page.waitForFunction(() => Boolean((window as CheckWindow).fixtureCheck))
}

test('test venue checks use the existing modal and distinguish live simulation from ledger execution', async ({ page }) => {
  await controlChecks(page)
  await page.goto('/')
  await startCheck(page)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Checking test contract' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeDisabled()
  await page.evaluate(() => (window as CheckWindow).fixtureCheck.finish())
  await expect(dialog.getByRole('heading', { name: 'Blocked by Caveat' })).toBeVisible()
  await expect(dialog).toContainText('0.5 test USDC')
  await expect(dialog).toContainText('no transaction was signed or submitted')
  await expect(dialog.locator('.transaction-steps')).toHaveCount(0)
  await expect(dialog.locator('a[href*="/tx/"]')).toHaveCount(0)
  await dialog.getByText('Verified contract addresses').click()
  await expect(dialog.locator('a[href*="/contract/"]')).toHaveCount(2)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/venue-blocked-mobile.png' })
  await dialog.getByRole('button', { name: 'Done' }).click()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: /^Receipts/ }).click()
  await expect(page.locator('.receipt-record')).toHaveCount(0)
})

test('approval and extra transfer checks explain the blocked action', async ({ page }) => {
  await controlChecks(page)
  await page.goto('/')
  for (const [venue, text] of [['approval', 'Unlimited approval rejected.'], ['transfer', 'Extra transfer rejected.']]) {
    await startCheck(page, venue)
    await page.evaluate(() => (window as CheckWindow).fixtureCheck.finish())
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Blocked by Caveat' })).toBeVisible()
    await expect(dialog).toContainText(text)
    await expect(dialog.getByRole('heading', { name: 'Swap complete' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Done' }).click()
  }
})

test('RPC errors are interruptions and never evidence of a blocked attack', async ({ page }) => {
  await controlChecks(page)
  await page.goto('/')
  await startCheck(page)
  await page.evaluate(() => (window as CheckWindow).fixtureCheck.reject())
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Transaction interrupted' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Blocked by Caveat' })).toHaveCount(0)
  await dialog.getByText('View error details').click()
  await expect(dialog).toContainText('RPC unavailable')
  await expect(dialog.locator('a[href*="/tx/"]')).toHaveCount(0)
})

test('weak terms are allowed by simulation and leaving a test venue restores normal swap limits', async ({ page }) => {
  await controlChecks(page)
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Swap venue' }).selectOption('underpayment')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('1.9')
  await expect(page.getByRole('button', { name: 'Reverse swap direction' })).toBeDisabled()
  await page.getByLabel('Minimum receipt amount').fill('0.4')
  await page.getByRole('button', { name: 'Check test contract', exact: true }).click()
  await page.waitForFunction(() => Boolean((window as CheckWindow).fixtureCheck))
  await page.evaluate(() => (window as CheckWindow).fixtureCheck.finish())
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Conditions satisfied' })).toBeVisible()
  await expect(dialog).toContainText('Simulation only')
  await expect(dialog.getByRole('heading', { name: 'Swap complete' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('combobox', { name: 'Swap venue' }).selectOption('soroswap')
  await expect(page.getByLabel('Minimum receipt amount')).toHaveValue('0.10395')
  await expect(page.getByRole('button', { name: 'Reverse swap direction' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Prepare & review intent' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Swap venue' }).selectOption('approval')
  await page.getByRole('button', { name: 'Provide liquidity', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Swap venue' })).toHaveCount(0)
  await expect(page.locator('.protocol-line')).toContainText('Soroswap')
})
