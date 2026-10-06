// Deploy and exercise the shared guard against the REAL Soroswap testnet pool.
// A fresh Friendbot identity is held in memory only. Evidence contains public data.
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { Address, Keypair, Networks, Operation, TransactionBuilder, scValToNative, xdr } from '@stellar/stellar-sdk'
import { CaveatClient, ROUTE, struct } from '@caveat/sdk'

let client = new CaveatClient()
const binary = await readFile(new URL('../contracts/target/wasm32v1-none/release/caveat_executor.wasm', import.meta.url))
const hash = createHash('sha256').update(binary).digest('hex')
assert.equal((await client.server.getNetwork()).passphrase, Networks.TESTNET)
await client.verifyRoute()
const signer = Keypair.random(); const owner = signer.publicKey()
const previous = process.argv.includes('--reuse-deployment') ? JSON.parse(await readFile(new URL('../docs/evidence/testnet-executor.json', import.meta.url), 'utf8')) : null
const report = { network: 'Stellar Testnet', startedAt: new Date().toISOString(), status: 'running', owner, wasmHash: hash, wasmBytes: binary.length, route: ROUTE, transactions: [] }
const save = () => writeFile(new URL('../docs/evidence/testnet-executor.json', import.meta.url), JSON.stringify(report, (_, value) => typeof value === 'bigint' ? String(value) : value, 2) + '\n')
async function submit(prepared, label) {
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET); tx.sign(signer)
  let result = await client.submitSigned(prepared, tx.toXDR(), txHash => { report.pending = { hash: txHash, label }; void save(); console.log(`${label}: submitted ${txHash}`) })
  for (let attempt = 0; result.status === 'pending' && attempt < 90; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); result = await client.status(result.hash)
  }
  assert.equal(result.status, 'confirmed', `${label}: transaction did not succeed`)
  const ledger = await client.server.getTransaction(result.hash)
  delete report.pending; report.transactions.push({ label, ...result, ledger: ledger.ledger }); await save()
  console.log(`${label}: confirmed ledger ${ledger.ledger}`)
  return result
}
async function invoke(operation, label) { return submit(await client.prepareOperation(owner, operation), label) }
async function guardBalances() { return Promise.all([ROUTE.token_a, ROUTE.token_b, ROUTE.pair].map(id => client.read(id, 'balance', [new Address(client.executor).toScVal()]))) }
try {
  await save()
  console.log(`Funding a disposable testnet wallet: ${owner}`)
  const funded = await fetch(`https://friendbot.stellar.org/?addr=${owner}`, { signal: AbortSignal.timeout(60000) })
  if (!funded.ok) throw new Error(`Friendbot ${funded.status}`)
  const code = await client.server.getLedgerEntries(xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash, 'hex') })))
  if (!code.entries.length) await invoke(Operation.uploadContractWasm({ wasm: binary }), 'Publish executor WASM')
  let executorId
  if (previous) {
    assert.equal(previous.wasmHash, hash)
    executorId = previous.executor
    report.deployment = previous.transactions.find(tx => tx.label === 'Deploy shared executor') ?? previous.deployment
  } else {
    const config = struct(Object.fromEntries(['router', 'pair', 'token_a', 'token_b'].map(key => [key, new Address(ROUTE[key]).toScVal()])))
    const deployment = await invoke(Operation.createCustomContract({ address: new Address(owner), wasmHash: Buffer.from(hash, 'hex'), salt: randomBytes(32), constructorArgs: [config] }), 'Deploy shared executor')
    const confirmed = await client.server.getTransaction(deployment.hash)
    executorId = scValToNative(confirmed.returnValue)
  }
  client = new CaveatClient(executorId, hash)
  report.executor = client.executor
  await client.verifyExecutor(); await save()
  await submit(await client.prepareTrustline(owner), 'Enable exact test USDC trustline')
  const before = await client.wallet(owner); report.before = before
  const swapQuote = await client.quote('swap', '2')
  const swap = await client.prepare(owner, 'swap', { amount: '2', minimum: swapQuote.minimum, minutes: 10 })
  const swapReceipt = await submit(swap, 'Wallet → Soroswap → wallet swap')
  assert.equal(swapReceipt.outcome.spent_a, 20_000_000n)
  assert.ok(swapReceipt.outcome.received >= 1n)
  assert.deepEqual(await guardBalances(), [0n, 0n, 0n])
  const afterSwap = await client.wallet(owner); report.afterSwap = afterSwap
  assert.equal(afterSwap.nonce, 1n); assert.notEqual(afterSwap.usdc, '0')
  const quote = await client.quote('liquidity', '1')
  const liquidity = await client.prepare(owner, 'liquidity', { amount: '1', maxB: quote.maxB, minimum: quote.minimum, minutes: 10 })
  const lpReceipt = await submit(liquidity, 'Wallet-funded Soroswap liquidity')
  assert.ok(lpReceipt.outcome.received > 0n)
  assert.ok(lpReceipt.outcome.spent_a <= 10_000_000n)
  assert.deepEqual(await guardBalances(), [0n, 0n, 0n])
  const afterLiquidity = await client.wallet(owner); report.afterLiquidity = afterLiquidity
  assert.equal(afterLiquidity.nonce, 2n); assert.notEqual(afterLiquidity.shares, '0')
  // Impossible minimum: genuine preflight failure, no fabricated execution receipt.
  await assert.rejects(client.prepare(owner, 'swap', { amount: '1', minimum: '100000', minutes: 10 }), /Error\(Contract, #8\)/)
  assert.equal((await client.wallet(owner)).nonce, 2n)
  report.impossibleMinimum = { status: 'rejected-by-real-rpc', contractError: 8, submitted: false }
  report.status = 'passed'; report.finishedAt = new Date().toISOString(); await save()
  await writeFile(new URL('../packages/caveat-sdk/src/deployment.ts', import.meta.url), (await readFile(new URL('../packages/caveat-sdk/src/deployment.ts', import.meta.url), 'utf8'))
    .replace(/export const EXECUTOR = '[^']*'/, `export const EXECUTOR = '${client.executor}'`)
    .replace(/export const EXECUTOR_HASH = '[^']*'/, `export const EXECUTOR_HASH = '${hash}'`))
  console.log(`Verified shared executor: ${client.executor}`)
} catch (error) { report.status = 'failed'; report.error = error.message; await save(); throw error }
