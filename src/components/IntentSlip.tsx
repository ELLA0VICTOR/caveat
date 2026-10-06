import { ArrowDown, ArrowDownUp, ArrowRight, ArrowUpRight, ChevronDown, Clock3, LoaderCircle, LockKeyhole, RotateCw, Settings2 } from 'lucide-react'
import type { CaveatState } from '../hooks/useCaveat'
import xlmLogo from '../assets/tokens/xlm.svg'
import usdcLogo from '../assets/tokens/usdc.svg'
import { TEST_VENUES } from '../lib/venues'
import type { Venue } from '../lib/venues'

const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-5)}`
export function IntentSlip({ caveat }: { caveat: CaveatState }) {
  const c = caveat
  const ROUTE = c.route
  const inputIsXlm = c.assets.inputSymbol === 'XLM'
  const outputIsUsdc = c.assets.outputSymbol === 'USDC'
  const liquidity = c.action === 'liquidity'
  const fixture = c.venue !== 'soroswap' ? TEST_VENUES[c.venue] : null
  return (
    <div className="intent-wrap" id="intent">
      <div className="slip-margin"><span>01 / WRITE YOUR CONDITIONS</span><span>↓</span></div>
      <section className="intent-slip" aria-label="Define your protected action">
        <div className="slip-topline">
          <label className="slip-network"><span/><select aria-label="Stellar network" value={c.network} onChange={event => c.changeNetwork(event.target.value as 'testnet' | 'mainnet')} disabled={c.busy || Boolean(c.pending) || c.transaction?.phase === 'pending'}><option value="testnet">STELLAR TESTNET</option><option value="mainnet">STELLAR MAINNET</option></select><ChevronDown size={12}/></label>
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
          <div className="field-caption"><span title={c.assets.tokenIn}>{c.network === 'testnet' ? 'Test ' : ''}{c.assets.inputSymbol} · {short(c.assets.tokenIn)}</span><span>Maximum spend</span></div>
        </div>
        {liquidity && <div className="liquidity-matching"><div><span className="asset-symbol token-logo"><img src={usdcLogo} alt="USDC logo"/></span><span>Matched {c.usdcLabel}</span><strong>{c.quote.maxB || '—'}</strong></div><p>The live pool ratio sets your second spending limit. Both amounts leave your wallet only inside this transaction.</p><small title={ROUTE.token_b}>{short(ROUTE.token_b)} · signed maximum</small></div>}
        <div className="transfer-knot">{liquidity ? <ArrowDown size={17} aria-hidden="true"/> : <button className="reverse-swap" onClick={c.reverseSwap} disabled={c.busy || Boolean(c.pending) || Boolean(fixture)} aria-label="Reverse swap direction" title={fixture ? 'Test contracts use XLM → test USDC' : `Swap ${c.assets.outputSymbol} for ${c.assets.inputSymbol}`}><ArrowDownUp size={17}/></button>}</div>
        <div className="slip-field receive-field">
          <label htmlFor="minimum"><span className="term-number">02</span> AND RECEIVE AT LEAST</label>
          <div className="amount-line">
            <input id="minimum" aria-label="Minimum receipt amount" value={c.minimum} onChange={event => c.changeMinimum(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" disabled={c.busy}/>
            <button className="asset-selector" onClick={c.openSettings} aria-label="View receipt token address" disabled={c.busy}>
              <span className={`asset-symbol ${liquidity ? 'share-logos' : 'token-logo'}`}>{liquidity ? <><img src={xlmLogo} alt="Pool XLM"/><img src={usdcLogo} alt="Pool USDC"/></> : <img src={outputIsUsdc ? usdcLogo : xlmLogo} alt={outputIsUsdc ? 'USDC logo' : 'Stellar logo'}/>}</span>{liquidity ? 'SHARES' : c.assets.outputSymbol}<ChevronDown size={13}/>
            </button>
          </div>
          <div className="field-caption"><span title={liquidity ? ROUTE.pair : c.assets.tokenOut}>{liquidity ? 'Pool shares' : `${c.network === 'testnet' ? 'Test ' : ''}${c.assets.outputSymbol}`} · {short(liquidity ? ROUTE.pair : c.assets.tokenOut)}</span><span>{c.customMinimum ? 'Your custom minimum' : fixture ? 'Test scenario minimum' : 'Auto minimum · 1% tolerance'}</span></div>
        </div>
        <div className="small-terms">
          <label className="expiry-term"><span><span className="term-number">03</span> VALID FOR</span><span className="expiry-value"><Clock3 size={13}/><select aria-label="Intent expiration" value={c.minutes} disabled={c.busy} onChange={event => c.changeMinutes(Number(event.target.value))}><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={30}>30 minutes</option></select></span></label>
          <div className="approval-term"><span><span className="term-number">04</span> APPROVALS</span><strong><LockKeyhole size={13}/> None allowed</strong></div>
        </div>
        <div className="protocol-line"><div><span className="protocol-symbol">↗</span>{liquidity || c.network === 'mainnet' ? <>Routed through <strong>Soroswap</strong></> : <label className="venue-picker"><span>{fixture ? 'Check' : 'Routed through'}</span><select aria-label="Swap venue" value={c.venue} onChange={event => c.changeVenue(event.target.value as Venue)} disabled={c.busy || Boolean(c.pending)}><option value="soroswap">Soroswap</option><optgroup label="Test contracts · security checks">{Object.entries(TEST_VENUES).map(([id, venue]) => <option key={id} value={id}>{venue.label}</option>)}</optgroup></select><ChevronDown size={12}/></label>}</div>{!fixture && <button onClick={() => c.setDialog('model')} aria-label="View route details"><ArrowUpRight size={15}/></button>}</div>
        {fixture && <div className="venue-explanation"><span>TEST CONTRACT · LIVE RPC CHECK</span><p>{fixture.description}</p><small>Artificial test rates · up to 1 XLM · checked before signing</small><details><summary>Deployed contract addresses</summary><a href={`https://stellar.expert/explorer/testnet/contract/${fixture.venue}`} target="_blank" rel="noreferrer">Test venue <code>{short(fixture.venue)}</code><ArrowUpRight size={12}/></a><a href={`https://stellar.expert/explorer/testnet/contract/${fixture.guard}`} target="_blank" rel="noreferrer">Isolated Caveat guard <code>{short(fixture.guard)}</code><ArrowUpRight size={12}/></a></details></div>}
        <div className={`live-quote ${c.quote.status === 'error' ? 'quote-error' : ''}`} aria-live="polite">
          <div className="quote-line">{c.quote.status === 'loading' ? <span><LoaderCircle size={11} className="loading-icon"/> {fixture ? 'Updating test terms…' : 'Updating live quote…'}</span> : c.quote.status === 'ready' ? <span>{fixture ? 'Test contract claim' : 'Expected receipt'}: {c.quote.expected} {liquidity ? 'pool shares' : c.assets.outputSymbol}</span> : c.quote.status === 'error' ? <span>{fixture ? 'Test terms unavailable' : 'Live quote unavailable'}</span> : <span>{fixture ? 'Enter an amount to set test terms.' : 'Enter an amount to see the live quote.'}</span>}
            <button onClick={c.refreshQuote} disabled={c.busy || c.quote.status === 'loading' || c.quote.status === 'idle'} aria-label={fixture ? 'Refresh test terms' : c.quote.status === 'error' ? 'Retry live quote' : 'Refresh live quote'}><RotateCw size={12}/></button>
          </div>
          {c.quote.error && <span className="quote-error-detail">{c.quote.error}</span>}
          {c.customMinimum && <button className="auto-minimum" onClick={c.useAutomaticMinimum} disabled={c.busy}>{fixture ? 'Use test scenario minimum' : 'Use automatic minimum · 1% tolerance'}</button>}
        </div>
        <button className="submit-intent" onClick={c.pending ? c.openTransaction : c.run} disabled={c.busy || Boolean(!c.pending && c.wallet && c.quote.status !== 'ready')}>{c.busy ? <><LoaderCircle size={17} className="loading-icon"/> {c.pending ? 'Checking confirmation' : fixture ? 'Checking test contract' : 'Preparing your intent'}</> : c.pending ? 'Check submitted action' : c.wallet && c.quote.status === 'loading' ? <><LoaderCircle size={17} className="loading-icon"/> {fixture ? 'Updating test terms' : 'Updating quote'}</> : c.wallet ? fixture ? 'Check test contract' : 'Prepare & review intent' : `Connect ${c.profile.label.toLowerCase()} wallet`}<ArrowRight size={19}/></button>
        <p className="execution-disclosure"><span className="live-dot"/>{fixture ? 'Live Testnet simulation · no signature or network fee' : `${c.profile.label} · wallet → guard → wallet · no deposit`}</p>
        {c.network === 'mainnet' && <p className="mainnet-pilot-note">Mainnet pilot · real funds. Independent security review pending. Start with small amounts.</p>}
        {c.message && !c.dialog && !c.transactionOpen && <div className="inline-feedback" role="status">{c.message}</div>}
      </section>
      <div className="slip-bottom"><span className="corner-tick">↳</span><p>{fixture ? 'A fresh check of the deployed contracts, using your conditions.' : 'Your funds return to your wallet in the same transaction.'}</p><button onClick={c.openSettings} aria-label="Wallet setup"><ArrowUpRight size={14}/></button></div>
    </div>
  )
}
