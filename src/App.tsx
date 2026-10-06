import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Copy, ExternalLink, LoaderCircle, LockKeyhole, Wallet } from 'lucide-react'
import { useCaveat } from './hooks/useCaveat'
import { BoundaryArt } from './components/BoundaryArt'
import { Brand } from './components/Brand'
import { Dialog } from './components/Dialog'
import { IntentSlip } from './components/IntentSlip'
import { TestnetSetup } from './components/TestnetSetup'
import './App.css'

const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-5)}`
const mechanisms = [
  { number: '01', title: 'Set the terms.', copy: 'Your token addresses. Your maximum spend. Your minimum receipt. A deadline and zero allowances. Every condition is part of the signed intent.' },
  { number: '02', title: 'Make the call.', copy: 'The account authorizes one exact transfer to the signed pair. The Soroswap router executes the swap with your contract account as the recipient.' },
  { number: '03', title: 'Read the result.', copy: 'The executor checks actual token balances. A violating outcome aborts the entire invocation. A valid outcome commits and advances the nonce.' },
]

function App() {
  const c = useCaveat()
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
        <div className="header-actions"><span className="network-label"><span/> STELLAR TESTNET</span><button className="connect-button" onClick={c.wallet ? c.disconnect : c.connect} disabled={c.busy}>{c.busy ? <LoaderCircle size={15} className="loading-icon"/> : <Wallet size={15}/>}<span>{c.wallet ? short(c.wallet) : 'Connect wallet'}</span><ArrowUpRight size={14}/></button><button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}><span/><span/></button></div>
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
          <div className="mechanism-heading"><div><span className="section-index">THE MECHANISM</span><h2 id="mechanism-title">Permission is specific.<br/><em>Execution should be, too.</em></h2></div><p>The account checks what happened.<br/>Your conditions decide what stays.</p></div>
          <div className="mechanism-steps">{mechanisms.map(item => <article key={item.number}><div className="mechanism-step-number"><span>{item.number}</span><ArrowUpRight size={19}/></div><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
          <div className="mechanism-footnote"><LockKeyhole size={14}/><p>Checks protect assets held at the Caveat contract address. Failed invocations can still incur network fees.</p><button onClick={() => c.setDialog('model')}>Understand the boundary <ArrowUpRight size={13}/></button></div>
        </section>

        <section className="integration-section" id="integration"><div className="integration-title"><span className="section-index">THE FIRST EXECUTION PATH</span><h2>Soroswap.<br/><em>With a caveat.</em></h2><p>A focused integration with an independently checked outcome. Two exact tokens. One constrained transfer. No allowances.</p><button className="editorial-link" onClick={c.openSettings}>Configure your testnet deployment <ArrowUpRight size={16}/></button></div><div className="integration-contract"><div className="contract-label"><span className="protocol-symbol">↗</span> SOROSWAP ROUTER <span>SEP-41</span></div><code>swap_exact_tokens_for_tokens</code><div className="execution-path"><span>Signed intent</span><ArrowRight size={15}/><span>Soroswap</span><ArrowRight size={15}/><strong>Balance check</strong></div><div className="contract-info"><div><span>Network</span><strong>Stellar Testnet</strong></div><div><span>Token approvals</span><strong>Zero allowances</strong></div><div><span>Deployment</span><button onClick={c.openSettings}>{c.config.account ? 'Configured · verify provenance' : 'Not configured'} <ArrowUpRight size={12}/></button></div></div><a href="https://github.com/soroswap/core/blob/main/contracts/router/src/lib.rs" target="_blank" rel="noreferrer">Inspect the official router source <ExternalLink size={13}/></a></div></section>

        <section className="questions-section"><div><span className="section-index">BEFORE YOU SIGN</span><h2>The important<br/><em>fine print.</em></h2></div><div className="question-list">{[
          ['Does this use real contracts?', 'Yes. Trades use real contracts on Stellar Testnet with test tokens. Your Caveat account must be deployed and funded. Before you sign, the transaction is checked through simulation. Only successful ledger confirmation is shown as completed execution.'],
          ['What does the account actually protect?', 'Assets held at its contract address, using honest allowlisted SEP-41 tokens. It does not protect ordinary wallet funds, compromised keys, dishonest token balance reports, or issuer freezes and clawbacks.'],
          ['Can I still get a bad price?', 'Yes. An outcome that satisfies weak conditions you sign is allowed. You choose the minimum receipt. This product does not judge whether those conditions represent a fair market price.'],
          ['Is Caveat ready for mainnet?', 'This is a testnet hackathon prototype. Both contracts compile to WASM and all 12 Soroban host tests pass. Independent review and ledger verification are still required.'],
        ].map(([question, answer]) => <details key={question}><summary>{question}<span className="question-plus">+</span></summary><p>{answer}</p></details>)}</div></section>
      </main>

      <footer className="site-footer"><div className="footer-upper"><a href="#top" aria-label="Back to top"><Brand large/></a><p>A little more intention<br/>in every transaction.</p><a href="#intent" className="back-to-intent">Write your terms <ArrowUpRight size={20}/></a></div><div className="footer-lower"><span>© {copyrightYear} CAVEAT</span><span>STELLAR / SOROBAN</span><span>FIND YOUR WAY · GENERAL TRACK</span><button onClick={() => c.setDialog('model')}>Architecture & trust assumptions <ArrowUpRight size={12}/></button></div></footer>

      {c.dialog && <Dialog title={c.dialog === 'settings' ? 'Testnet deployment settings' : c.dialog === 'review' ? 'Review signed intent' : c.dialog === 'receipts' ? 'Execution receipts' : 'Security model'} onClose={c.closeDialog} busy={c.busy} wide={c.dialog === 'review'}>
        {c.dialog === 'settings' ? <>
          <span className="dialog-kicker">TESTNET / CONTRACT IDENTITIES</span><h2>Your account.<br/><em>Your conditions.</em></h2><p className="dialog-intro">Create an account with your wallet, or connect an existing deployment. Funds are protected only while held at its contract address.</p>
          <div className="dialog-network"><span/> STELLAR TESTNET <code>soroban-testnet.stellar.org</code></div>
          <TestnetSetup caveat={c}/>
          {c.message && <div className="inline-feedback" role="status">{c.message}</div>}
          <details className="manual-deployment"><summary>Use an existing deployment <ChevronDown size={13}/></summary>
          {([
            { key: 'account', label: 'Caveat account contract', help: 'Your wallet must be the owner of this deployed account.' },
            { key: 'router', label: 'Soroswap router contract', help: 'Published testnet ID. Verify provenance after network resets.' },
            { key: 'input', label: 'Exact input token contract', help: 'Must belong to the account’s immutable token allowlist.' },
            { key: 'output', label: 'Exact output token contract', help: 'Identity is the address. Symbols are only display labels.' },
          ] as const).map(field => <label className="deployment-field" key={field.key}>{field.label}<input disabled={c.busy} value={c.draftConfig[field.key]} onChange={event => c.setDraftConfig({ ...c.draftConfig, [field.key]: event.target.value.trim() })} placeholder="C… (56-character contract address)"/><small>{field.help}</small></label>)}
          <button className="submit-intent" onClick={c.saveSettings} disabled={c.busy}>Save testnet configuration <ArrowRight size={18}/></button><p className="dialog-footnote">Saved in this browser. Preparation verifies the owner, token precision, balances, and route through RPC. Saving alone does not prove deployment provenance.</p>
          </details>
        </> : c.dialog === 'review' && c.prepared ? <>
          <span className="dialog-kicker">THE TERMS YOU ARE ABOUT TO SIGN</span><h2>Read the<br/><em>fine print.</em></h2><p className="dialog-intro">RPC simulation passed. Your signature binds these exact conditions. Future execution can still fail.</p>
          <div className="review-terms">{[
            ['Account', c.config.account], ['Router', c.config.router], ['Pair', c.prepared.pair], ['Input token', c.config.input], ['Output token', c.config.output], ['Maximum spend', c.amount], ['Minimum receipt', c.minimum], ['Expires at', new Date(c.prepared.expiresAt * 1000).toLocaleString()], ['Nonce', c.prepared.nonce.toString()], ['Approvals', 'Forbidden'],
          ].map(([label, value]) => <div key={label}><span>{label}</span><code>{value}</code></div>)}</div>
          <button className="plain-link" onClick={async () => { try { await navigator.clipboard.writeText(c.prepared!.xdr); setCopied(true) } catch { c.setMessage('Clipboard unavailable. Use the XDR field below.') } }}><Copy size={14}/>{copied ? 'Transaction XDR copied' : 'Copy unsigned transaction XDR'}</button><details className="xdr-details"><summary>Inspect transaction XDR <ChevronDown size={13}/></summary><textarea readOnly aria-label="Unsigned transaction XDR" value={c.prepared.xdr}/></details>{c.message && <p className="inline-feedback">{c.message}</p>}
          <button className="submit-intent" onClick={c.sign}><Wallet size={16}/> Sign & submit to testnet <ArrowRight size={18}/></button>
        </> : c.dialog === 'receipts' ? <>
          <span className="dialog-kicker">EVIDENCE / THIS SESSION</span><h2>A record of<br/><em>what happened.</em></h2><p className="dialog-intro">Submitted testnet transactions and their ledger status. Session history clears when this page reloads.</p>
          {c.entries.length === 0 ? <div className="empty-receipts"><span>[ — ]</span><h3>No receipts yet.</h3><p>Write your terms and submit a transaction. Its result will appear here.</p><button className="plain-link" onClick={() => { c.closeDialog(); document.getElementById('intent')?.scrollIntoView({ behavior: 'smooth' }) }}>Start with a swap <ArrowRight size={15}/></button></div> : <div className="receipt-list">{c.entries.map(entry => <article className="receipt-record" key={entry.id}><div><span className="receipt-environment">{entry.mode}</span><time>{entry.time}</time></div><h3>{entry.title}<span className={`receipt-status receipt-${entry.status}`}>{entry.status === 'confirmed' ? <Check size={13}/> : null}{entry.status}</span></h3><p>{entry.detail}</p><a href={`https://stellar.expert/explorer/testnet/tx/${entry.hash}`} target="_blank" rel="noreferrer">{short(entry.hash)} <ExternalLink size={12}/></a></article>)}</div>}
        </> : <>
          <span className="dialog-kicker">THE SECURITY MODEL</span><h2>Permission.<br/><em>With a postcondition.</em></h2><p className="dialog-intro">Caveat is an owner-authorized contract account with one constrained Soroswap execution path. It checks net balance changes for the exact token addresses you sign.</p>
          <div className="model-detail-list">{mechanisms.map(item => <div key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.copy}</p></div></div>)}</div>
          <div className="trust-boundary"><h3>The trust boundary</h3><p>Requires honest allowlisted SEP-41 tokens, Soroban execution, and an uncompromised owner wallet. Protects contract-held funds. Failed invocations can still incur fees.</p><p>Token balance lies, issuer clawbacks, weak signed terms, and other wallet funds are outside this boundary. Both contracts compile to WASM and all 12 Soroban host tests pass. Ledger execution and independent review remain to be verified.</p></div>
          <a className="plain-link" href="https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction" target="_blank" rel="noreferrer">Read Stellar’s authorization model <ExternalLink size={13}/></a>
        </>}
      </Dialog>}
    </div>
  )
}
function ArrowDownIcon() { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 2v10m-4-4 4 4 4-4" stroke="currentColor" strokeWidth="1.3"/></svg> }
export default App
