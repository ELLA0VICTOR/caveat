import { useEffect, useRef, useState } from 'react'
import { fromUnits, toUnits } from '../lib/policy'
import { TESTNET_USDC_ADDRESS, TESTNET_XLM_ADDRESS } from '../lib/tokens'
import type { Deployment, LedgerReceipt } from '../lib/stellar'
import type { Action, Outcome, PreparedAction, SwapDirection } from '@caveat/sdk'
import { swapAssets } from '@caveat/sdk/deployment'
import { useLiveQuote } from './useLiveQuote'

export type Receipt = {
  id: string
  time: string
  title: string
  detail: string
  status: 'confirmed' | 'failed' | 'pending'
  mode: 'Testnet'
  hash: string
}
export type DialogName = 'settings' | 'model' | 'review' | 'receipts' | null
const defaultConfig: Deployment = {
  account: '',
  router: 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
  input: TESTNET_XLM_ADDRESS,
  output: TESTNET_USDC_ADDRESS,
}
const walletPreference = 'caveat-wallet-preference'
function rememberWallet(connected: boolean) {
  try { localStorage.setItem(walletPreference, connected ? 'connected' : 'disconnected') }
  catch { /* The current connection still works when browser storage is unavailable. */ }
}

export function useCaveat() {
  const [config, setConfig] = useState<Deployment>(() => {
    try { return { ...defaultConfig, ...JSON.parse(localStorage.getItem('caveat-deployment') || '{}') } }
    catch { return defaultConfig }
  })
  const [amount, setAmount] = useState('1')
  const [action, setAction] = useState<Action>('swap')
  const [direction, setDirection] = useState<SwapDirection>('xlm-to-usdc')
  const [minimumOverride, setMinimumOverride] = useState<{ key: string; value: string } | null>(null)
  const [minutes, setMinutes] = useState(10)
  const [wallet, setWallet] = useState('')
  const walletRevision = useRef(0)
  const [draftConfig, setDraftConfig] = useState(config)
  const [dialog, setDialog] = useState<DialogName>(null)
  const [entries, setEntries] = useState<Receipt[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [prepared, setPrepared] = useState<PreparedAction | null>(null)
  const [lastResult, setLastResult] = useState<Receipt | null>(null)
  const [pending, setPending] = useState<{ hash: string; source: string; action: Action; direction?: SwapDirection } | null>(() => {
    try { return JSON.parse(localStorage.getItem('caveat-action-pending') || 'null') } catch { return null }
  })
  const quote = useLiveQuote(action, amount, busy || dialog === 'review', direction)
  const assets = swapAssets(action === 'swap' ? direction : 'xlm-to-usdc')
  const customMinimum = minimumOverride?.key === quote.key
  const minimum = customMinimum ? minimumOverride.value : quote.minimum

  useEffect(() => {
    try { if (localStorage.getItem(walletPreference) === 'disconnected') return }
    catch { /* Freighter can still verify an existing permission without storage. */ }
    let active = true
    const revision = walletRevision.current
    void import('../lib/stellar').then(stellar => stellar.restoreWallet()).then(address => {
      // A late restore must not undo a manual connect or disconnect.
      if (active && revision === walletRevision.current && address) setWallet(address)
    }).catch(() => { /* An unavailable wallet leaves the normal connect action visible. */ })
    return () => { active = false }
  }, [])

  function invalidate() { setPrepared(null); setLastResult(null); setMessage('') }
  function changeAmount(value: string) { setAmount(value); setMinimumOverride(null); invalidate() }
  function changeAction(value: Action) {
    if (value === action) return
    if (direction === 'usdc-to-xlm') setAmount('1')
    setDirection('xlm-to-usdc'); setAction(value); setMinimumOverride(null); invalidate()
  }
  function reverseSwap() {
    if (action !== 'swap' || busy || pending) return
    setDirection(direction === 'xlm-to-usdc' ? 'usdc-to-xlm' : 'xlm-to-usdc')
    setAmount(quote.status === 'ready' ? quote.expected : '')
    setMinimumOverride(null); invalidate()
  }
  function changeMinimum(value: string) { setMinimumOverride({ key: quote.key, value }); invalidate() }
  function changeMinutes(value: number) { setMinutes(value); invalidate() }
  function record(receipt: Omit<Receipt, 'id' | 'time'>) {
    const item = { ...receipt, id: crypto.randomUUID(), time: new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) }
    setEntries(previous => [item, ...previous]); setLastResult(item)
  }
  async function connect() {
    walletRevision.current += 1
    setBusy(true); setMessage('Connecting to Freighter…')
    try {
      const stellar = await import('../lib/stellar')
      setWallet(await stellar.connectWallet()); rememberWallet(true); setMessage('Testnet wallet connected.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection failed.') }
    finally { setBusy(false) }
  }
  function disconnect() { walletRevision.current += 1; rememberWallet(false); setWallet(''); invalidate() }
  async function run() {
    if (pending) { setMessage('An earlier action is awaiting confirmation. Check it before preparing another.'); return }
    try { toUnits(amount) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid spending amount.'); return }
    if (!wallet) { await connect(); return }
    if (quote.status !== 'ready') { setMessage(quote.status === 'error' ? 'The live quote is unavailable. Retry before preparing your swap.' : 'Waiting for the latest live quote…'); return }
    if (!minimum.trim()) { setMessage('Enter the minimum amount you want to receive.'); return }
    setBusy(true); setMessage('Reading testnet contracts and simulating your intent…')
    try {
      const { executor } = await import('../lib/executor')
      setPrepared(await executor.prepare(wallet, action, { amount, minimum, minutes, ...(action === 'liquidity' ? { maxB: quote.maxB } : { direction }) }))
      setMessage(''); setDialog('review')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Testnet preparation failed.') }
    finally { setBusy(false) }
  }
  async function sign() {
    if (!prepared) return
    setBusy(true); setDialog(null)
    try {
      const stellar = await import('../lib/stellar')
      const receipt = await stellar.submitTransaction(wallet, prepared, setMessage, hash => {
        const value = { hash, source: prepared.source, action: prepared.action, direction: prepared.terms.direction }
        setPending(value)
        try { localStorage.setItem('caveat-action-pending', JSON.stringify(value)) }
        catch { /* Keep the current page's pending guard even when storage is unavailable. */ }
      })
      finishAction(receipt, prepared.action, prepared.terms.direction)
      setMessage(''); setPrepared(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Submission failed.') }
    finally { setBusy(false) }
  }
  function finishAction(receipt: LedgerReceipt, action: Action, direction?: SwapDirection) {
    const outcome = receipt.value as Outcome | undefined
    const assets = swapAssets(direction)
    const inputLabel = assets.inputSymbol === 'USDC' ? 'test USDC' : 'XLM'
    const outputLabel = assets.outputSymbol === 'USDC' ? 'test USDC' : 'XLM'
    if (receipt.status !== 'pending') {
      setPending(null)
      try { localStorage.removeItem('caveat-action-pending') } catch { /* The confirmed status still belongs in the current session. */ }
    }
    record({ title: action === 'swap' ? 'Protected Soroswap swap' : 'Protected Soroswap liquidity', status: receipt.status, mode: 'Testnet', hash: receipt.hash,
      detail: receipt.status === 'confirmed'
        ? `Ledger confirmed.${outcome ? action === 'swap' ? ` Spent ${fromUnits(outcome.spent_a)} ${inputLabel}; received ${fromUnits(outcome.received)} ${outputLabel} in the signing wallet.` : ` Spent ${fromUnits(outcome.spent_a)} XLM and ${fromUnits(outcome.spent_b)} test USDC; received ${fromUnits(outcome.received)} pool shares in the signing wallet.` : ''}`
        : receipt.status === 'failed' ? 'Ledger reports failure. Contract changes rolled back; network fees may apply.' : 'Awaiting confirmation. Check this submission before preparing another action.',
    })
  }
  async function checkPending() {
    if (!pending) return
    setBusy(true); setMessage('Checking the submitted action…')
    try { const stellar = await import('../lib/stellar'); finishAction(await stellar.transactionStatus(pending.hash), pending.action, pending.direction); setMessage('') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not check confirmation.') }
    finally { setBusy(false) }
  }
  function openSettings() { setDraftConfig(config); setDialog('settings'); setMessage('') }
  function closeDialog() { if (!busy) { setDialog(null); setMessage('') } }
  async function saveSettings() {
    try {
      const stellar = await import('../lib/stellar')
      stellar.validateDeployment(draftConfig)
      localStorage.setItem('caveat-deployment', JSON.stringify(draftConfig))
      setConfig(draftConfig); setDialog(null); invalidate()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid configuration.') }
  }
  function applyDeployment(next: Deployment) {
    localStorage.setItem('caveat-deployment', JSON.stringify(next))
    setConfig(next); setDraftConfig(next); invalidate()
    setAmount('1'); setMinimumOverride(null)
  }
  function refreshQuote() { invalidate(); quote.refresh() }
  function useAutomaticMinimum() { setMinimumOverride(null); invalidate() }
  return {
    action, direction, assets, reverseSwap, amount, minimum, minutes, wallet, config, draftConfig, dialog,
    entries, message, busy, prepared, lastResult, pending, checkPending, quote, customMinimum,
    changeAction, changeAmount, changeMinimum, changeMinutes,
    setDraftConfig, setDialog, setMessage, connect, disconnect, run, sign,
    openSettings, closeDialog, saveSettings, applyDeployment, refreshQuote, useAutomaticMinimum, setBusy, record,
  }
}
export type CaveatState = ReturnType<typeof useCaveat>
