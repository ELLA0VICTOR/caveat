import { useState } from 'react'
import { checkOutcome, demonstrate, fromUnits, toUnits } from '../lib/policy'
import type { Outcome, Scenario } from '../lib/policy'
import type { Deployment, Prepared } from '../lib/stellar'

export type Receipt = {
  id: string
  time: string
  title: string
  detail: string
  status: 'confirmed' | 'blocked' | 'failed' | 'pending'
  mode: 'Local demo' | 'Testnet'
  hash?: string
  outcome?: Outcome
  violations?: string[]
}
export type DialogName = 'settings' | 'model' | 'review' | 'receipts' | null
const defaultConfig: Deployment = {
  account: '',
  router: 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
  input: '',
  output: '',
}

export function useCaveat() {
  const [mode, setMode] = useState<'demo' | 'live'>('demo')
  const [amount, setAmount] = useState('100')
  const [minimum, setMinimum] = useState('12.30')
  const [minutes, setMinutes] = useState(10)
  const [scenario, setScenario] = useState<Scenario>('honest')
  const [wallet, setWallet] = useState('')
  const [config, setConfig] = useState<Deployment>(() => {
    try { return { ...defaultConfig, ...JSON.parse(localStorage.getItem('caveat-deployment') || '{}') } }
    catch { return defaultConfig }
  })
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
  function changeMode(value: 'demo' | 'live') { setMode(value); invalidate() }
  function changeScenario(value: Scenario) { setScenario(value); invalidate() }
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
  function runDemo() {
    setMessage(''); setLastResult(null)
    try {
      const maxSpend = toUnits(amount), minReceive = toUnits(minimum)
      const outcome = demonstrate(maxSpend, scenario)
      const now = Math.floor(Date.now() / 1000)
      const violations = checkOutcome({ maxSpend, minReceive, expiresAt: now + minutes * 60, denyApprovals: true }, outcome, now)
      record({
        title: scenario === 'honest' ? 'Honest swap' : scenario === 'underpay' ? 'Underpayment attack' : 'Approval attack',
        status: violations.length ? 'blocked' : 'confirmed', mode: 'Local demo', outcome, violations,
        detail: violations.length ? `${violations.join(' · ')}. The model discards all changes.` : `${fromUnits(outcome.spent)} XLM → ${fromUnits(outcome.received)} USDC. All model conditions passed.`,
      })
      return true
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid intent.'); return false }
  }
  async function run() {
    if (mode === 'demo') return runDemo()
    if (!wallet) { await connect(); return false }
    if (!config.account || !config.input || !config.output) {
      openSettings(); setMessage('Configure your deployed account and exact token contracts to prepare a testnet swap.'); return false
    }
    setBusy(true); setMessage('Reading testnet contracts and simulating your intent…')
    try {
      const stellar = await import('../lib/stellar')
      setPrepared(await stellar.prepareIntent(wallet, config, { amount, minimum, minutes }))
      setMessage(''); setDialog('review')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Testnet preparation failed.') }
    finally { setBusy(false) }
    return false
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
      setConfig(draftConfig); setDialog(null); invalidate(); setMode('live')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid configuration.') }
  }
  function applyDeployment(next: Deployment) {
    localStorage.setItem('caveat-deployment', JSON.stringify(next))
    setConfig(next); setDraftConfig(next); setMode('live'); invalidate()
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
  let preview = '—'
  try { preview = fromUnits(demonstrate(toUnits(amount), scenario).received) } catch { /* Invalid input remains visible until submission. */ }
  return {
    mode, amount, minimum, minutes, scenario, wallet, config, draftConfig, dialog,
    entries, message, busy, prepared, lastResult, preview, liveQuote,
    changeAmount, changeMinimum, changeMinutes, changeMode, changeScenario,
    setDraftConfig, setDialog, setMessage, connect, disconnect, run, runDemo, sign,
    openSettings, closeDialog, saveSettings, applyDeployment, refreshQuote, setBusy, record,
  }
}
export type CaveatState = ReturnType<typeof useCaveat>
