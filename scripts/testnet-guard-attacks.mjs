// Isolated adversarial swap deployments of the NEW wallet-funded executor.
// Real Testnet SAC balances; deliberate venue fixtures, never labeled Soroswap.
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { Address, Contract, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk'
import { CaveatClient, EXECUTOR_HASH, ROUTE, encodePolicy, struct } from '@caveat/sdk'
const client = new CaveatClient()
const signer = Keypair.random(); const owner = signer.publicKey()
const fixtureHash = '947682a6342f92dcb2d4eb2e2110d6cf317710e191cd203eed67e6571f6e1fe7'
const report = { network: 'Stellar Testnet', fixtureOnly: true, startedAt: new Date().toISOString(), owner, executorHash: EXECUTOR_HASH, fixtureHash, status: 'running', setup: [], cases: [] }
const save = () => writeFile(new URL('../docs/evidence/testnet-guard-attacks.json', import.meta.url), JSON.stringify(report, (_, value) => typeof value === 'bigint' ? String(value) : value, 2) + '\n')
const address = id => new Address(id).toScVal()
async function submit(prepared, label, expected = 'confirmed') {
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET); tx.sign(signer)
  let receipt = await client.submitSigned(prepared, tx.toXDR(), hash => { report.pending = { hash, label }; void save(); console.log(`${label}: submitted ${hash}`) })
  for (let attempt = 0; receipt.status === 'pending' && attempt < 60; attempt++) { await new Promise(resolve => setTimeout(resolve, 2000)); receipt = await client.status(receipt.hash) }
  assert.equal(receipt.status, expected)
  const ledger = await client.server.getTransaction(receipt.hash)
  const events = ledger.diagnosticEventsXdr ?? (ledger.resultMetaXdr?.type === 'v4' ? ledger.resultMetaXdr.value.diagnosticEvents : []) ?? []
  const result = { label, hash: receipt.hash, status: receipt.status, outcome: receipt.outcome, ledger: ledger.ledger, feeCharged: ledger.resultXdr.feeCharged,
    errors: events.filter(event => event.event.body.value.topics.some(topic => topic.type === 'scvError')).map(event => ({ contract: event.event.contractId ? Address.fromScAddress(xdr.ScAddress.scAddressTypeContract(event.event.contractId)).toString() : undefined, topics: event.event.body.value.topics.map(scValToNative), data: scValToNative(event.event.body.value.data) })) }
  delete report.pending; report.setup.push(result); await save(); console.log(`${label}: ${receipt.status} ledger ${ledger.ledger}`); return result
}
async function invoke(operation, label) { return submit(await client.prepareOperation(owner, operation), label) }
async function snapshot(guard, venue) {
  const ids = [owner, guard, venue]
  const balances = await Promise.all(ids.flatMap(id => [ROUTE.token_a, ROUTE.token_b].map(token => client.read(token, 'balance', [address(id)]))))
  const nonce = await client.read(guard, 'nonce', [address(owner)])
  const allowance = await client.read(ROUTE.token_a, 'allowance', [address(guard), address(venue)])
  return { ownerA: balances[0], ownerB: balances[1], guardA: balances[2], guardB: balances[3], venueA: balances[4], venueB: balances[5], nonce, allowance }
}
try {
  assert.equal((await client.server.getNetwork()).passphrase, Networks.TESTNET)
  await client.verifyExecutor()
  const wasm = await readFile(new URL('../contracts/target/wasm32v1-none/release/caveat_executor.wasm', import.meta.url))
  assert.equal(createHash('sha256').update(wasm).digest('hex'), EXECUTOR_HASH)
  const fixture = await readFile(new URL('../contracts/target/wasm32v1-none/release/caveat_demo_router.wasm', import.meta.url))
  assert.equal(createHash('sha256').update(fixture).digest('hex'), fixtureHash)
  const funding = await fetch(`https://friendbot.stellar.org/?addr=${owner}`, { signal: AbortSignal.timeout(60000) }); assert.ok(funding.ok)
  await submit(await client.prepareTrustline(owner), 'Enable disposable wallet USDC')
  const quote = await client.quote('swap', '40')
  await submit(await client.prepare(owner, 'swap', { amount: '40', minimum: quote.minimum, minutes: 10 }), 'Acquire real test USDC to fund isolated fixtures')
  const existing = await client.server.getLedgerEntries(xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(fixtureHash, 'hex') })))
  if (!existing.entries.length) await invoke(Operation.uploadContractWasm({ wasm: fixture }), 'Publish fixture')
  for (const [mode, name] of ['honest', 'lying-underpayment', 'forbidden-approval', 'extra-transfer'].entries()) {
    const deployment = await invoke(Operation.createCustomContract({ address: new Address(owner), wasmHash: Buffer.from(fixtureHash, 'hex'), salt: randomBytes(32), constructorArgs: [nativeToScVal(mode, { type: 'u32' })] }), `Deploy ${name} venue fixture`)
    const venue = deployment.outcome
    const config = struct({ router: address(venue), pair: address(venue), token_a: address(ROUTE.token_a), token_b: address(ROUTE.token_b) })
    const guardDeployment = await invoke(Operation.createCustomContract({ address: new Address(owner), wasmHash: Buffer.from(EXECUTOR_HASH, 'hex'), salt: randomBytes(32), constructorArgs: [config] }), `Deploy isolated ${name} guard`)
    const guard = guardDeployment.outcome
    if (mode < 2) await invoke(new Contract(ROUTE.token_b).call('transfer', address(owner), address(venue), nativeToScVal(mode === 0 ? 20000000n : 5000000n, { type: 'i128' })), `Fund ${name} fixture output`)
    const before = await snapshot(guard, venue)
    const expiry = Math.floor(Date.now() / 1000) + 600
    const standard = encodePolicy('swap', owner, { amount: '1', minimum: '1.9', minutes: 10 }, 0n, expiry)
    const replaceRoute = policy => { assert.equal(policy.type, 'scvMap'); return struct(Object.fromEntries(policy.value.map(entry => [scValToNative(entry.key), ['pair', 'router'].includes(scValToNative(entry.key)) ? address(venue) : entry.val]))) }
    const strict = replaceRoute(standard)
    const test = { name, mode, guard, venue, policy: scValToNative(strict), before }; report.cases.push(test); await save()
    if (mode === 0) {
      test.receipt = await invoke(new Contract(guard).call('swap', strict), 'Honest wallet-funded fixture swap')
      test.after = await snapshot(guard, venue)
      assert.deepEqual(test.receipt.outcome, { spent_a: 10000000n, spent_b: 0n, received: 20000000n })
      assert.equal(before.ownerA - test.after.ownerA, 10000000n + test.receipt.feeCharged)
      assert.equal(test.after.ownerB - before.ownerB, 20000000n)
      assert.equal(test.after.guardA, 0n); assert.equal(test.after.guardB, 0n); assert.equal(test.after.nonce, 1n)
    } else {
      await assert.rejects(client.prepareOperation(owner, new Contract(guard).call('swap', strict)), mode === 1 ? /Error\(Contract, #8\)/ : /Error\(Auth, InvalidAction\)/)
      test.preflight = { status: 'rejected-by-real-rpc', expectedError: mode === 1 ? 'Contract #8' : 'Auth InvalidAction' }
      if (mode === 1) {
        const weak = replaceRoute(encodePolicy('swap', owner, { amount: '1', minimum: '0.0000001', minutes: 10 }, 0n, expiry))
        const resourceProbe = await client.prepareOperation(owner, new Contract(guard).call('swap', weak))
        const probeTx = TransactionBuilder.fromXDR(resourceProbe.xdr, Networks.TESTNET)
        const simulation = await client.server.simulateTransaction(probeTx)
        assert.ok(rpc.Api.isSimulationSuccess(simulation)); assert.equal(simulation.result.auth.length, 1)
        const root = simulation.result.auth[0].rootInvocation
        assert.equal(root.subInvocations.length, 1, 'Source must authorize the exact wallet funding child.')
        const auth = new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: new xdr.SorobanAuthorizedInvocation({
          function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({ contractAddress: new Address(guard).toScAddress(), functionName: 'swap', args: [strict] })), subInvocations: root.subInvocations,
        }) })
        const failing = new TransactionBuilder(await client.server.getAccount(owner), { fee: resourceProbe.fee, networkPassphrase: Networks.TESTNET })
          .addOperation(Operation.invokeContractFunction({ contract: guard, function: 'swap', args: [strict], auth: [auth] })).setTimeout(300).build()
        const assembled = rpc.assembleTransaction(failing, simulation).build()
        test.resourceProbe = { submitted: false, minimumBaseUnits: '1', simulatedOutcome: resourceProbe.value }
        test.receipt = await submit({ xdr: assembled.toXDR(), source: owner, fee: assembled.fee, expiresAt: expiry }, 'Lying venue — atomic wallet funding rollback', 'failed')
        assert.ok(test.receipt.errors.some(event => event.contract === guard && event.topics.some(topic => topic?.type === 'contract' && topic.code === 8)), 'Must fail with the guard receipt check, not an unrelated error.')
      }
      test.after = await snapshot(guard, venue)
      const adjusted = { ...test.after, ownerA: test.after.ownerA + (test.receipt?.feeCharged ?? 0n) }
      assert.deepEqual(adjusted, before, 'All token movements, including wallet funding, and nonce must roll back. Only the network fee remains charged.')
    }
    test.passed = true; await save()
  }
  report.status = 'passed'; report.finishedAt = new Date().toISOString(); await save(); console.log('PASS: new executor wallet funding and settlement verified against all four real Testnet fixture cases.')
} catch (error) { report.status = 'failed'; report.error = error.message; await save(); throw error }
