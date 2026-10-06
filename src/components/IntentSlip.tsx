import { ArrowDown, ArrowDownUp, ArrowRight, ArrowUpRight, ChevronDown, Clock3, LoaderCircle, LockKeyhole, RotateCw, Settings2 } from 'lucide-react'
import type { CaveatState } from '../hooks/useCaveat'
import xlmLogo from '../assets/tokens/xlm.svg'
import usdcLogo from '../assets/tokens/usdc.svg'
import { ROUTE } from '@caveat/sdk/deployment'

const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-5)}`
export function IntentSlip({ caveat }: { caveat: CaveatState }) {
  const c = caveat
  const inputIsXlm = c.assets.inputSymbol === 'XLM'
  const outputIsUsdc = c.assets.outputSymbol === 'USDC'
  const liquidity = c.action === 'liquidity'
  return (
    <div className="intent-wrap" id="intent">
      <div className="slip-margin"><span>01 / WRITE YOUR CONDITIONS</span><span>↓</span></div>
      <section className="intent-slip" aria-label="Define your protected action">
        <div className="slip-topline">
          <span className="slip-network"><span/> STELLAR TESTNET</span>
          <button className="icon-button" onClick={c.openSettings} aria-label="Deployment settings" disabled={c.busy}><Settings2 size={18}/></button>
        </div>
        <div className="action-selector" role="group" aria-label="Protected action"><button aria-pressed={!liquidity} onClick={() => c.changeAction('swap')} disabled={c.busy}>Swap</button><button aria-pressed={liquidity} onClick={() => c.changeAction('liquidity')} disabled={c.busy}>Provide liquidity</button></div>
        <div className="slip-heading"><h2>{liquidity ? 'A pool deposit, with limits.' : 'A swap, on your terms.'}</h2><span className="slip-number">{liquidity ? 'CVT—02' : 'CVT—01'}</span></div>
        <div className="slip-field">
          <label htmlFor="amount"><span className="term-number">01</span> SPEND NO MORE THAN</label>
          <div className="amount-line">
            <input id="amount" aria-label="Maximum spending amount" value={c.amount} onChange={event => c.changeAmount(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" disabled={c.busy}/>
            <button className="asset-selector" onClick={c.openSettings} aria-label="View spend token address" disabled={c.busy}>
              <span className="asset-symbol token-logo"><img src={inputIsXlm ? xlmLogo : usdcLogo} alt={inputIsXlm ? 'Stellar logo' : 'USDC logo'}/></span>{c.assets.inputSymbol}<ChevronDown size={13}/>
            </button>
          </div>
          <div className="field-caption"><span title={c.assets.tokenIn}>Test {c.assets.inputSymbol} · {short(c.assets.tokenIn)}</span><span>Maximum spend</span></div>
        </div>
        {liquidity && <div className="liquidity-matching"><div><span className="asset-symbol token-logo"><img src={usdcLogo} alt="USDC logo"/></span><span>Matched test USDC</span><strong>{c.quote.maxB || '—'}</strong></div><p>The live pool ratio sets your second spending limit. Both amounts leave your wallet only inside this transaction.</p><small title={ROUTE.token_b}>{short(ROUTE.token_b)} · signed maximum</small></div>}
        <div className="transfer-knot">{liquidity ? <ArrowDown size={17} aria-hidden="true"/> : <button className="reverse-swap" onClick={c.reverseSwap} disabled={c.busy || Boolean(c.pending)} aria-label="Reverse swap direction" title={`Swap ${c.assets.outputSymbol} for ${c.assets.inputSymbol}`}><ArrowDownUp size={17}/></button>}</div>
        <div className="slip-field receive-field">
          <label htmlFor="minimum"><span className="term-number">02</span> AND RECEIVE AT LEAST</label>
          <div className="amount-line">
            <input id="minimum" aria-label="Minimum receipt amount" value={c.minimum} onChange={event => c.changeMinimum(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" disabled={c.busy}/>
            <button className="asset-selector" onClick={c.openSettings} aria-label="View receipt token address" disabled={c.busy}>
              <span className={`asset-symbol ${liquidity ? 'share-logos' : 'token-logo'}`}>{liquidity ? <><img src={xlmLogo} alt="Pool XLM"/><img src={usdcLogo} alt="Pool USDC"/></> : <img src={outputIsUsdc ? usdcLogo : xlmLogo} alt={outputIsUsdc ? 'USDC logo' : 'Stellar logo'}/>}</span>{liquidity ? 'SHARES' : c.assets.outputSymbol}<ChevronDown size={13}/>
            </button>
          </div>
          <div className="field-caption"><span title={liquidity ? ROUTE.pair : c.assets.tokenOut}>{liquidity ? 'Pool shares' : `Test ${c.assets.outputSymbol}`} · {short(liquidity ? ROUTE.pair : c.assets.tokenOut)}</span><span>{c.customMinimum ? 'Your custom minimum' : 'Auto minimum · 1% tolerance'}</span></div>
        </div>
        <div className="small-terms">
          <label className="expiry-term"><span><span className="term-number">03</span> VALID FOR</span><span className="expiry-value"><Clock3 size={13}/><select aria-label="Intent expiration" value={c.minutes} disabled={c.busy} onChange={event => c.changeMinutes(Number(event.target.value))}><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={30}>30 minutes</option></select></span></label>
          <div className="approval-term"><span><span className="term-number">04</span> APPROVALS</span><strong><LockKeyhole size={13}/> None allowed</strong></div>
        </div>
        <div className="protocol-line"><div><span className="protocol-symbol">↗</span> Routed through <strong>Soroswap</strong></div><button onClick={() => c.setDialog('model')} aria-label="View route details"><ArrowUpRight size={15}/></button></div>
        <div className={`live-quote ${c.quote.status === 'error' ? 'quote-error' : ''}`} aria-live="polite">
          <div className="quote-line">{c.quote.status === 'loading' ? <span><LoaderCircle size={11} className="loading-icon"/> Updating live quote…</span> : c.quote.status === 'ready' ? <span>Expected receipt: {c.quote.expected} {liquidity ? 'pool shares' : c.assets.outputSymbol}</span> : c.quote.status === 'error' ? <span>Live quote unavailable</span> : <span>Enter an amount to see the live quote.</span>}
            <button onClick={c.refreshQuote} disabled={c.busy || c.quote.status === 'loading' || c.quote.status === 'idle'} aria-label={c.quote.status === 'error' ? 'Retry live quote' : 'Refresh live quote'}><RotateCw size={12}/></button>
          </div>
          {c.quote.error && <span className="quote-error-detail">{c.quote.error}</span>}
          {c.customMinimum && <button className="auto-minimum" onClick={c.useAutomaticMinimum} disabled={c.busy}>Use automatic minimum · 1% tolerance</button>}
        </div>
        <button className="submit-intent" onClick={c.pending ? c.checkPending : c.run} disabled={c.busy || Boolean(!c.pending && c.wallet && c.quote.status !== 'ready')}>{c.busy ? <><LoaderCircle size={17} className="loading-icon"/> {c.pending ? 'Checking confirmation' : 'Preparing your intent'}</> : c.pending ? 'Check submitted action' : c.wallet && c.quote.status === 'loading' ? <><LoaderCircle size={17} className="loading-icon"/> Updating quote</> : c.wallet ? 'Prepare & review intent' : 'Connect testnet wallet'}<ArrowRight size={19}/></button>
        <p className="execution-disclosure"><span className="live-dot"/>Testnet · wallet → guard → wallet · no deposit</p>
        {c.pending && <div className="inline-feedback" role="status"><p>An action is awaiting confirmation. Check it before preparing another.</p><a href={`https://stellar.expert/explorer/testnet/tx/${c.pending.hash}`} target="_blank" rel="noreferrer">Inspect submitted transaction <ArrowUpRight size={13}/></a></div>}
        {c.message && !c.dialog && <div className="inline-feedback" role="status">{c.message}</div>}
        {c.lastResult && <div className={`inline-feedback receipt-${c.lastResult.status}`} role="status"><strong>Testnet · {c.lastResult.status}</strong><p>{c.lastResult.detail}</p><a href={`https://stellar.expert/explorer/testnet/tx/${c.lastResult.hash}`} target="_blank" rel="noreferrer">Inspect transaction <ArrowUpRight size={13}/></a></div>}
      </section>
      <div className="slip-bottom"><span className="corner-tick">↳</span><p>Your funds return to your wallet in the same transaction.</p><button onClick={c.openSettings} aria-label="Wallet setup"><ArrowUpRight size={14}/></button></div>
    </div>
  )
}
