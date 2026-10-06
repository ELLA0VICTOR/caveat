import { useState } from 'react'
import { fromUnits, toUnits } from '../lib/policy'
import { TESTNET_USDC_ADDRESS, TESTNET_XLM_ADDRESS } from '../lib/tokens'
import type { Deployment, Prepared } from '../lib/stellar'

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

export function useCaveat() {
  const [config, setConfig] = useState<Deployment>(() => {
    try { return { ...defaultConfig, ...JSON.parse(localStorage.getItem('caveat-deployment') || '{}') } }
    catch { return defaultConfig }
  })
  const [amount, setAmount] = useState('1')
  const [minimum, setMinimum] = useState('')
  const [minutes, setMinutes] = useState(10)
  const [wallet, setWallet] = useState('')
  const [draftConfig, setDraftConfig] = useState(config)
  const [dialog, setDialog] = useState<DialogName>(null)
  const [entries, setEntries] = useState<Receipt[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [lastResult, setLastResult] = useState<Receipt | null>(null)
  const [liveQuote, setLiveQuote] = useState('')

  function invalidate() { setPrepared(null); setLastResult(null); setLiveQuote(''); setMessage('') }
  function changeAmount(value: string) { setAmount(value); invalidate() }
  function changeMinimum(value: string) { setMinimum(value); invalidate() }
  function changeMinutes(value: number) { setMinutes(value); invalidate() }
  function record(receipt: Omit<Receipt, 'id' | 'time'>) {
    const item = { ...receipt, id: crypto.randomUUID(), time: new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) }
    setEntries(previous => [item, ...previous]); setLastResult(item)
  }
  async function connect() {
    setBusy(true); setMessage('Connecting to Freighter…')
    try {
      const stellar = await import('../lib/stellar')
      setWallet(await stellar.connectWallet()); setMessage('Testnet wallet connected.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection failed.') }
    finally { setBusy(false) }
  }
  function disconnect() { setWallet(''); invalidate() }
  async function run() {
    try { toUnits(amount) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid spending amount.'); return }
    if (!wallet) { await connect(); return }
    if (!config.account || !config.input || !config.output) {
      openSettings(); setMessage('Configure your deployed account and exact token contracts to prepare a testnet swap.'); return
    }
    if (!minimum.trim()) { setMessage('Load a live quote or enter the minimum amount you want to receive.'); return }
    setBusy(true); setMessage('Reading testnet contracts and simulating your intent…')
    try {
      const stellar = await import('../lib/stellar')
      setPrepared(await stellar.prepareIntent(wallet, config, { amount, minimum, minutes }))
      setMessage(''); setDialog('review')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Testnet preparation failed.') }
    finally { setBusy(false) }
  }
  async function sign() {
    if (!prepared) return
    setBusy(true); setDialog(null)
    try {
      const stellar = await import('../lib/stellar')
      const receipt = await stellar.submitIntent(wallet, prepared, setMessage)
      record({
        title: 'Soroswap guarded swap', status: receipt.status, mode: 'Testnet', hash: receipt.hash,
        detail: receipt.status === 'confirmed'
          ? `Ledger confirmed.${receipt.spent !== undefined && receipt.received !== undefined ? ` Spent ${fromUnits(receipt.spent, prepared.inputDecimals)} input; received ${fromUnits(receipt.received, prepared.outputDecimals)} output.` : ''}`
          : receipt.status === 'failed' ? 'Ledger reports failure. Contract changes rolled back; network fees may apply.' : 'Awaiting confirmation. Inspect the transaction before retrying.',
      })
      setMessage(''); setPrepared(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Submission failed.') }
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
    setAmount('1'); setMinimum('')
  }
  async function refreshQuote() {
    if (!wallet) { await connect(); return }
    setBusy(true); setMessage('Reading the live Soroswap quote…')
    try {
      const { quoteIntent } = await import('../lib/testnet')
      const quote = await quoteIntent(wallet, config, amount)
      setPrepared(null); setLastResult(null); setLiveQuote(quote.expected); setMinimum(quote.minimum)
      setMessage('Minimum set 1% below this quote. Review or edit it before signing; prices can change.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Quote lookup failed.') }
    finally { setBusy(false) }
  }
  return {
    amount, minimum, minutes, wallet, config, draftConfig, dialog,
    entries, message, busy, prepared, lastResult, liveQuote,
    changeAmount, changeMinimum, changeMinutes,
    setDraftConfig, setDialog, setMessage, connect, disconnect, run, sign,
    openSettings, closeDialog, saveSettings, applyDeployment, refreshQuote, setBusy, record,
  }
}
export type CaveatState = ReturnType<typeof useCaveat>
