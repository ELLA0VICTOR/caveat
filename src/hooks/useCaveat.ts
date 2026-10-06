import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { fromUnits, toUnits } from '../lib/policy'
import { TESTNET_USDC_ADDRESS, TESTNET_XLM_ADDRESS } from '../lib/tokens'
import type { Deployment, LedgerReceipt } from '../lib/stellar'
import type { Action, Outcome, PreparedAction, SwapDirection } from '@caveat/sdk'
import { swapAssets } from '@caveat/sdk/deployment'
import { useLiveQuote } from './useLiveQuote'
import type { TransactionAmount, TransactionKind, TransactionNotice } from '../lib/transaction'
import { TEST_VENUES } from '../lib/venues'
import type { Venue } from '../lib/venues'

export type Receipt = {
  id: string
  time: string
  title: string
  detail: string
  status: 'confirmed' | 'failed' | 'pending'
  mode: 'Testnet'
  hash: string
  amounts?: TransactionAmount[]
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
  const [venue, setVenue] = useState<Venue>('soroswap')
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
  const [pending, setPending] = useState<{ hash: string; source: string; action: Action; direction?: SwapDirection } | null>(() => {
    try { return JSON.parse(localStorage.getItem('caveat-action-pending') || 'null') } catch { return null }
  })
  const [transaction, setTransaction] = useState<TransactionNotice | null>(() => {
    if (pending) return { kind: pending.action, title: pending.action === 'swap' ? 'Protected Soroswap swap' : 'Protected Soroswap liquidity',
      phase: 'pending', hash: pending.hash, detail: 'Your submitted transaction is awaiting a ledger result.' }
    try {
      const hash = localStorage.getItem('caveat-trustline-pending')
      if (hash) return { kind: 'trustline', title: 'Enable test USDC', phase: 'pending', hash, detail: 'USDC setup is awaiting ledger confirmation.' }
    } catch { /* The connected session still works without browser storage. */ }
    return null
  })
  const [transactionOpen, setTransactionOpen] = useState(Boolean(transaction))
  const transactionChecker = useRef<((hash: string) => Promise<void>) | null>(null)
  const quote = useLiveQuote(action, amount, busy || dialog === 'review', direction, venue)
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

  function invalidate() { setPrepared(null); setMessage('') }
  function changeAmount(value: string) { setAmount(value); setMinimumOverride(null); invalidate() }
  function changeAction(value: Action) {
    if (value === action) return
    if (direction === 'usdc-to-xlm') setAmount('1')
    setDirection('xlm-to-usdc'); setVenue('soroswap'); setAction(value); setMinimumOverride(null); invalidate()
  }
  function changeVenue(value: Venue) {
    if (busy || pending || transaction?.phase === 'pending' || value === venue) return
    setVenue(value)
    if (value !== 'soroswap') { setDirection('xlm-to-usdc'); setAmount('1') }
    setMinimumOverride(null); invalidate()
  }
  function reverseSwap() {
    if (action !== 'swap' || venue !== 'soroswap' || busy || pending) return
    setDirection(direction === 'xlm-to-usdc' ? 'usdc-to-xlm' : 'xlm-to-usdc')
    setAmount(quote.status === 'ready' ? quote.expected : '')
    setMinimumOverride(null); invalidate()
  }
  function changeMinimum(value: string) { setMinimumOverride({ key: quote.key, value }); invalidate() }
  function changeMinutes(value: number) { setMinutes(value); invalidate() }
  function record(receipt: Omit<Receipt, 'id' | 'time'>) {
    const item = { ...receipt, id: crypto.randomUUID(), time: new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) }
    setEntries(previous => [item, ...previous.filter(entry => entry.hash !== item.hash)])
    setTransaction(previous => ({ kind: previous?.kind ?? 'setup', title: receipt.title, phase: receipt.status,
      detail: receipt.detail, hash: receipt.hash, amounts: receipt.amounts }))
    if (receipt.status !== 'pending') setTransactionOpen(true)
  }
  function startTransaction(kind: TransactionKind, title: string, check?: (hash: string) => Promise<void>) {
    if (transaction?.phase === 'pending' && transaction.hash) { setTransactionOpen(true); return false }
    transactionChecker.current = check ?? null
    setTransaction({ kind, title, phase: 'wallet', detail: 'Review and approve the transaction in your wallet.' })
    setTransactionOpen(true); setMessage('')
    return true
  }
  function resumeTransaction(kind: TransactionKind, title: string, hash: string, check?: (hash: string) => Promise<void>) {
    transactionChecker.current = check ?? null
    setTransaction({ kind, title, hash, phase: 'pending', detail: 'Your submitted transaction is awaiting a ledger result.' })
    setTransactionOpen(true); setMessage('')
  }
  function transactionProgress(detail: string, phase?: 'wallet' | 'submitting') {
    setTransaction(previous => previous ? { ...previous, detail, ...(phase ? { phase } : {}) } : previous)
  }
  function transactionSubmitted(hash: string) {
    setTransaction(previous => previous ? { ...previous, phase: 'pending', hash,
      detail: 'Submitted to Stellar Testnet. Waiting for ledger confirmation.' } : previous)
  }
  function transactionError(error: unknown, kind?: TransactionKind, title?: string) {
    const issue = error instanceof Error ? error.message : 'Unable to complete this request.'
    setTransaction(previous => previous && !kind ? { ...previous, phase: previous.hash ? previous.phase : 'error', issue,
      detail: previous.hash ? previous.phase === 'confirmed' ? previous.detail : 'The transaction result is still being checked. Use the submitted hash before trying another action.' : 'This request could not be completed. Review the details below.' }
      : { kind: kind ?? 'setup', title: title ?? 'Transaction', phase: 'error', detail: 'This request could not be completed. Review the details below.', issue })
    setTransactionOpen(true); setMessage('')
  }
  function closeTransaction() { if (!busy || transaction?.phase === 'pending') { setTransactionOpen(false); setMessage('') } }
  function openTransaction() { setTransactionOpen(true) }
  async function checkTransaction(reveal = true) {
    if (!transaction?.hash) return
    if (reveal) setTransactionOpen(true)
    if (!transactionChecker.current && pending?.hash === transaction.hash) { await checkPending(reveal); return }
    setBusy(true)
    setTransaction(previous => previous ? { ...previous, issue: undefined } : previous)
    try {
      if (transactionChecker.current) await transactionChecker.current(transaction.hash)
      else {
        const stellar = await import('../lib/stellar')
        const receipt = await stellar.transactionStatus(transaction.hash)
        if (receipt.status !== 'pending' && transaction.kind === 'trustline') {
          try { localStorage.removeItem('caveat-trustline-pending') } catch { /* Keep the observed result in this session. */ }
        }
        record({ title: transaction.title, mode: 'Testnet', hash: receipt.hash, status: receipt.status,
          detail: receipt.status === 'confirmed' ? transaction.kind === 'trustline' ? 'Your wallet can now receive the exact test USDC asset.' : 'Confirmed by the Stellar Testnet ledger.'
            : receipt.status === 'failed' ? 'Ledger reports failure. Network fees may apply.' : 'Awaiting ledger confirmation.' })
      }
    }
    catch (error) { transactionError(error) }
    finally { setBusy(false) }
  }
  const pollTransaction = useEffectEvent(() => { void checkTransaction(false) })
  useEffect(() => {
    if (transaction?.phase !== 'pending' || !transaction.hash || transaction.issue || busy) return
    const timer = window.setTimeout(() => pollTransaction(), 5000)
    return () => window.clearTimeout(timer)
  }, [transaction, busy])
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
    if (pending || transaction?.phase === 'pending') { openTransaction(); return }
    try { toUnits(amount) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid spending amount.'); return }
    if (!wallet) { await connect(); return }
    if (quote.status !== 'ready') { setMessage(quote.status === 'error' ? 'The current terms are unavailable. Retry before preparing your swap.' : 'Waiting for the latest terms…'); return }
    if (!minimum.trim()) { setMessage('Enter the minimum amount you want to receive.'); return }
    setBusy(true); setMessage('Reading testnet contracts and simulating your intent…')
    try {
      if (action === 'swap' && venue !== 'soroswap') {
        const fixture = TEST_VENUES[venue]
        transactionChecker.current = null
        setTransaction({ kind: 'swap', title: fixture.label, phase: 'checking',
          detail: 'Verifying deployed bytecode and running your exact conditions through Stellar Testnet RPC.',
          verification: { guard: fixture.guard, venue: fixture.venue } })
        setTransactionOpen(true); setMessage('')
        const { checkTestVenue } = await import('../lib/fixture')
        const result = await checkTestVenue(venue, wallet, { amount, minimum, minutes, direction: 'xlm-to-usdc' })
        setTransaction({ kind: 'swap', title: fixture.label, ...result,
          verification: { guard: result.guard, venue: result.venue, ledger: result.ledger } })
        return
      }
      const { executor } = await import('../lib/executor')
      setPrepared(await executor.prepare(wallet, action, { amount, minimum, minutes, ...(action === 'liquidity' ? { maxB: quote.maxB } : { direction }) }))
      setMessage(''); setDialog('review')
    } catch (error) { transactionError(error, action, venue !== 'soroswap' ? TEST_VENUES[venue].label : action === 'swap' ? 'Protected Soroswap swap' : 'Protected Soroswap liquidity') }
    finally { setBusy(false) }
  }
  async function sign() {
    if (!prepared) return
    const current = prepared
    if (!startTransaction(current.action, current.action === 'swap' ? 'Protected Soroswap swap' : 'Protected Soroswap liquidity', async hash => {
      const stellar = await import('../lib/stellar')
      finishAction(await stellar.transactionStatus(hash), current.action, current.terms.direction)
    })) return
    setBusy(true); setDialog(null)
    try {
      const stellar = await import('../lib/stellar')
      const receipt = await stellar.submitTransaction(wallet, current, transactionProgress, hash => {
        transactionSubmitted(hash)
        const value = { hash, source: current.source, action: current.action, direction: current.terms.direction }
        setPending(value)
        try { localStorage.setItem('caveat-action-pending', JSON.stringify(value)) }
        catch { /* Keep the current page's pending guard even when storage is unavailable. */ }
      })
      finishAction(receipt, current.action, current.terms.direction)
      setMessage(''); setPrepared(null)
    } catch (error) { transactionError(error) }
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
      amounts: receipt.status === 'confirmed' && outcome ? action === 'swap'
        ? [{ label: 'Spent', value: `${fromUnits(outcome.spent_a)} ${inputLabel}` }, { label: 'Received in your wallet', value: `${fromUnits(outcome.received)} ${outputLabel}` }]
        : [{ label: 'XLM contributed', value: `${fromUnits(outcome.spent_a)} XLM` }, { label: 'USDC contributed', value: `${fromUnits(outcome.spent_b)} test USDC` }, { label: 'Received in your wallet', value: `${fromUnits(outcome.received)} pool shares` }] : undefined,
      detail: receipt.status === 'confirmed'
        ? `Ledger confirmed.${outcome ? action === 'swap' ? ` Spent ${fromUnits(outcome.spent_a)} ${inputLabel}; received ${fromUnits(outcome.received)} ${outputLabel} in the signing wallet.` : ` Spent ${fromUnits(outcome.spent_a)} XLM and ${fromUnits(outcome.spent_b)} test USDC; received ${fromUnits(outcome.received)} pool shares in the signing wallet.` : ''}`
        : receipt.status === 'failed' ? 'Ledger reports failure. Contract changes rolled back; network fees may apply.' : 'Awaiting confirmation. Check this submission before preparing another action.',
    })
  }
  async function checkPending(reveal = true) {
    if (!pending) return
    setBusy(true)
    if (reveal) setTransactionOpen(true)
    setTransaction(previous => previous ? { ...previous, issue: undefined } : previous)
    try { const stellar = await import('../lib/stellar'); finishAction(await stellar.transactionStatus(pending.hash), pending.action, pending.direction); setMessage('') }
    catch (error) { transactionError(error) }
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
    action, direction, venue, changeVenue, assets, reverseSwap, amount, minimum, minutes, wallet, config, draftConfig, dialog,
    entries, message, busy, prepared, pending, checkPending, quote, customMinimum,
    transaction, transactionOpen, startTransaction, resumeTransaction, transactionProgress, transactionSubmitted, transactionError, closeTransaction, openTransaction, checkTransaction,
    changeAction, changeAmount, changeMinimum, changeMinutes,
    setDraftConfig, setDialog, setMessage, connect, disconnect, run, sign,
    openSettings, closeDialog, saveSettings, applyDeployment, refreshQuote, useAutomaticMinimum, setBusy, record,
  }
}
export type CaveatState = ReturnType<typeof useCaveat>
