import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, LoaderCircle, Wallet } from 'lucide-react'
import { EXECUTOR, EXECUTOR_HASH, ROUTE, USDC_ISSUER } from '@caveat/sdk/deployment'
import type { TransactionPreparation } from '@caveat/sdk'
import type { CaveatState } from '../hooks/useCaveat'
type WalletInfo = { xlm: string; usdc: string; shares: string; nonce: bigint; trustline: boolean }

export function WalletSetup({ caveat: c }: { caveat: CaveatState }) {
  const [response, setResponse] = useState<{ owner: string; info: WalletInfo } | null>(null)
  const info = response?.owner === c.wallet ? response.info : null
  const [preparation, setPreparation] = useState<TransactionPreparation | null>(null)
  const [pending, setPending] = useState<string>(() => localStorage.getItem('caveat-trustline-pending') || '')
  const [reading, setReading] = useState(false)
  async function refresh() {
    if (!c.wallet) return
    setReading(true)
    try { const { executor } = await import('../lib/executor'); await executor.verifyExecutor(); setResponse({ owner: c.wallet, info: await executor.wallet(c.wallet) }) }
    catch (error) { c.setMessage(error instanceof Error ? error.message : 'Wallet balances unavailable.') }
    finally { setReading(false) }
  }
  const wallet = c.wallet
  const setMessage = c.setMessage
  useEffect(() => {
    if (!wallet) return
    let active = true
    void import('../lib/executor').then(async ({ executor }) => { await executor.verifyExecutor(); return executor.wallet(wallet) })
      .then(info => { if (active) setResponse({ owner: wallet, info }) })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Wallet balances unavailable.') })
    return () => { active = false }
  }, [wallet, setMessage])
  async function prepare() {
    c.setBusy(true)
    try { const { executor } = await import('../lib/executor'); setPreparation(await executor.prepareTrustline(c.wallet)); c.setMessage('') }
    catch (error) { c.setMessage(error instanceof Error ? error.message : 'Trustline preparation failed.') }
    finally { c.setBusy(false) }
  }
  async function finish(hash: string, status: 'pending' | 'failed' | 'confirmed') {
    if (status === 'pending') { c.setMessage('USDC setup is awaiting confirmation. Check it before signing another transaction.'); return }
    localStorage.removeItem('caveat-trustline-pending'); setPending(''); setPreparation(null)
    c.record({ hash, status, title: 'Enable test USDC', mode: 'Testnet', detail: status === 'confirmed' ? 'Stellar confirmed the wallet trustline. No Caveat deposit was made.' : 'Trustline setup failed; network fees may apply.' })
    await refresh()
    c.setMessage(status === 'confirmed' ? 'Your wallet can now receive test USDC. Close setup and prepare your action.' : 'Trustline setup failed.')
  }
  async function sign() {
    if (!preparation) return
    c.setBusy(true)
    try {
      const { submitTransaction } = await import('../lib/stellar')
      const result = await submitTransaction(c.wallet, preparation, c.setMessage, hash => { setPending(hash); localStorage.setItem('caveat-trustline-pending', hash) })
      await finish(result.hash, result.status)
    } catch (error) { c.setMessage(error instanceof Error ? error.message : 'USDC setup submission failed.') }
    finally { c.setBusy(false) }
  }
  async function check() {
    c.setBusy(true)
    try { const { transactionStatus } = await import('../lib/stellar'); const result = await transactionStatus(pending); await finish(result.hash, result.status) }
    catch (error) { c.setMessage(error instanceof Error ? error.message : 'Confirmation unavailable.') }
    finally { c.setBusy(false) }
  }
  return <section className="wallet-setup"><span className="setup-label">YOUR WALLET / NO CAVEAT DEPOSIT</span><h3>Keep funds where they belong.</h3><p>Caveat takes only the amount needed for your action and returns tokens or pool shares to this wallet in the same transaction.</p>
    {!c.wallet ? <button className="setup-button" onClick={c.connect} disabled={c.busy}><Wallet size={14}/> Connect testnet wallet</button> : <>
      <div className="setup-owner"><span>Wallet</span><code>{c.wallet.slice(0, 8)}…{c.wallet.slice(-6)}</code></div>
      {info && <div className="setup-balances"><div><span>Wallet XLM</span><strong>{info.xlm}</strong></div><div><span>Wallet test USDC</span><strong>{info.usdc}</strong></div><small>Pool shares {info.shares} · intent nonce {info.nonce.toString()}</small></div>}
      <button className="plain-link" onClick={refresh} disabled={reading || c.busy}>{reading ? <LoaderCircle size={12} className="loading-icon"/> : <ArrowUpRight size={12}/>} Refresh wallet balances</button>
      {pending ? <><p>USDC setup submitted. Check ledger confirmation before proceeding.</p><a className="plain-link" href={`https://stellar.expert/explorer/testnet/tx/${pending}`} target="_blank" rel="noreferrer">Inspect transaction <ArrowUpRight size={12}/></a><button className="setup-button" onClick={check} disabled={c.busy}>Check USDC setup</button></>
        : preparation ? <><h4>Enable test USDC in your wallet</h4><p>This is Stellar’s one-time permission to receive this exact asset. It does not give Caveat permission to spend your funds.</p><div className="setup-review"><div><span>Asset</span><code>USDC</code></div><div><span>Exact issuer</span><code>{USDC_ISSUER}</code></div><div><span>Signer</span><code>{preparation.source}</code></div><div><span>Maximum fee</span><code>{Number(preparation.fee) / 1e7} test XLM</code></div></div><details className="xdr-details"><summary>Inspect unsigned trustline XDR</summary><textarea value={preparation.xdr} readOnly aria-label="Trustline transaction XDR"/></details><button className="setup-button" onClick={sign} disabled={c.busy}><Wallet size={14}/> Sign USDC setup in Freighter</button><button className="plain-link setup-cancel" onClick={() => setPreparation(null)} disabled={c.busy}>Cancel review</button></>
          : info && !info.trustline ? <><p>Stellar requires a trustline before your wallet can receive test USDC. Enable it once, then swap directly from your wallet.</p><button className="setup-button" onClick={prepare} disabled={c.busy}>Review test USDC setup <ArrowRight size={14}/></button></> : info ? <p className="setup-ready">Test USDC enabled. Ready for wallet-funded actions.</p> : null}
    </>}
    <details className="setup-recovery"><summary>Shared guard & exact token identities</summary><div className="setup-review">{[['Executor', EXECUTOR], ['WASM SHA-256', EXECUTOR_HASH], ['Native XLM', ROUTE.token_a], ['Test USDC', ROUTE.token_b], ['Pool shares', ROUTE.pair]].map(([label, value]) => <div key={label}><span>{label}</span><code>{value}</code></div>)}</div></details>
  </section>
}
