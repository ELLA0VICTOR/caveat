import { ArrowDown, ArrowRight, ArrowUpRight, ChevronDown, Clock3, LoaderCircle, LockKeyhole, Settings2 } from 'lucide-react'
import type { CaveatState } from '../hooks/useCaveat'

const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-5)}`
function StellarMark() {
  return <svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="8.3" stroke="currentColor" strokeWidth="1.7"/><path d="m3 17 22-10M3 21 22 12" stroke="currentColor" strokeWidth="1.7"/></svg>
}
export function IntentSlip({ caveat }: { caveat: CaveatState }) {
  const c = caveat
  async function submit() {
    const demonstrated = await c.run()
    if (demonstrated) document.getElementById('stress-test')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <div className="intent-wrap" id="intent">
      <div className="slip-margin"><span>01 / WRITE YOUR CONDITIONS</span><span>↓</span></div>
      <section className="intent-slip" aria-label="Define your swap intent">
        <div className="slip-topline">
          <div className="execution-toggle" role="group" aria-label="Execution environment">
            <button className={c.mode === 'demo' ? 'active' : ''} onClick={() => c.changeMode('demo')} disabled={c.busy}>Local demo</button>
            <button className={c.mode === 'live' ? 'active' : ''} onClick={() => c.changeMode('live')} disabled={c.busy}>Testnet</button>
          </div>
          <button className="icon-button" onClick={c.openSettings} aria-label="Deployment settings" disabled={c.busy}><Settings2 size={18}/></button>
        </div>
        <div className="slip-heading"><h2>A swap, on your terms.</h2><span className="slip-number">CVT—01</span></div>
        <div className="slip-field">
          <label htmlFor="amount"><span className="term-number">01</span> SPEND NO MORE THAN</label>
          <div className="amount-line">
            <input id="amount" aria-label="Maximum spending amount" value={c.amount} onChange={event => c.changeAmount(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" disabled={c.busy}/>
            <button className="asset-selector" onClick={c.openSettings} aria-label="Configure input token address" disabled={c.busy}>
              <span className="asset-symbol stellar-symbol">{c.mode === 'demo' ? <StellarMark/> : 'I'}</span>{c.mode === 'demo' ? 'XLM' : 'INPUT'}<ChevronDown size={13}/>
            </button>
          </div>
          <div className="field-caption"><span>{c.mode === 'demo' ? 'Stellar Lumens' : c.config.input ? short(c.config.input) : 'Set the exact input token'}</span><span>Maximum spend</span></div>
        </div>
        <div className="transfer-knot"><ArrowDown size={17}/></div>
        <div className="slip-field receive-field">
          <label htmlFor="minimum"><span className="term-number">02</span> AND RECEIVE AT LEAST</label>
          <div className="amount-line">
            <input id="minimum" aria-label="Minimum receipt amount" value={c.minimum} onChange={event => c.changeMinimum(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" disabled={c.busy}/>
            <button className="asset-selector" onClick={c.openSettings} aria-label="Configure output token address" disabled={c.busy}>
              <span className={`asset-symbol ${c.mode === 'demo' ? 'usdc-symbol' : 'generic-symbol'}`}>{c.mode === 'demo' ? '$' : 'O'}</span>{c.mode === 'demo' ? 'USDC' : 'OUTPUT'}<ChevronDown size={13}/>
            </button>
          </div>
          <div className="field-caption"><span>{c.mode === 'demo' ? 'USD Coin · illustrative token' : c.config.output ? short(c.config.output) : 'Set the exact output token'}</span><span>Your lower bound</span></div>
        </div>
        <div className="small-terms">
          <label className="expiry-term"><span><span className="term-number">03</span> VALID FOR</span><span className="expiry-value"><Clock3 size={13}/><select aria-label="Intent expiration" value={c.minutes} disabled={c.busy} onChange={event => c.changeMinutes(Number(event.target.value))}><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={30}>30 minutes</option></select></span></label>
          <div className="approval-term"><span><span className="term-number">04</span> APPROVALS</span><strong><LockKeyhole size={13}/> None allowed</strong></div>
        </div>
        <div className="protocol-line"><div><span className="protocol-symbol">↗</span> Routed through <strong>Soroswap</strong></div><button onClick={() => c.setDialog('model')} aria-label="View route details"><ArrowUpRight size={15}/></button></div>
        <button className="submit-intent" onClick={submit} disabled={c.busy}>{c.busy ? <><LoaderCircle size={17} className="loading-icon"/> Preparing your intent</> : c.mode === 'demo' ? 'Test my intent' : c.wallet ? 'Prepare & review intent' : 'Connect testnet wallet'}<ArrowRight size={19}/></button>
        <p className="execution-disclosure"><span className={c.mode === 'demo' ? 'demo-dot' : 'live-dot'}/>{c.mode === 'demo' ? 'Local model. No funds. No wallet signature.' : 'Signed testnet execution. Review before submitting.'}</p>
        {c.message && !c.dialog && <div className="inline-feedback" role="status">{c.message}</div>}
        {c.lastResult?.mode === 'Testnet' && <div className={`inline-feedback receipt-${c.lastResult.status}`} role="status"><strong>Testnet · {c.lastResult.status}</strong><p>{c.lastResult.detail}</p>{c.lastResult.hash && <a href={`https://stellar.expert/explorer/testnet/tx/${c.lastResult.hash}`} target="_blank" rel="noreferrer">Inspect transaction <ArrowUpRight size={13}/></a>}</div>}
      </section>
      <div className="slip-bottom"><span className="corner-tick">↳</span><p>{c.mode === 'demo' ? 'Your conditions bind the outcome, not the quote.' : c.config.account ? 'Deployment configured. Verify before funding.' : 'A deployed Caveat account is required.'}</p><button onClick={c.mode === 'demo' ? () => c.setDialog('model') : c.openSettings} aria-label={c.mode === 'demo' ? 'Read the security model' : 'Configure deployment'}><ArrowUpRight size={14}/></button></div>
    </div>
  )
}
