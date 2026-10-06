import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Wallet } from 'lucide-react'
import type { ExecutorDeployment } from '@caveat/sdk'
import type { CaveatState } from '../hooks/useCaveat'
import type { PendingDeployment } from '../lib/mainnet'

export function MainnetSetup({ caveat: c }: { caveat: CaveatState }) {
  const [preparation, setPreparation] = useState<ExecutorDeployment | null>(null)
  const [existing, setExisting] = useState('')
  const title = preparation?.kind === 'upload' ? 'Publish Caveat guard code' : 'Deploy Caveat guard'
  async function prepare() {
    if (!c.wallet) { await c.connect(); return }
    c.setBusy(true)
    try {
      const { prepareMainnetDeployment } = await import('../lib/mainnet')
      setPreparation(await prepareMainnetDeployment(c.wallet)); c.setMessage('')
    } catch (error) { c.setMessage(error instanceof Error ? error.message : 'Deployment preparation failed.') }
    finally { c.setBusy(false) }
  }
  async function sign() {
    if (!preparation || !c.startTransaction('setup', title)) return
    const current = preparation
    let submitted: PendingDeployment | undefined
    c.setBusy(true)
    try {
      const { submitTransaction } = await import('../lib/stellar')
      const receipt = await submitTransaction(c.wallet, current.transaction, c.transactionProgress, hash => {
        submitted = { hash, deployment: current }
        c.rememberDeployment(submitted); c.transactionSubmitted(hash)
      }, 'mainnet')
      if (submitted) await c.finishDeployment(receipt, submitted)
      setPreparation(null)
    } catch (error) { c.transactionError(error) }
    finally { c.setBusy(false) }
  }
  async function select() {
    c.setBusy(true)
    try {
      const { CaveatClient } = await import('@caveat/sdk')
      const client = new CaveatClient(existing.trim(), undefined, 'mainnet')
      await client.verifyExecutor(); c.applyExecutor(client.executor)
      c.setMessage('Mainnet guard bytecode, configuration and route verified.')
    } catch (error) { c.setMessage(error instanceof Error ? error.message : 'Guard verification failed.') }
    finally { c.setBusy(false) }
  }
  if (c.executorId) return <div className="setup-ready"><p>Mainnet guard selected. Every protected action verifies its bytecode and route before signing.</p><a className="plain-link" href={`${c.profile.explorer}/contract/${c.executorId}`} target="_blank" rel="noreferrer">Inspect Mainnet guard <ArrowUpRight size={12}/></a></div>
  return <div className="mainnet-setup">
    <h4>Prepare the Mainnet guard.</h4><p>Publish the tested code, then create a shared executor for the real Soroswap XLM / USDC pool. These are deployment transactions, paid in XLM. Your trading funds stay in your wallet.</p>
    {c.deploymentPending ? <><p>A deployment transaction is awaiting confirmation.</p><button className="setup-button" onClick={c.openTransaction} disabled={c.busy}>Check deployment <ArrowRight size={14}/></button></>
      : preparation ? <>
        <div className="setup-review">{[
          ['Network', 'Stellar Mainnet · real XLM'], ['Operation', title], ['Signer', preparation.transaction.source],
          ['Maximum network fee', `${Number(preparation.transaction.fee) / 1e7} XLM`],
          ['Executor WASM SHA-256', c.profile.executorHash], ['Router', c.route.router], ['Pool', c.route.pair],
          ...(preparation.executor ? [['New executor', preparation.executor]] : []),
        ].map(([label, value]) => <div key={label}><span>{label}</span><code>{value}</code></div>)}</div>
        <p>{preparation.kind === 'upload' ? 'This publishes the code to Stellar. After confirmation, review a separate transaction to create the guard.' : 'This creates the guard with an immutable route. The app will verify the confirmed contract before enabling protected actions.'}</p>
        <details className="xdr-details"><summary>Inspect unsigned deployment XDR</summary><textarea value={preparation.transaction.xdr} readOnly aria-label="Mainnet deployment transaction XDR"/></details>
        <button className="setup-button" onClick={sign} disabled={c.busy}><Wallet size={14}/> Sign {preparation.kind === 'upload' ? 'code publication' : 'guard creation'} in Freighter</button>
        <button className="plain-link setup-cancel" onClick={() => setPreparation(null)} disabled={c.busy}>Cancel review</button>
      </> : <button className="setup-button" onClick={prepare} disabled={c.busy}>Review Mainnet deployment <ArrowRight size={14}/></button>}
    <details className="setup-recovery"><summary>Use an existing Caveat Mainnet guard</summary><p>A shared guard can serve several wallets. Its tested bytecode and exact Soroswap route must match before it can be selected.</p><label className="deployment-field">Executor address<input value={existing} onChange={event => setExisting(event.target.value)} placeholder="C…" disabled={c.busy || Boolean(c.deploymentPending)}/></label><button className="setup-button" onClick={select} disabled={c.busy || !existing.trim() || Boolean(c.deploymentPending)}>Verify & select guard <ArrowRight size={14}/></button></details>
  </div>
}
