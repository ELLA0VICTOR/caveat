import { CaveatClient, ROUTE, USDC_ISSUER, fromUnits } from '@caveat/sdk'
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
let confirmationTimer: ReturnType<typeof setTimeout> | undefined
let noticeKind = localStorage.getItem('pool-example-pending-kind') === 'trustline' ? 'trustline' : 'liquidity'
let noticeHash = pending
const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `<header><a class="identity" href="./">POOL / 01</a><span>STELLAR TESTNET</span><button id="connect">Connect Freighter</button></header>
<main><div class="intro"><p class="eyebrow">A SEPARATE APP · POWERED BY THE CAVEAT SDK</p><h1>Two tokens in.<br>Pool shares out.</h1><p class="lead">Provide liquidity to the XLM / test USDC pool on Soroswap. Your wallet signs a spending limit for each token and a minimum share receipt.</p><p class="annotation">This is a first-party integration example, showing how another app can call the shared guard. It is a live Testnet flow.</p></div>
<section class="deposit"><div class="pool-title"><span>XLM / USDC</span><span class="tag">SOROSWAP</span></div><label for="amount">Maximum XLM contribution</label><div class="input-row"><input id="amount" value="1" inputmode="decimal" autocomplete="off"><span>XLM</span></div><div class="matched"><span>Maximum matched test USDC</span><strong id="matched">—</strong></div><label for="minimum">Minimum pool shares to your wallet</label><div class="input-row"><input id="minimum" inputmode="decimal" autocomplete="off" placeholder="Waiting for live quote"><span>SHARES</span></div><p class="estimate" id="estimate">Loading the pool…</p><button id="review" class="primary" disabled>Review pool deposit <span>↗</span></button><p class="footnote">No Caveat deposit. No allowances. Network fees apply.</p></section>
<section id="review-panel" class="review" hidden><h2>Before you sign</h2><div id="terms"></div><button id="sign" class="primary">Sign in Freighter <span>↗</span></button><button id="cancel" class="text-button">Cancel review</button></section>
<p id="status" role="status" aria-live="polite"></p><button id="check" class="text-button" hidden>View submitted transaction</button>
<details class="integration"><summary>What the integration does</summary><p>This app uses <code>@caveat/sdk</code> to quote, prepare and submit a protected liquidity action. The SDK checks the executor and Soroswap bytecode pins. Freighter signs the real transaction.</p><p>Protection applies only to this guarded action. Pool losses after the deposit, compromised keys and weak signed terms are outside its checks.</p><pre>client.quote('liquidity', amount)
client.prepare(wallet, 'liquidity', terms)
client.submitSigned(prepared, signedXdr)</pre><p>Pool contract</p><code class="address">${ROUTE.pair}</code></details></main><footer>INTEGRATION EXAMPLE / TEST TOKENS ONLY</footer>
<dialog id="transaction-dialog" aria-labelledby="transaction-heading"><button id="transaction-close" aria-label="Close transaction status">×</button><p class="transaction-network">STELLAR TESTNET / TRANSACTION</p><div id="transaction-icon" aria-hidden="true">↗</div><div role="status" aria-live="polite" aria-atomic="true"><p id="transaction-action"></p><h2 id="transaction-heading"></h2><p id="transaction-detail"></p></div><details id="transaction-error" hidden><summary>View error details</summary><p id="transaction-issue"></p></details><a id="transaction-explorer" target="_blank" rel="noreferrer" hidden>View on Stellar Expert ↗</a><button id="transaction-check" class="primary" hidden>Check confirmation</button><button id="transaction-done" class="primary" hidden>Done</button></dialog>`
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const amount = element<HTMLInputElement>('amount')
const minimum = element<HTMLInputElement>('minimum')
const review = element<HTMLButtonElement>('review')
const status = (message: string) => { element('status').textContent = message }
const transactionDialog = element<HTMLDialogElement>('transaction-dialog')
function showTransaction(phase: 'wallet' | 'submitting' | 'pending' | 'confirmed' | 'failed' | 'error', detail: string, hash = noticeHash, issue = '', reveal = true) {
  noticeHash = hash
  element('transaction-action').textContent = noticeKind === 'trustline' ? 'Enable test USDC' : 'Protected Soroswap liquidity'
  element('transaction-heading').textContent = { wallet: 'Confirm in Freighter', submitting: 'Submitting transaction', pending: 'Awaiting confirmation', confirmed: noticeKind === 'trustline' ? 'Test USDC enabled' : 'Liquidity added', failed: 'Transaction failed', error: 'Transaction interrupted' }[phase]
  element('transaction-detail').textContent = detail
  element('transaction-icon').textContent = phase === 'confirmed' ? '✓' : phase === 'failed' || phase === 'error' ? '×' : '↗'
  element('transaction-icon').classList.toggle('waiting', phase === 'pending' || phase === 'submitting')
  transactionDialog.dataset.phase = phase
  element('transaction-error').hidden = !issue; element('transaction-issue').textContent = issue
  const explorer = element<HTMLAnchorElement>('transaction-explorer')
  explorer.hidden = !hash
  if (hash) explorer.href = `https://stellar.expert/explorer/testnet/tx/${hash}`
  element('transaction-check').hidden = phase !== 'pending'
  element('transaction-done').hidden = !['confirmed', 'failed', 'error'].includes(phase)
  element<HTMLButtonElement>('transaction-check').disabled = busy
  element<HTMLButtonElement>('transaction-close').disabled = busy && phase !== 'pending'
  element<HTMLButtonElement>('transaction-done').disabled = busy
  status('')
  if (reveal && !transactionDialog.open) transactionDialog.showModal()
}
function transactionError(error: unknown) {
  const issue = error instanceof Error ? error.message : 'Unable to complete this request.'
  showTransaction(pending ? 'pending' : 'error', pending ? 'Confirmation is temporarily unavailable. Check the submitted transaction before another action.' : 'This request could not be completed. Review the details below.', noticeHash, issue)
}
function closeTransaction() { if (!busy || pending) transactionDialog.close() }
element('transaction-close').onclick = closeTransaction
element('transaction-done').onclick = closeTransaction
transactionDialog.addEventListener('cancel', event => { if (busy && !pending) event.preventDefault() })
let maxB = ''
let minimumOverride: { amount: string; value: string } | null = null
function lock(value: boolean) { busy = value; for (const id of ['amount', 'minimum', 'connect', 'review', 'sign', 'cancel', 'transaction-close', 'transaction-check', 'transaction-done']) element<HTMLInputElement>(id).disabled = value; element<HTMLButtonElement>('transaction-close').disabled = value && !pending; if (!value) review.disabled = !maxB || Boolean(pending) }
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
  clearTimeout(confirmationTimer)
  if (result.status !== 'pending') {
    pending = null
    try { localStorage.removeItem('pool-example-pending'); localStorage.removeItem('pool-example-pending-kind') } catch { /* The observed ledger result remains available in this session. */ }
  }
  if (result.status === 'confirmed') noticeKind = result.outcome ? 'liquidity' : 'trustline'
  showTransaction(result.status, result.status === 'confirmed' ? result.outcome ? `Your wallet received ${fromUnits(result.outcome.received)} pool shares. Contributed ${fromUnits(result.outcome.spent_a)} XLM and ${fromUnits(result.outcome.spent_b)} test USDC.` : 'Your wallet can now receive the exact test USDC asset.' : result.status === 'failed' ? 'Ledger failure: contract changes rolled back. Network fees may apply.' : 'Submitted to Stellar Testnet. Waiting for ledger confirmation.', hash, '', transactionDialog.open || result.status !== 'pending')
  element('check').hidden = !pending; invalidate(); lock(false)
  if (pending) confirmationTimer = setTimeout(() => { void checkTransaction() }, 5000)
}
element('sign').onclick = async () => {
  const transaction = prepared ?? setup
  if (!transaction) return
  if (pending) { showTransaction('pending', 'Your submitted transaction is awaiting a ledger result.', pending); return }
  noticeKind = prepared ? 'liquidity' : 'trustline'; noticeHash = null
  lock(true)
  showTransaction('wallet', 'Review and approve the transaction in Freighter.')
  try {
    const network = await getNetworkDetails()
    if (network.networkPassphrase !== 'Test SDF Network ; September 2015') throw new Error('Freighter must be on Testnet.')
    const signed = await signTransaction(transaction.xdr, { address: owner, networkPassphrase: network.networkPassphrase })
    if (signed.error || !signed.signedTxXdr) throw new Error('Wallet signature declined.')
    showTransaction('submitting', 'Sending your signed transaction to Stellar Testnet.')
    const result = await client.submitSigned(transaction, signed.signedTxXdr, hash => {
      pending = hash; noticeHash = hash
      try { localStorage.setItem('pool-example-pending', hash); localStorage.setItem('pool-example-pending-kind', noticeKind) } catch { /* Keep the current page's pending hash. */ }
      showTransaction('pending', 'Submitted to Stellar Testnet. Waiting for ledger confirmation.', hash); element('check').hidden = false
    })
    await showReceipt(result.hash, result)
  } catch (error) { transactionError(error) }
  finally { lock(false) }
}
async function checkTransaction() {
  if (!pending || busy) return
  clearTimeout(confirmationTimer); lock(true)
  try { await showReceipt(pending, await client.status(pending)) }
  catch (error) { transactionError(error) }
  finally { lock(false) }
}
element('transaction-check').onclick = () => { void checkTransaction() }
element('check').onclick = () => { if (pending) showTransaction('pending', 'Your submitted transaction is awaiting a ledger result.', pending) }
if (pending) { element('check').hidden = false; showTransaction('pending', 'Your submitted transaction is awaiting a ledger result.', pending); confirmationTimer = setTimeout(() => { void checkTransaction() }, 5000) }
void updateQuote()
