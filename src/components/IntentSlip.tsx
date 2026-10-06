import { ArrowDown, ArrowRight, ArrowUpRight, ChevronDown, Clock3, LoaderCircle, LockKeyhole, Settings2 } from 'lucide-react'
import type { CaveatState } from '../hooks/useCaveat'
import { TESTNET_USDC_ADDRESS, TESTNET_XLM_ADDRESS } from '../lib/tokens'
import xlmLogo from '../assets/tokens/xlm.svg'
import usdcLogo from '../assets/tokens/usdc.svg'

const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-5)}`
export function IntentSlip({ caveat }: { caveat: CaveatState }) {
  const c = caveat
  const inputIsXlm = c.config.input === TESTNET_XLM_ADDRESS
  const outputIsUsdc = c.config.output === TESTNET_USDC_ADDRESS
  return (
    <div className="intent-wrap" id="intent">
      <div className="slip-margin"><span>01 / WRITE YOUR CONDITIONS</span><span>↓</span></div>
      <section className="intent-slip" aria-label="Define your swap intent">
        <div className="slip-topline">
          <span className="slip-network"><span/> STELLAR TESTNET</span>
          <button className="icon-button" onClick={c.openSettings} aria-label="Deployment settings" disabled={c.busy}><Settings2 size={18}/></button>
        </div>
        <div className="slip-heading"><h2>A swap, on your terms.</h2><span className="slip-number">CVT—01</span></div>
        <div className="slip-field">
          <label htmlFor="amount"><span className="term-number">01</span> SPEND NO MORE THAN</label>
          <div className="amount-line">
            <input id="amount" aria-label="Maximum spending amount" value={c.amount} onChange={event => c.changeAmount(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" disabled={c.busy}/>
            <button className="asset-selector" onClick={c.openSettings} aria-label="Configure input token address" disabled={c.busy}>
              <span className={`asset-symbol ${inputIsXlm ? 'token-logo' : 'generic-symbol'}`}>{inputIsXlm ? <img src={xlmLogo} alt="Stellar logo"/> : 'I'}</span>{inputIsXlm ? 'XLM' : 'INPUT'}<ChevronDown size={13}/>
            </button>
          </div>
          <div className="field-caption"><span title={c.config.input}>{c.config.input ? `${inputIsXlm ? 'Test XLM · ' : ''}${short(c.config.input)}` : 'Set the exact input token'}</span><span>Maximum spend</span></div>
        </div>
        <div className="transfer-knot"><ArrowDown size={17}/></div>
        <div className="slip-field receive-field">
          <label htmlFor="minimum"><span className="term-number">02</span> AND RECEIVE AT LEAST</label>
          <div className="amount-line">
            <input id="minimum" aria-label="Minimum receipt amount" value={c.minimum} onChange={event => c.changeMinimum(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" disabled={c.busy}/>
            <button className="asset-selector" onClick={c.openSettings} aria-label="Configure output token address" disabled={c.busy}>
              <span className={`asset-symbol ${outputIsUsdc ? 'token-logo' : 'generic-symbol'}`}>{outputIsUsdc ? <img src={usdcLogo} alt="USDC logo"/> : 'O'}</span>{outputIsUsdc ? 'USDC' : 'OUTPUT'}<ChevronDown size={13}/>
            </button>
          </div>
          <div className="field-caption"><span title={c.config.output}>{c.config.output ? `${outputIsUsdc ? 'Test USDC · ' : ''}${short(c.config.output)}` : 'Set the exact output token'}</span><span>Your lower bound</span></div>
        </div>
        <div className="small-terms">
          <label className="expiry-term"><span><span className="term-number">03</span> VALID FOR</span><span className="expiry-value"><Clock3 size={13}/><select aria-label="Intent expiration" value={c.minutes} disabled={c.busy} onChange={event => c.changeMinutes(Number(event.target.value))}><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={30}>30 minutes</option></select></span></label>
          <div className="approval-term"><span><span className="term-number">04</span> APPROVALS</span><strong><LockKeyhole size={13}/> None allowed</strong></div>
        </div>
        <div className="protocol-line"><div><span className="protocol-symbol">↗</span> Routed through <strong>Soroswap</strong></div><button onClick={() => c.setDialog('model')} aria-label="View route details"><ArrowUpRight size={15}/></button></div>
        {c.config.account && <div className="live-quote"><button onClick={c.refreshQuote} disabled={c.busy}>Load live quote & set minimum <ArrowUpRight size={12}/></button>{c.liveQuote && <span>Quoted output: {c.liveQuote} · 1% tolerance</span>}</div>}
        <button className="submit-intent" onClick={c.run} disabled={c.busy}>{c.busy ? <><LoaderCircle size={17} className="loading-icon"/> Preparing your intent</> : c.wallet ? 'Prepare & review intent' : 'Connect testnet wallet'}<ArrowRight size={19}/></button>
        <p className="execution-disclosure"><span className="live-dot"/>Stellar Testnet · test tokens. Review before signing.</p>
        {c.message && !c.dialog && <div className="inline-feedback" role="status">{c.message}</div>}
        {c.lastResult && <div className={`inline-feedback receipt-${c.lastResult.status}`} role="status"><strong>Testnet · {c.lastResult.status}</strong><p>{c.lastResult.detail}</p><a href={`https://stellar.expert/explorer/testnet/tx/${c.lastResult.hash}`} target="_blank" rel="noreferrer">Inspect transaction <ArrowUpRight size={13}/></a></div>}
      </section>
      <div className="slip-bottom"><span className="corner-tick">↳</span><p>{c.config.account ? 'Your conditions bind the outcome, not the quote.' : 'Create your Caveat account to start.'}</p><button onClick={c.openSettings} aria-label="Configure deployment"><ArrowUpRight size={14}/></button></div>
    </div>
  )
}
