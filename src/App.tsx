import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Copy, ExternalLink, LoaderCircle, LockKeyhole, Wallet } from 'lucide-react'
import { useCaveat } from './hooks/useCaveat'
import { BoundaryArt } from './components/BoundaryArt'
import { Brand } from './components/Brand'
import { Dialog } from './components/Dialog'
import { IntentSlip } from './components/IntentSlip'
import { TestnetSetup } from './components/TestnetSetup'
import { WalletSetup } from './components/WalletSetup'
import { EXECUTOR, ROUTE, swapAssets } from '@caveat/sdk/deployment'
import './App.css'

const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-5)}`
const mechanisms = [
  { number: '01', title: 'Set the terms.', copy: 'Your token addresses. Your maximum spend. Your minimum receipt. A deadline and zero allowances. Every condition is part of the signed intent.' },
  { number: '02', title: 'Make the call.', copy: 'Only the funds needed for this action move from your wallet through the guard. Soroswap performs the swap or liquidity deposit using exact authorized transfers.' },
  { number: '03', title: 'Read the result.', copy: 'The guard measures real token or pool-share receipts and returns them to your wallet. If a condition fails, the invocation’s token movements roll back together.' },
]

function App() {
  const c = useCaveat()
  const preparedAssets = swapAssets(c.prepared?.terms.direction)
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copyrightYear] = useState(() => new Date().getFullYear())

  return (
    <div className="caveat-page">
      <a className="skip-link" href="#intent">Skip to the swap</a>
      <header className="site-header">
        <a className="brand-link" href="#top" aria-label="Caveat home"><Brand/></a>
        <nav className={`site-navigation ${menuOpen ? 'navigation-open' : ''}`} aria-label="Main navigation">
          <a href="#mechanism" onClick={() => setMenuOpen(false)}>The mechanism</a>
          <a href="#integration" onClick={() => setMenuOpen(false)}>Soroswap <ArrowUpRight size={12}/></a>
          <button onClick={() => { c.setDialog('receipts'); setMenuOpen(false) }}>Receipts{c.entries.length > 0 && <span className="receipt-count">{c.entries.length}</span>}</button>
        </nav>
        <div className="header-actions"><span className="network-label"><span/> STELLAR TESTNET</span><button className="connect-button" onClick={c.wallet ? c.disconnect : c.connect} disabled={c.busy} aria-label={c.wallet ? 'Disconnect wallet' : 'Connect wallet'} title={c.wallet ? 'Disconnect wallet' : 'Connect wallet'}>{c.busy ? <LoaderCircle size={15} className="loading-icon"/> : <Wallet size={15}/>}<span>{c.wallet ? short(c.wallet) : 'Connect wallet'}</span><ArrowUpRight size={14}/></button><button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}><span/><span/></button></div>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-editorial">
            <div className="hero-eyebrow"><span className="asterisk-small">✳</span> A CONDITION FOR EVERY SIGNATURE <span className="eyebrow-line"/></div>
            <h1>Your signature.<br/><em>Your terms.</em></h1>
            <p className="hero-description">A better way to say yes to DeFi.<br/>Set what you’ll spend, what you’ll receive,<br className="wide-break"/> and where permission ends.</p>
            <a className="editorial-link" href="#mechanism">The thinking behind Caveat <span><ArrowDownIcon/></span></a>
            <div className="hero-illustration"><BoundaryArt/><div className="illustration-caption"><span className="caption-mark">[c]</span><p>Freedom to transact.<br/><strong>Boundaries that follow through.</strong></p><span className="illustration-edition">FIG. 001<br/>BOUNDED EXECUTION</span></div></div>
          </div>
          <IntentSlip caveat={c}/>
        </section>

        <div className="protocol-strip"><div><span className="strip-label">BUILT FOR</span><span className="stellar-wordmark">◉ stellar</span><span className="strip-divider"/><span className="soroban-wordmark">Soroban</span></div><p>A signed boundary. An actual balance check.</p><button onClick={() => c.setDialog('model')}>Read the security model <ArrowUpRight size={14}/></button></div>

        <section className="mechanism-section" id="mechanism" aria-labelledby="mechanism-title">
          <div className="mechanism-heading"><div><span className="section-index">THE MECHANISM</span><h2 id="mechanism-title">Permission is specific.<br/><em>Execution should be, too.</em></h2></div><p>The guard checks what happened.<br/>Your conditions decide what stays.</p></div>
          <div className="mechanism-steps">{mechanisms.map(item => <article key={item.number}><div className="mechanism-step-number"><span>{item.number}</span><ArrowUpRight size={19}/></div><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
          <div className="mechanism-footnote"><LockKeyhole size={14}/><p>Protection applies to actions routed through the guard. Network fees still apply to failed transactions.</p><button onClick={() => c.setDialog('model')}>Understand the boundary <ArrowUpRight size={13}/></button></div>
        </section>

        <section className="integration-section" id="integration"><div className="integration-title"><span className="section-index">TWO ACTIONS / ONE SHARED GUARD</span><h2>Soroswap.<br/><em>With a caveat.</em></h2><p>Swap tokens or provide liquidity. Limit what leaves your wallet and require a minimum actual receipt. Other apps can use the same guard through the Caveat SDK.</p><a className="editorial-link" href="/integrations/pool/index.html" target="_blank" rel="noreferrer">Open the separate integration example <ArrowUpRight size={16}/></a></div><div className="integration-contract"><div className="contract-label"><span className="protocol-symbol">↗</span> SOROSWAP ROUTER <span>SEP-41</span></div><code>swap / add_liquidity</code><div className="execution-path"><span>Your wallet</span><ArrowRight size={15}/><span>Guard + Soroswap</span><ArrowRight size={15}/><strong>Your wallet</strong></div><div className="contract-info"><div><span>Network</span><strong>Stellar Testnet</strong></div><div><span>Token approvals</span><strong>Zero allowances</strong></div><div><span>Shared executor</span><button title={EXECUTOR} onClick={c.openSettings}>Inspect deployment <ArrowUpRight size={12}/></button></div></div><a href="https://github.com/soroswap/core/blob/main/contracts/router/src/lib.rs" target="_blank" rel="noreferrer">Inspect the official router source <ExternalLink size={13}/></a></div></section>

        <section className="questions-section"><div><span className="section-index">BEFORE YOU SIGN</span><h2>The important<br/><em>fine print.</em></h2></div><div className="question-list">{[
          ['Does this use real contracts?', 'Yes. Trades use real contracts on Stellar Testnet with test tokens. You sign from your wallet; no Caveat account or deposit is required. Only successful ledger confirmation is shown as completed execution.'],
          ['Does Caveat follow me to other apps?', 'An app must integrate the guard. The standalone SDK and separate liquidity example show how another interface can use it. Ordinary Freighter transactions on apps that have not integrated Caveat receive no Caveat protection.'],
          ['What happens when I provide liquidity?', 'Your wallet contributes XLM and test USDC to the Soroswap pool. You sign a maximum for each and a minimum number of pool shares. Shares return to your wallet. Later price changes, impermanent loss and pool withdrawals are outside this transaction’s checks.'],
          ['Can I still get a bad price?', 'Yes. An outcome that satisfies weak conditions you sign is allowed. You choose the minimum receipt. This product does not judge whether those conditions represent a fair market price.'],
          ['Is Caveat ready for mainnet?', 'This is a testnet hackathon prototype with a pinned Soroswap integration. It requires independent security review before use with real funds. It assumes honest token balance reports and does not prevent issuer freezes, clawbacks, compromised keys or weak terms you sign.'],
        ].map(([question, answer]) => <details key={question}><summary>{question}<span className="question-plus">+</span></summary><p>{answer}</p></details>)}</div></section>
      </main>

      <footer className="site-footer"><div className="footer-upper"><a href="#top" aria-label="Back to top"><Brand large/></a><p>A little more intention<br/>in every transaction.</p><a href="#intent" className="back-to-intent">Write your terms <ArrowUpRight size={20}/></a></div><div className="footer-lower"><span>© {copyrightYear} CAVEAT</span><span>STELLAR / SOROBAN</span><span>FIND YOUR WAY · GENERAL TRACK</span><button onClick={() => c.setDialog('model')}>Architecture & trust assumptions <ArrowUpRight size={12}/></button></div></footer>

      {c.dialog && <Dialog title={c.dialog === 'settings' ? 'Testnet wallet setup' : c.dialog === 'review' ? 'Review signed intent' : c.dialog === 'receipts' ? 'Execution receipts' : 'Security model'} onClose={c.closeDialog} busy={c.busy} wide={c.dialog === 'review'}>
        {c.dialog === 'settings' ? <>
          <span className="dialog-kicker">TESTNET / WALLET SETUP</span><h2>Your wallet.<br/><em>Your conditions.</em></h2><p className="dialog-intro">Use the shared guard directly from Freighter. Enable test USDC once, then review each protected action.</p>
          <div className="dialog-network"><span/> STELLAR TESTNET <code>soroban-testnet.stellar.org</code></div>
          <WalletSetup caveat={c}/>
          {c.message && <div className="inline-feedback" role="status">{c.message}</div>}
          <details className="manual-deployment"><summary>Recover funds from an earlier account <ChevronDown size={13}/></summary>
          <TestnetSetup caveat={c}/>
          {([
            { key: 'account', label: 'Caveat account contract', help: 'Your wallet must be the owner of this deployed account.' },
            { key: 'router', label: 'Soroswap router contract', help: 'Published testnet ID. Verify provenance after network resets.' },
            { key: 'input', label: 'Exact input token contract', help: 'Must belong to the account’s immutable token allowlist.' },
            { key: 'output', label: 'Exact output token contract', help: 'Identity is the address. Symbols are only display labels.' },
          ] as const).map(field => <label className="deployment-field" key={field.key}>{field.label}<input disabled={c.busy} value={c.draftConfig[field.key]} onChange={event => c.setDraftConfig({ ...c.draftConfig, [field.key]: event.target.value.trim() })} placeholder="C… (56-character contract address)"/><small>{field.help}</small></label>)}
          <button className="submit-intent" onClick={c.saveSettings} disabled={c.busy}>Save recovery account <ArrowRight size={18}/></button><p className="dialog-footnote">These settings apply to earlier account recovery only. New actions always use the pinned shared executor.</p>
          </details>
        </> : c.dialog === 'review' && c.prepared ? <>
          <span className="dialog-kicker">THE TERMS YOU ARE ABOUT TO SIGN</span><h2>Read the<br/><em>fine print.</em></h2><p className="dialog-intro">RPC simulation passed. Your signature binds these exact conditions. Future execution can still fail.</p>
          <div className="review-terms">{[
            ['Action', c.prepared.action === 'swap' ? `Swap ${preparedAssets.inputSymbol} → ${preparedAssets.outputSymbol}` : 'Provide liquidity'], ['Wallet / recipient', c.prepared.source], ['Shared executor', c.prepared.executor], ['Router', ROUTE.router], ['Pool / shares', ROUTE.pair], ['XLM contract', ROUTE.token_a], ['Test USDC contract', ROUTE.token_b], [`Maximum ${preparedAssets.inputSymbol}`, c.prepared.terms.amount], ...(c.prepared.action === 'liquidity' ? [['Maximum test USDC', c.prepared.terms.maxB!]] : []), ['Minimum receipt', `${c.prepared.terms.minimum} ${c.prepared.action === 'swap' ? preparedAssets.outputSymbol === 'USDC' ? 'test USDC' : 'XLM' : 'pool shares'}`], ['Maximum network fee', `${Number(c.prepared.fee) / 1e7} test XLM (outside spending limits)`], ['Expires at', new Date(c.prepared.expiresAt * 1000).toLocaleString()], ['Nonce', c.prepared.nonce.toString()], ['Approvals', 'Forbidden'],
          ].map(([label, value]) => <div key={label}><span>{label}</span><code>{value}</code></div>)}</div>
          <button className="plain-link" onClick={async () => { try { await navigator.clipboard.writeText(c.prepared!.xdr); setCopied(true) } catch { c.setMessage('Clipboard unavailable. Use the XDR field below.') } }}><Copy size={14}/>{copied ? 'Transaction XDR copied' : 'Copy unsigned transaction XDR'}</button><details className="xdr-details"><summary>Inspect transaction XDR <ChevronDown size={13}/></summary><textarea readOnly aria-label="Unsigned transaction XDR" value={c.prepared.xdr}/></details>{c.message && <p className="inline-feedback">{c.message}</p>}
          <button className="submit-intent" onClick={c.sign}><Wallet size={16}/> Sign & submit to testnet <ArrowRight size={18}/></button>
        </> : c.dialog === 'receipts' ? <>
          <span className="dialog-kicker">EVIDENCE / THIS SESSION</span><h2>A record of<br/><em>what happened.</em></h2><p className="dialog-intro">Submitted testnet transactions and their ledger status. Session history clears when this page reloads.</p>
          {c.entries.length === 0 ? <div className="empty-receipts"><span>[ — ]</span><h3>No receipts yet.</h3><p>Write your terms and submit a transaction. Its result will appear here.</p><button className="plain-link" onClick={() => { c.closeDialog(); document.getElementById('intent')?.scrollIntoView({ behavior: 'smooth' }) }}>Start with a swap <ArrowRight size={15}/></button></div> : <div className="receipt-list">{c.entries.map(entry => <article className="receipt-record" key={entry.id}><div><span className="receipt-environment">{entry.mode}</span><time>{entry.time}</time></div><h3>{entry.title}<span className={`receipt-status receipt-${entry.status}`}>{entry.status === 'confirmed' ? <Check size={13}/> : null}{entry.status}</span></h3><p>{entry.detail}</p><a href={`https://stellar.expert/explorer/testnet/tx/${entry.hash}`} target="_blank" rel="noreferrer">{short(entry.hash)} <ExternalLink size={12}/></a></article>)}</div>}
        </> : <>
          <span className="dialog-kicker">THE SECURITY MODEL</span><h2>Permission.<br/><em>With a postcondition.</em></h2><p className="dialog-intro">Caveat is a shared executor for two constrained Soroswap actions. Your wallet authorizes the exact policy and funding transfers. The guard checks actual receipts and settles back to that wallet.</p>
          <div className="model-detail-list">{mechanisms.map(item => <div key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.copy}</p></div></div>)}</div>
          <div className="trust-boundary"><h3>The trust boundary</h3><p>Requires honest pinned tokens and pool-share balances, Soroban execution, and an uncompromised wallet. Applies only to actions routed through this executor. A separate app can integrate it using the SDK.</p><p>Transactions elsewhere in Freighter, later pool losses, issuer clawbacks, weak signed terms and network fees are outside these checks. The executor has no administrator, upgrade function or arbitrary-call interface. Testnet only; independent review is still required.</p></div>
          <a className="plain-link" href="https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction" target="_blank" rel="noreferrer">Read Stellar’s authorization model <ExternalLink size={13}/></a>
        </>}
      </Dialog>}
    </div>
  )
}
function ArrowDownIcon() { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 2v10m-4-4 4 4 4-4" stroke="currentColor" strokeWidth="1.3"/></svg> }
export default App
