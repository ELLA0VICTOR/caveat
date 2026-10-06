// Exercise both directions on the published guard; disposable Testnet key in memory only.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Address, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk'
import { CaveatClient, EXECUTOR, EXECUTOR_HASH, ROUTE, toUnits } from '@caveat/sdk'
const client = new CaveatClient()
const signer = Keypair.random(); const owner = signer.publicKey()
const report = { network: 'Stellar Testnet', startedAt: new Date().toISOString(), status: 'running', executor: EXECUTOR, executorHash: EXECUTOR_HASH, owner, transactions: [] }
const save = () => writeFile(new URL('../docs/evidence/testnet-reverse-swap.json', import.meta.url), JSON.stringify(report, (_, value) => typeof value === 'bigint' ? String(value) : value, 2) + '\n')
async function submit(prepared, label) {
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET); tx.sign(signer)
  let receipt = await client.submitSigned(prepared, tx.toXDR(), hash => { report.pending = { hash, label }; void save(); console.log(`${label}: submitted ${hash}`) })
  for (let attempt = 0; receipt.status === 'pending' && attempt < 60; attempt++) { await new Promise(resolve => setTimeout(resolve, 1500)); receipt = await client.status(receipt.hash) }
  assert.equal(receipt.status, 'confirmed')
  const ledger = await client.server.getTransaction(receipt.hash)
  delete report.pending
  const result = { label, ...receipt, ledger: ledger.ledger, feeCharged: ledger.resultXdr.feeCharged }
  report.transactions.push(result); await save(); console.log(`${label}: confirmed ledger ${ledger.ledger}`)
  return result
}
try {
  assert.equal((await client.server.getNetwork()).passphrase, Networks.TESTNET)
  await client.verifyExecutor()
  const funded = await fetch(`https://friendbot.stellar.org/?addr=${owner}`, { signal: AbortSignal.timeout(60000) }); assert.ok(funded.ok)
  await submit(await client.prepareTrustline(owner), 'Enable disposable wallet test USDC')
  const forward = await client.quote('swap', '2')
  await submit(await client.prepare(owner, 'swap', { amount: '2', minimum: forward.minimum, minutes: 10 }), 'XLM → test USDC')
  report.beforeReverse = await client.wallet(owner)
  const quote = await client.quote('swap', '0.05', 'usdc-to-xlm')
  report.reverseQuote = quote
  const prepared = await client.prepare(owner, 'swap', { amount: '0.05', minimum: quote.minimum, minutes: 10, direction: 'usdc-to-xlm' })
  const receipt = await submit(prepared, 'Test USDC → XLM')
  assert.equal(receipt.outcome.spent_a, 500000n)
  assert.ok(receipt.outcome.received >= toUnits(quote.minimum))
  report.afterReverse = await client.wallet(owner)
  assert.equal(toUnits(report.beforeReverse.usdc) - toUnits(report.afterReverse.usdc), 500000n)
  assert.equal(toUnits(report.afterReverse.xlm) - toUnits(report.beforeReverse.xlm), receipt.outcome.received - receipt.feeCharged)
  assert.equal(report.afterReverse.nonce, 2n)
  report.guardBalances = await Promise.all([ROUTE.token_a, ROUTE.token_b, ROUTE.pair].map(id => client.read(id, 'balance', [new Address(EXECUTOR).toScVal()])))
  assert.deepEqual(report.guardBalances, [0n, 0n, 0n])
  await assert.rejects(client.prepare(owner, 'swap', { amount: '0.05', minimum: '1000', minutes: 10, direction: 'usdc-to-xlm' }), /Error\(Contract, #8\)/)
  assert.deepEqual(await client.wallet(owner), report.afterReverse)
  report.impossibleMinimum = { status: 'rejected-by-real-rpc', submitted: false, contractError: 8 }
  report.status = 'passed'; report.finishedAt = new Date().toISOString(); await save()
  console.log('PASS: real reverse swap returned XLM directly to the wallet, with guard balances preserved and strict minimum enforced.')
} catch (error) { report.status = 'failed'; report.error = error.message; await save(); throw error }
