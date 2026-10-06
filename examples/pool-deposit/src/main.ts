import { CaveatClient, ROUTE, USDC_ISSUER } from '@caveat/sdk'
import type { PreparedAction, TransactionPreparation } from '@caveat/sdk'
import { getNetworkDetails, requestAccess, signTransaction } from '@stellar/freighter-api'
import './style.css'

// This separate app imports no Caveat React component or internal hook.
const client = new CaveatClient()
let owner = ''
let quoteRevision = 0
let timer: ReturnType<typeof setTimeout> | undefined
let prepared: PreparedAction | null = null
let setup: TransactionPreparation | null = null
let pending: string | null = localStorage.getItem('pool-example-pending')
let busy = false
const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `<header><a class="identity" href="./">POOL / 01</a><span>STELLAR TESTNET</span><button id="connect">Connect Freighter</button></header>
<main><div class="intro"><p class="eyebrow">A SEPARATE APP · POWERED BY THE CAVEAT SDK</p><h1>Two tokens in.<br>Pool shares out.</h1><p class="lead">Provide liquidity to the XLM / test USDC pool on Soroswap. Your wallet signs a spending limit for each token and a minimum share receipt.</p><p class="annotation">This is a first-party integration example, showing how another app can call the shared guard. It is a live Testnet flow.</p></div>
<section class="deposit"><div class="pool-title"><span>XLM / USDC</span><span class="tag">SOROSWAP</span></div><label for="amount">Maximum XLM contribution</label><div class="input-row"><input id="amount" value="1" inputmode="decimal" autocomplete="off"><span>XLM</span></div><div class="matched"><span>Maximum matched test USDC</span><strong id="matched">—</strong></div><label for="minimum">Minimum pool shares to your wallet</label><div class="input-row"><input id="minimum" inputmode="decimal" autocomplete="off" placeholder="Waiting for live quote"><span>SHARES</span></div><p class="estimate" id="estimate">Loading the pool…</p><button id="review" class="primary" disabled>Review pool deposit <span>↗</span></button><p class="footnote">No Caveat deposit. No allowances. Network fees apply.</p></section>
<section id="review-panel" class="review" hidden><h2>Before you sign</h2><div id="terms"></div><button id="sign" class="primary">Sign in Freighter <span>↗</span></button><button id="cancel" class="text-button">Cancel review</button></section>
<p id="status" role="status" aria-live="polite"></p><div id="receipt"></div><button id="check" class="text-button" hidden>Check submitted transaction</button>
<details class="integration"><summary>What the integration does</summary><p>This app uses <code>@caveat/sdk</code> to quote, prepare and submit a protected liquidity action. The SDK checks the executor and Soroswap bytecode pins. Freighter signs the real transaction.</p><p>Protection applies only to this guarded action. Pool losses after the deposit, compromised keys and weak signed terms are outside its checks.</p><pre>client.quote('liquidity', amount)
client.prepare(wallet, 'liquidity', terms)
client.submitSigned(prepared, signedXdr)</pre><p>Pool contract</p><code class="address">${ROUTE.pair}</code></details></main><footer>INTEGRATION EXAMPLE / TEST TOKENS ONLY</footer>`
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const amount = element<HTMLInputElement>('amount')
const minimum = element<HTMLInputElement>('minimum')
const review = element<HTMLButtonElement>('review')
const status = (message: string) => { element('status').textContent = message }
let maxB = ''
let minimumOverride: { amount: string; value: string } | null = null
function lock(value: boolean) { busy = value; for (const id of ['amount', 'minimum', 'connect', 'review', 'sign', 'cancel']) element<HTMLInputElement>(id).disabled = value; if (!value) review.disabled = !maxB || Boolean(pending) }
function invalidate() { prepared = null; setup = null; element('review-panel').hidden = true }
function term(label: string, value: string) {
  const row = document.createElement('div'); const title = document.createElement('span'); const code = document.createElement('code')
  title.textContent = label; code.textContent = value; row.append(title, code); element('terms').append(row)
}
async function updateQuote() {
  invalidate(); const revision = ++quoteRevision; const quotedAmount = amount.value; maxB = ''; review.disabled = true
  if (minimumOverride?.amount !== quotedAmount) minimum.value = ''
  element('matched').textContent = '—'; element('estimate').textContent = 'Updating live pool quote…'
  try {
    const quote = await client.quote('liquidity', quotedAmount)
    if (revision !== quoteRevision) return
    maxB = quote.maxB!; minimum.value = minimumOverride?.amount === quotedAmount ? minimumOverride.value : quote.minimum
    element('matched').textContent = maxB; element('estimate').textContent = `Estimated shares: ${quote.expected} · minimum uses 1% tolerance`
    review.disabled = busy || Boolean(pending)
  } catch (error) { if (revision === quoteRevision) element('estimate').textContent = error instanceof Error ? error.message : 'Quote unavailable.' }
}
amount.addEventListener('input', () => { ++quoteRevision; minimumOverride = null; maxB = ''; minimum.value = ''; review.disabled = true; invalidate(); clearTimeout(timer); timer = setTimeout(updateQuote, 400) })
minimum.addEventListener('input', () => { minimumOverride = { amount: amount.value, value: minimum.value }; invalidate() })
element('connect').onclick = async () => {
  lock(true)
  try {
    const wallet = await requestAccess(); const network = await getNetworkDetails()
    if (wallet.error || !wallet.address) throw new Error('Unlock Freighter and grant access to this app.')
    if (network.error || network.networkPassphrase !== 'Test SDF Network ; September 2015') throw new Error('Switch Freighter to Stellar Testnet.')
    owner = wallet.address; element('connect').textContent = `${owner.slice(0, 7)}…${owner.slice(-5)}`; status('Testnet wallet connected.')
  } catch (error) { status(error instanceof Error ? error.message : 'Connection failed.') }
  finally { lock(false) }
}
review.onclick = async () => {
  if (!owner) { status('Connect Freighter first.'); return }
  lock(true); status('Checking the real pool and simulating your deposit…')
  try {
    const wallet = await client.wallet(owner); element('terms').replaceChildren()
    if (!wallet.trustline) {
      setup = await client.prepareTrustline(owner); term('One-time wallet setup', 'Enable exact test USDC asset'); term('Issuer', USDC_ISSUER)
    } else {
      prepared = await client.prepare(owner, 'liquidity', { amount: amount.value, maxB, minimum: minimum.value, minutes: 10 })
      term('Maximum XLM', prepared.terms.amount); term('Maximum test USDC', prepared.terms.maxB!); term('Minimum shares', prepared.terms.minimum)
      term('Nonce', String(prepared.nonce)); term('Expires', new Date(prepared.expiresAt * 1000).toLocaleString()); term('Executor', prepared.executor)
      term('XLM contract', ROUTE.token_a); term('Test USDC contract', ROUTE.token_b); term('Share token', ROUTE.pair); term('Router', ROUTE.router); term('Approvals', 'Forbidden')
    }
    const transaction = prepared ?? setup!
    term('Wallet / recipient', transaction.source); term('Maximum network fee', `${Number(transaction.fee) / 1e7} XLM`)
    element('review-panel').hidden = false; status('Review these conditions before signing.'); element('review-panel').scrollIntoView({ behavior: 'smooth' })
  } catch (error) { status(error instanceof Error ? error.message : 'Preparation failed.') }
  finally { lock(false) }
}
element('cancel').onclick = invalidate
async function showReceipt(hash: string, result: Awaited<ReturnType<CaveatClient['status']>>) {
  if (result.status !== 'pending') { pending = null; localStorage.removeItem('pool-example-pending') }
  const container = element('receipt'); container.replaceChildren(); const link = document.createElement('a')
  link.href = `https://stellar.expert/explorer/testnet/tx/${hash}`; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = `Inspect ${result.status} transaction ↗`; container.append(link)
  status(result.status === 'confirmed' ? result.outcome ? `Confirmed. Your wallet received ${Number(result.outcome.received) / 1e7} pool shares.` : 'USDC setup confirmed. Review your pool deposit next.' : result.status === 'failed' ? 'Ledger failure: contract changes rolled back. Fees may apply.' : 'Submitted; awaiting confirmation. Check this transaction before proceeding.')
  element('check').hidden = !pending; invalidate(); lock(false)
}
element('sign').onclick = async () => {
  const transaction = prepared ?? setup
  if (!transaction) return
  lock(true)
  try {
    const network = await getNetworkDetails()
    if (network.networkPassphrase !== 'Test SDF Network ; September 2015') throw new Error('Freighter must be on Testnet.')
    const signed = await signTransaction(transaction.xdr, { address: owner, networkPassphrase: network.networkPassphrase })
    if (signed.error || !signed.signedTxXdr) throw new Error('Wallet signature declined.')
    const result = await client.submitSigned(transaction, signed.signedTxXdr, hash => { pending = hash; localStorage.setItem('pool-example-pending', hash); status('Submitted. Waiting for ledger confirmation…'); element('check').hidden = false })
    await showReceipt(result.hash, result)
  } catch (error) { status(error instanceof Error ? error.message : 'Submission failed.') }
  finally { lock(false) }
}
element('check').onclick = async () => { if (pending) { lock(true); try { await showReceipt(pending, await client.status(pending)) } catch (error) { status(String(error)) } finally { lock(false) } } }
if (pending) { element('check').hidden = false; status('An earlier submission needs confirmation. Check it before another deposit.') }
void updateQuote()
