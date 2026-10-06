import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { Networks, StrKey } from '@stellar/stellar-sdk'

// Wallet API responses only. These tests never sign or simulate contract execution.
const owner = StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(1))
const other = StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(2))
const short = (address: string) => `${address.slice(0, 7)}…${address.slice(-5)}`
type WalletState = { address?: string; connectedAddress?: string; installed?: boolean; allowed?: boolean; network?: string; error?: boolean; delayed?: boolean }
type WalletWindow = Window & { freighterCalls?: string[]; resolveWalletAddress?: () => void }
async function controlWallet(page: Page, initial: WalletState) {
  await page.addInitScript(state => {
    if (!localStorage.getItem('caveat-test-wallet')) localStorage.setItem('caveat-test-wallet', JSON.stringify(state))
  }, { address: owner, ...initial })
  await page.route(/\/node_modules\/.*freighter[-_]api.*\.js(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      const state = () => JSON.parse(localStorage.getItem('caveat-test-wallet'));
      const called = name => (window.freighterCalls ??= []).push(name);
      export async function isConnected() { called('isConnected'); return { isConnected: state().installed !== false }; }
      export async function isAllowed() { called('isAllowed'); return { isAllowed: state().allowed !== false }; }
      export async function getAddress() {
        called('getAddress'); const current = state();
        const result = { address: current.address, ...(current.error ? { error: { message: 'Wallet unavailable' } } : {}) };
        if (current.delayed) return new Promise(resolve => { window.resolveWalletAddress = () => resolve(result); });
        return result;
      }
      export async function getNetworkDetails() {
        called('getNetworkDetails'); return { networkPassphrase: state().network ?? ${JSON.stringify(Networks.TESTNET)} };
      }
      export async function requestAccess() {
        called('requestAccess'); const current = state(); current.allowed = true;
        localStorage.setItem('caveat-test-wallet', JSON.stringify(current));
        return { address: current.connectedAddress ?? current.address };
      }
      export default { isConnected, isAllowed, getAddress, getNetworkDetails, requestAccess };
    `,
  }))
  await page.route('**/src/lib/executor.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export async function quoteAction() { return { expected: '0.5', minimum: '0.495' }; }`,
  }))
}

test('connection survives refresh, uses Freighter current address, and respects disconnect', async ({ page }) => {
  await controlWallet(page, { allowed: false })
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Disconnect wallet' })).toContainText(short(owner))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Disconnect wallet' })).toContainText(short(owner))
  expect(await page.evaluate(() => (window as WalletWindow).freighterCalls)).not.toContain('requestAccess')

  await page.evaluate(address => localStorage.setItem('caveat-test-wallet', JSON.stringify({ address })), other)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Disconnect wallet' })).toContainText(short(other))
  await page.getByRole('button', { name: 'Disconnect wallet' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as WalletWindow).freighterCalls ?? [])).not.toContain('getAddress')
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Disconnect wallet' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Disconnect wallet' })).toContainText(short(other))
})

test('restore requires real permission, a valid address, and the Testnet network', async ({ page }) => {
  await controlWallet(page, { installed: false })
  await page.goto('/')
  for (const state of [
    { installed: false }, { allowed: false }, { network: Networks.PUBLIC },
    { address: 'invalid' }, { error: true },
  ]) {
    await page.evaluate(state => {
      localStorage.setItem('caveat-wallet-preference', 'connected')
      localStorage.setItem('caveat-test-wallet', JSON.stringify(state))
    }, { address: owner, ...state })
    await page.reload()
    await expect.poll(() => page.evaluate(() => (window as WalletWindow).freighterCalls ?? [])).toContain('isAllowed')
    if (!('installed' in state) && !('allowed' in state)) {
      await expect.poll(() => page.evaluate(() => (window as WalletWindow).freighterCalls ?? [])).toContain('getNetworkDetails')
    }
    await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Disconnect wallet' })).toHaveCount(0)
    expect(await page.evaluate(() => (window as WalletWindow).freighterCalls)).not.toContain('requestAccess')
  }
})

test('late automatic restoration cannot replace a manual connection', async ({ page }) => {
  await controlWallet(page, { delayed: true, connectedAddress: other })
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as WalletWindow).resolveWalletAddress))
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Disconnect wallet' })).toContainText(short(other))
  await page.evaluate(async () => {
    (window as WalletWindow).resolveWalletAddress!()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  await expect(page.getByRole('button', { name: 'Disconnect wallet' })).toContainText(short(other))
})
