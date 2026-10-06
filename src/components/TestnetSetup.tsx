import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, LoaderCircle, Wallet } from 'lucide-react'
import type { CaveatState } from '../hooks/useCaveat'
import type { SetupAction } from '../lib/testnet'
import { ACCOUNT_WASM_HASH } from '../lib/contracts'
import { fromUnits } from '../lib/policy'
type Pending = { hash: string; action: SetupAction }
type AccountInfo = { input: string; output: string; nonce: string; ledger: number }
const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-5)}`
const titles = { upload: 'Publish the tested contract', create: 'Create your Caveat account', deposit: 'Deposit test XLM', withdraw: 'Recover your tokens' }

export function TestnetSetup({ caveat: c }: { caveat: CaveatState }) {
  const [action, setAction] = useState<SetupAction | null>(null)
  const [pending, setPending] = useState<Pending | null>(() => {
    try { return JSON.parse(localStorage.getItem('caveat-setup-pending') || 'null') } catch { return null }
  })
  const [info, setInfo] = useState<AccountInfo | null>(null)
  const [deposit, setDeposit] = useState('5')
  const [withdrawal, setWithdrawal] = useState('')
  const [recoverOutput, setRecoverOutput] = useState(false)

  function remember(value: Pending | null) {
    setPending(value)
    if (value) localStorage.setItem('caveat-setup-pending', JSON.stringify(value))
    else localStorage.removeItem('caveat-setup-pending')
  }
  async function prepare(kind: 'create' | 'deposit' | 'withdraw' | 'inspect') {
    if (!c.wallet) { await c.connect(); return }
    c.setBusy(true); c.setMessage('Checking testnet contracts…')
    try {
      const stellar = await import('../lib/testnet')
      if (kind === 'inspect') {
        setInfo(await stellar.inspectAccount(c.wallet, c.config)); c.setMessage('Owner, bytecode, allowlists, and balances checked against testnet.')
      } else {
        setAction(kind === 'create' ? await stellar.prepareAccount(c.wallet)
          : kind === 'deposit' ? await stellar.prepareDeposit(c.wallet, c.config, deposit)
            : await stellar.prepareWithdrawal(c.wallet, c.config, recoverOutput ? c.config.output : c.config.input, withdrawal))
        c.setMessage('')
      }
    } catch (error) { c.setMessage(error instanceof Error ? error.message : 'Testnet setup failed.') }
    finally { c.setBusy(false) }
  }
  async function finish(value: Pending, status: 'confirmed' | 'failed' | 'pending') {
    if (status === 'pending') { c.setMessage('Awaiting ledger confirmation. Check this transaction before proceeding.'); return }
    if (status === 'failed') {
      remember(null); setAction(null); c.setMessage('Ledger reports failure. No successful operation was recorded; network fees may apply.')
      c.record({ title: titles[value.action.kind], detail: 'Ledger reports failure.', hash: value.hash, mode: 'Testnet', status }); return
    }
    const stellar = await import('../lib/testnet')
    const completed = value.action
    if (completed.kind === 'create') {
      // Read the ledger before making a simulated address the configured account.
      const verified = await stellar.inspectAccount(completed.transaction.source, completed.config)
      c.applyDeployment(completed.config); setInfo(verified)
    } else if (completed.kind !== 'upload') setInfo(await stellar.inspectAccount(completed.transaction.source, completed.config))
    remember(null); setAction(null)
    c.record({ title: titles[completed.kind], detail: 'Confirmed by the Stellar testnet ledger.', hash: value.hash, mode: 'Testnet', status })
    c.setMessage(completed.kind === 'upload' ? 'Contract code confirmed. Select Create account to review the owner and immutable allowlists.'
      : completed.kind === 'create' ? 'Your Caveat account is confirmed. Review a small deposit next.'
        : completed.kind === 'deposit' ? 'Deposit confirmed. Close settings, load a live quote, and review your swap.' : 'Recovery confirmed.')
  }
  async function sign() {
    if (!action) return
    c.setBusy(true)
    try {
      const { submitTransaction } = await import('../lib/stellar')
      const receipt = await submitTransaction(c.wallet, action.transaction, c.setMessage, hash => remember({ hash, action }))
      await finish({ hash: receipt.hash, action }, receipt.status)
    } catch (error) { c.setMessage(error instanceof Error ? error.message : 'Submission failed.') }
    finally { c.setBusy(false) }
  }
  async function checkPending() {
    if (!pending) return
    c.setBusy(true); c.setMessage('Checking ledger confirmation…')
    try {
      const { transactionStatus } = await import('../lib/stellar')
      const receipt = await transactionStatus(pending.hash)
      await finish(pending, receipt.status)
    } catch (error) { c.setMessage(error instanceof Error ? error.message : 'Could not check confirmation.') }
    finally { c.setBusy(false) }
  }
  if (pending) return <div className="wallet-setup"><span className="setup-label">SUBMITTED / CONFIRMATION REQUIRED</span><h3>{titles[pending.action.kind]}</h3><p>This transaction has been submitted. Check its status before preparing another operation.</p><a className="plain-link" href={`https://stellar.expert/explorer/testnet/tx/${pending.hash}`} target="_blank" rel="noreferrer">Inspect {short(pending.hash)} <ArrowUpRight size={12}/></a><button className="setup-button" onClick={checkPending} disabled={c.busy}>{c.busy ? <LoaderCircle size={14} className="loading-icon"/> : null} Check confirmation</button></div>
  if (action) {
    const fee = fromUnits(BigInt(action.transaction.fee))
    return <div className="wallet-setup"><span className="setup-label">REVIEW / WALLET SIGNATURE REQUIRED</span><h3>{titles[action.kind]}</h3><p>{action.kind === 'upload' ? 'Publish the checksum-verified release on testnet. This step does not create or fund an account.' : action.kind === 'create' ? 'Deployment and owner initialization happen atomically. These allowlists are immutable.' : action.kind === 'deposit' ? 'Move a small amount of test XLM from your wallet into your verified Caveat account.' : 'The owner authorizes withdrawal to the same wallet. A USDC withdrawal requires a wallet trustline for the exact issuer.'}</p><div className="setup-review">
      <div><span>Owner / signer</span><code>{action.transaction.source}</code></div>
      <div><span>Network</span><code>Stellar Testnet</code></div>
      {action.kind === 'upload' || action.kind === 'create' ? <div><span>WASM SHA-256</span><code>{ACCOUNT_WASM_HASH}</code></div> : null}
      {action.kind !== 'upload' ? <div><span>Caveat account{action.kind === 'create' ? ' (predicted)' : ''}</span><code>{action.config.account}</code></div> : null}
      {action.kind === 'create' ? <><div><span>Only router</span><code>{action.config.router}</code></div><div><span>Input token · XLM</span><code>{action.config.input}</code></div><div><span>Output token · test USDC</span><code>{action.config.output}</code></div></> : null}
      {action.amount ? <><div><span>Amount</span><code>{action.amount} {action.token === action.config.input ? 'test XLM' : 'test USDC'}</code></div><div><span>Exact token</span><code>{action.token}</code></div><div><span>Destination</span><code>{action.kind === 'deposit' ? action.config.account : action.transaction.source}</code></div></> : null}
      <div><span>Maximum transaction fee</span><code>{fee} test XLM</code></div>
      <div><span>Expires</span><code>{new Date(action.transaction.expiresAt * 1000).toLocaleTimeString()}</code></div>
    </div><details className="xdr-details"><summary>Inspect unsigned transaction XDR</summary><textarea readOnly aria-label="Setup transaction XDR" value={action.transaction.xdr}/></details><button className="setup-button" onClick={sign} disabled={c.busy}>{c.busy ? <LoaderCircle size={14} className="loading-icon"/> : <Wallet size={14}/>} Sign in Freighter</button><button className="plain-link setup-cancel" onClick={() => { setAction(null); c.setMessage('') }} disabled={c.busy}>Cancel review</button></div>
  }
  return <div className="wallet-setup"><span className="setup-label">WALLET SETUP / XLM → TEST USDC</span><h3>{c.config.account ? 'Your contract account.' : 'Create your contract account.'}</h3><p>Uses the tested Caveat release and the verified Soroswap route. Every write is reviewed and signed in Freighter.</p>
    {!c.wallet ? <button className="setup-button" onClick={c.connect} disabled={c.busy}><Wallet size={14}/> Connect testnet wallet</button> : <>
      <div className="setup-owner"><span>Owner</span><code>{short(c.wallet)}</code><Check size={12}/></div>
      {!c.config.account ? <button className="setup-button" onClick={() => prepare('create')} disabled={c.busy}>{c.busy ? <LoaderCircle size={14} className="loading-icon"/> : <ArrowRight size={14}/>} Prepare account creation</button> : <>
        <button className="plain-link" onClick={() => prepare('inspect')} disabled={c.busy}>Verify account & refresh balances <ArrowUpRight size={12}/></button>
        {info ? <div className="setup-balances"><div><span>Contract-held XLM</span><strong>{info.input}</strong></div><div><span>Contract-held test USDC</span><strong>{info.output}</strong></div><small>RPC ledger {info.ledger} · nonce {info.nonce}</small></div> : null}
        <label className="deployment-field">Deposit test XLM<input inputMode="decimal" value={deposit} onChange={event => setDeposit(event.target.value)} disabled={c.busy}/><small>Suggested first deposit: 5 XLM. Maximum: 100.</small></label>
        <button className="setup-button" onClick={() => prepare('deposit')} disabled={c.busy}>Review deposit <ArrowRight size={14}/></button>
        <details className="setup-recovery"><summary>Owner recovery</summary><label className="deployment-field">Token<select value={recoverOutput ? 'output' : 'input'} disabled={c.busy} onChange={event => setRecoverOutput(event.target.value === 'output')}><option value="input">Native XLM</option><option value="output">Test USDC</option></select></label><label className="deployment-field">Amount to withdraw<input inputMode="decimal" value={withdrawal} disabled={c.busy} onChange={event => setWithdrawal(event.target.value)}/></label><button className="setup-button" onClick={() => prepare('withdraw')} disabled={c.busy}>Review withdrawal <ArrowRight size={14}/></button><p>USDC needs a wallet trustline for issuer GBBD47…FLA5. Add that exact asset in Freighter before recovery.</p></details>
      </>}
    </>}
  </div>
}
