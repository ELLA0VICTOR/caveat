// Read-only production checks. No signer, private key, submission or funding operation.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { Account, BASE_FEE, Networks, Operation, TransactionBuilder, contract, rpc, xdr } from '@stellar/stellar-sdk'
import { CaveatClient, EXECUTOR_HASH, EXECUTOR_WASM_BYTES, MAINNET, TESTNET, hex } from '@caveat/sdk'

const client = new CaveatClient(undefined, undefined, 'mainnet')
const report = { network: 'Stellar Mainnet', checkedAt: new Date().toISOString(), submitted: false, route: MAINNET.route, routeHashes: MAINNET.routeHashes, executorHash: EXECUTOR_HASH }
await client.verifyRoute()
const official = await (await fetch('https://raw.githubusercontent.com/soroswap/core/main/public/mainnet.contracts.json')).json()
assert.equal(official.ids.router, MAINNET.route.router)
assert.equal(official.ids.factory, MAINNET.route.factory)
for (const name of ['router', 'factory', 'pair']) assert.equal(official.hashes[name], MAINNET.routeHashes[name])
report.sources = { soroswap: 'https://github.com/soroswap/core/blob/main/public/mainnet.contracts.json', usdc: 'https://developers.circle.com/stablecoins/usdc-contract-addresses' }
report.abi = []
async function spec(profile, role) {
  const server = new rpc.Server(profile.rpcUrl)
  const hash = Buffer.from(profile.routeHashes[role], 'hex')
  const result = await server.getLedgerEntries(xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash })))
  assert.equal(result.entries[0]?.val.type, 'contractCode')
  const code = result.entries[0].val.value.code
  assert.equal(createHash('sha256').update(code).digest('hex'), profile.routeHashes[role])
  return contract.Spec.fromWasm(code)
}
for (const [role, methods] of [
  ['router', ['router_pair_for', 'router_get_amounts_out', 'swap_exact_tokens_for_tokens', 'add_liquidity']],
  ['pair', ['token_0', 'token_1', 'get_reserves', 'total_supply', 'decimals', 'balance', 'transfer', 'deposit', 'swap']],
]) {
  const [a, b] = await Promise.all([spec(TESTNET, role), spec(MAINNET, role)])
  for (const method of methods) {
    const old = a.getFunc(method), current = b.getFunc(method)
    assert.deepEqual(current.inputs.map(input => hex(input.type.toXDR())), old.inputs.map(input => hex(input.type.toXDR())), `${role}.${method} arguments differ`)
    const valueTypes = func => func.outputs.map(type => hex((type.type === 'scSpecTypeResult' ? type.result.okType : type).toXDR()))
    assert.deepEqual(valueTypes(current), valueTypes(old), `${role}.${method} result differs`)
    report.abi.push({ role, method, inputTypes: current.inputs.map(input => input.type.type), compatible: true })
  }
}
report.quotes = {
  forward: await client.quote('swap', '0.1'), reverse: await client.quote('swap', '0.01', 'usdc-to-xlm'),
  liquidity: await client.quote('liquidity', '0.1'),
}
const wasm = await readFile(new URL('../contracts/artifacts/caveat_executor.wasm', import.meta.url))
assert.equal(wasm.length, EXECUTOR_WASM_BYTES)
assert.equal(createHash('sha256').update(wasm).digest('hex'), EXECUTOR_HASH)
const code = await client.server.getLedgerEntries(xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(EXECUTOR_HASH, 'hex') })))
report.executorCodePublished = Boolean(code.entries.length)
if (!code.entries.length) {
  // This unfunded public source is used only to estimate publication fees, never to submit.
  const tx = new TransactionBuilder(new Account('GBHZGFXVYOTZHCV746R4WWC73XYBWHDWCYF3N42XNS7IFEZQ6YXMIT62', '0'), { fee: BASE_FEE, networkPassphrase: Networks.PUBLIC })
    .addOperation(Operation.uploadContractWasm({ wasm })).setTimeout(300).build()
  const simulation = await client.server.simulateTransaction(tx)
  assert.ok(rpc.Api.isSimulationSuccess(simulation), simulation.error)
  report.publicationEstimate = { resourceFeeStroops: simulation.minResourceFee, xlm: Number(simulation.minResourceFee) / 1e7, ledger: simulation.latestLedger, inclusionFeeAdditional: true }
}
const executor = process.argv.find(value => value.startsWith('--executor='))?.slice(11) || MAINNET.executor
if (executor) {
  await new CaveatClient(executor, EXECUTOR_HASH, 'mainnet').verifyExecutor()
  report.executor = executor
  report.executorVerified = true
}
report.status = 'passed-read-only-checks'
report.execution = 'No Mainnet execution transaction submitted by this check.'
await writeFile(new URL('../docs/evidence/mainnet-route.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
