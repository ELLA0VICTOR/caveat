import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, LoaderCircle, Wallet } from 'lucide-react'
import { pendingKey } from '@caveat/sdk/networks'
import { MainnetSetup } from './MainnetSetup'
import type { TransactionPreparation } from '@caveat/sdk'
import type { CaveatState } from '../hooks/useCaveat'
type WalletInfo = { xlm: string; usdc: string; shares: string; nonce: bigint; trustline: boolean }

export function WalletSetup({ caveat: c }: { caveat: CaveatState }) {
  const EXECUTOR = c.executorId, EXECUTOR_HASH = c.profile.executorHash, ROUTE = c.route, USDC_ISSUER = c.profile.usdcIssuer
  const network = c.network, executorId = c.executorId
  const storageKey = pendingKey(network, 'trustline')
  const [response, setResponse] = useState<{ owner: string; info: WalletInfo } | null>(null)
  const info = response?.owner === c.wallet ? response.info : null
  const [preparation, setPreparation] = useState<TransactionPreparation | null>(null)
  const [pending, setPending] = useState<string>(() => localStorage.getItem(storageKey) || '')
  const [reading, setReading] = useState(false)
  async function refresh() {
    if (!c.wallet) return
    setReading(true)
    try { const module = await import('../lib/executor'); const executor = network === 'testnet' ? module.executor : module.clientFor(network, executorId); if (executorId) await executor.verifyExecutor(); else await executor.verifyRoute(); setResponse({ owner: c.wallet, info: await executor.wallet(c.wallet) }) }
    catch (error) { c.setMessage(error instanceof Error ? error.message : 'Wallet balances unavailable.') }
    finally { setReading(false) }
  }
  const wallet = c.wallet
  const setMessage = c.setMessage
  useEffect(() => {
    if (!wallet) return
    let active = true
    void import('../lib/executor').then(async module => { const executor = network === 'testnet' ? module.executor : module.clientFor(network, executorId); if (executorId) await executor.verifyExecutor(); else await executor.verifyRoute(); return executor.wallet(wallet) })
      .then(info => { if (active) setResponse({ owner: wallet, info }) })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Wallet balances unavailable.') })
    return () => { active = false }
  }, [wallet, network, executorId, setMessage])
  async function prepare() {
    c.setBusy(true)
    try { const module = await import('../lib/executor'); const executor = network === 'testnet' ? module.executor : module.clientFor(network, executorId); setPreparation(await executor.prepareTrustline(c.wallet)); c.setMessage('') }
    catch (error) { c.setMessage(error instanceof Error ? error.message : 'Trustline preparation failed.') }
    finally { c.setBusy(false) }
  }
  async function finish(hash: string, status: 'pending' | 'failed' | 'confirmed') {
    c.record({ hash, status, title: `Enable ${c.usdcLabel}`, mode: network === 'mainnet' ? 'Mainnet' : 'Testnet', detail: status === 'confirmed' ? `Your wallet can now receive the exact ${c.usdcLabel} asset.` : status === 'pending' ? 'USDC setup is awaiting ledger confirmation.' : 'Trustline setup failed; network fees may apply.' })
    if (status === 'pending') return
    try { localStorage.removeItem(storageKey) } catch { /* Keep the observed ledger result in this session. */ }
    setPending(''); setPreparation(null)
    await refresh()
    c.setMessage(status === 'confirmed' ? `Your wallet can now receive ${c.usdcLabel}. Close setup and prepare your action.` : 'Trustline setup failed.')
  }
  async function sign() {
    if (!preparation) return
    if (!c.startTransaction('trustline', `Enable ${c.usdcLabel}`, async hash => {
      const { transactionStatus } = await import('../lib/stellar')
      await finish(hash, (await transactionStatus(hash, network)).status)
    })) return
    c.setBusy(true)
    try {
      const { submitTransaction } = await import('../lib/stellar')
      const result = await submitTransaction(c.wallet, preparation, c.transactionProgress, hash => {
        c.transactionSubmitted(hash); setPending(hash)
        try { localStorage.setItem(storageKey, hash) } catch { /* The current page still tracks the submitted hash. */ }
      }, network)
      await finish(result.hash, result.status)
    } catch (error) { c.transactionError(error) }
    finally { c.setBusy(false) }
  }
  async function check() {
    c.setBusy(true)
    c.resumeTransaction('trustline', `Enable ${c.usdcLabel}`, pending, async hash => {
      const { transactionStatus } = await import('../lib/stellar')
      await finish(hash, (await transactionStatus(hash, network)).status)
    })
    try { const { transactionStatus } = await import('../lib/stellar'); const result = await transactionStatus(pending, network); await finish(result.hash, result.status) }
    catch (error) { c.transactionError(error) }
    finally { c.setBusy(false) }
  }
  return <section className="wallet-setup"><span className="setup-label">YOUR WALLET / NO CAVEAT DEPOSIT</span><h3>Keep funds where they belong.</h3><p>Caveat takes only the amount needed for your action and returns tokens or pool shares to this wallet in the same transaction.</p>
    {!c.wallet ? <button className="setup-button" onClick={c.connect} disabled={c.busy}><Wallet size={14}/> Connect {c.profile.label.toLowerCase()} wallet</button> : <>
      <div className="setup-owner"><span>Wallet</span><code>{c.wallet.slice(0, 8)}…{c.wallet.slice(-6)}</code></div>
      {info && <div className="setup-balances"><div><span>Wallet XLM</span><strong>{info.xlm}</strong></div><div><span>Wallet {c.usdcLabel}</span><strong>{info.usdc}</strong></div><small>Pool shares {info.shares} · intent nonce {info.nonce.toString()}</small></div>}
      <button className="plain-link" onClick={refresh} disabled={reading || c.busy}>{reading ? <LoaderCircle size={12} className="loading-icon"/> : <ArrowUpRight size={12}/>} Refresh wallet balances</button>
      {pending ? <><p>USDC setup submitted. Check ledger confirmation before proceeding.</p><a className="plain-link" href={`${c.profile.explorer}/tx/${pending}`} target="_blank" rel="noreferrer">Inspect transaction <ArrowUpRight size={12}/></a><button className="setup-button" onClick={check} disabled={c.busy}>Check USDC setup</button></>
        : preparation ? <><h4>Enable {c.usdcLabel} in your wallet</h4><p>This is Stellar’s one-time permission to receive this exact asset. It does not give Caveat permission to spend your funds.</p><div className="setup-review"><div><span>Asset</span><code>USDC</code></div><div><span>Exact issuer</span><code>{USDC_ISSUER}</code></div><div><span>Signer</span><code>{preparation.source}</code></div><div><span>Maximum fee</span><code>{Number(preparation.fee) / 1e7} {network === 'testnet' ? 'test XLM' : 'XLM'}</code></div></div><details className="xdr-details"><summary>Inspect unsigned trustline XDR</summary><textarea value={preparation.xdr} readOnly aria-label="Trustline transaction XDR"/></details><button className="setup-button" onClick={sign} disabled={c.busy}><Wallet size={14}/> Sign USDC setup in Freighter</button><button className="plain-link setup-cancel" onClick={() => setPreparation(null)} disabled={c.busy}>Cancel review</button></>
          : info && !info.trustline ? <><p>Stellar requires a trustline before your wallet can receive {c.usdcLabel}. Enable it once, then swap directly from your wallet.</p><button className="setup-button" onClick={prepare} disabled={c.busy}>Review {c.usdcLabel} setup <ArrowRight size={14}/></button></> : info ? <p className="setup-ready">{c.usdcLabel} enabled. {c.executorId ? 'Ready for wallet-funded actions.' : 'Deploy or select the guard to complete setup.'}</p> : null}
    </>}
    {network === 'mainnet' && <MainnetSetup caveat={c}/>}
    <details className="setup-recovery"><summary>Shared guard & exact token identities</summary><div className="setup-review">{[['Executor', EXECUTOR || 'Deployment required'], ['WASM SHA-256', EXECUTOR_HASH], ['Native XLM', ROUTE.token_a], [c.usdcLabel, ROUTE.token_b], ['Pool shares', ROUTE.pair]].map(([label, value]) => <div key={label}><span>{label}</span><code>{value}</code></div>)}</div></details>
  </section>
}
