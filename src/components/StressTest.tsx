import { ArrowRight, ArrowUpRight, Check, RotateCcw, X } from 'lucide-react'
import { fromUnits } from '../lib/policy'
import type { Scenario } from '../lib/policy'
import type { CaveatState } from '../hooks/useCaveat'

const scenarios: { id: Scenario; number: string; title: string; note: string }[] = [
  { id: 'honest', number: '01', title: 'An honest swap', note: 'The router delivers what you expected.' },
  { id: 'underpay', number: '02', title: 'A short receipt', note: 'The router promises more than it sends.' },
  { id: 'approval', number: '03', title: 'A hidden approval', note: 'A good swap, with an unwanted allowance.' },
]
export function StressTest({ caveat: c }: { caveat: CaveatState }) {
  const result = c.lastResult?.mode === 'Local demo' ? c.lastResult : null
  const received = result?.outcome ? fromUnits(result.outcome.received) : c.preview
  const passes = result ? result.status === 'confirmed' : null
  return (
    <section className="stress-section" id="stress-test" aria-labelledby="stress-title">
      <div className="stress-inner">
        <div className="stress-intro"><span className="section-index">02 / THE STRESS TEST</span><h2 id="stress-title">Put the<br/>fine print<br/><em>to work.</em></h2><p>Give the router a chance to misbehave.<br/>See what your conditions catch.</p><span className="local-label"><span/> INTERACTIVE LOCAL MODEL</span></div>
        <div className="stress-instrument">
          <div className="scenario-tabs" role="tablist" aria-label="Demo scenario">
            {scenarios.map(item => <button key={item.id} role="tab" id={`scenario-${item.id}`} aria-controls="scenario-panel" aria-selected={c.scenario === item.id} onClick={() => c.changeScenario(item.id)} disabled={c.busy}><span>{item.number}</span>{item.title}<span className="tab-marker"/></button>)}
          </div>
          <div className="scenario-content" role="tabpanel" id="scenario-panel" aria-labelledby={`scenario-${c.scenario}`}>
            <div className="scenario-description"><p>{scenarios.find(item => item.id === c.scenario)?.note}</p><span>ILLUSTRATIVE XLM → USDC</span></div>
            <div className="outcome-comparison">
              <div className="signed-outcome"><span className="diagram-label">YOU REQUIRE</span><strong>{c.minimum || '0'}<small>USDC</small></strong><span className="diagram-foot">Minimum receipt</span></div>
              <div className={`comparison-arrow ${c.scenario !== 'honest' ? 'attack' : ''}`}><span/><ArrowRight size={24}/><span/><span className="flow-dot"/></div>
              <div className="attempted-outcome"><span className="diagram-label">ROUTER {result ? 'RETURNED' : 'WOULD RETURN'}</span><strong>{received}<small>USDC</small></strong><span className="diagram-foot">{c.scenario === 'approval' ? '+ asks for an unlimited allowance' : c.scenario === 'underpay' ? 'Claimed output is ignored' : 'Actual receipt, in the model'}</span></div>
            </div>
            <div className="test-conditions"><span>Spend ≤ {c.amount || '0'} XLM</span><span>Expiry: {c.minutes}m</span><span className={c.scenario === 'approval' ? 'condition-alert' : ''}>Approvals: {c.scenario === 'approval' ? 'requested' : 'none'}</span></div>
            <div className="test-action"><button onClick={c.runDemo} disabled={c.busy}>{result ? <RotateCcw size={14}/> : <ArrowUpRight size={16}/>} {result ? 'Run again' : 'Run this scenario'}</button><span>Uses the terms you set above.</span></div>
            {result ? <div className={`test-verdict ${passes ? 'verdict-pass' : 'verdict-fail'}`} role="status"><div><span className="verdict-symbol">{passes ? <Check size={21}/> : <X size={21}/>}</span><div><span className="verdict-eyebrow">LOCAL MODEL / {passes ? 'CONDITIONS MET' : 'CONDITION VIOLATED'}</span><strong>{passes ? 'The deal holds.' : 'The deal is off.'}</strong></div></div><p className="result-accessible-title">{passes ? 'Local model · Conditions satisfied' : 'Local model · Intent blocked'}</p><p className="verdict-explanation">{result.detail}</p></div> : <div className="verdict-placeholder"><span>↳</span> Execute the local model to inspect its result.</div>}
          </div>
        </div>
      </div>
      <div className="stress-caveat"><span>THE CAVEAT</span><p>This demonstration runs locally. It is not a Soroban simulation or a ledger transaction.</p><span>NO TRANSACTION HASH</span></div>
    </section>
  )
}
