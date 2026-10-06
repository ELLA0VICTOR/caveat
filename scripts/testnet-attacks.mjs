// Isolated TESTNET fixture experiment, not a DEX or the browser swap path.
// The disposable issuer/owner key exists only in memory. Only public evidence is written.
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { Address, Asset, Contract, Keypair, Networks, Operation, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk'
import { ACCOUNT_WASM_HASH } from '../src/lib/contracts.ts'
import { encodePolicy, RPC_URL, readContract, server } from '../src/lib/stellar.ts'
import { accountConstructor, contractInstance, requireWasm } from '../src/lib/testnet.ts'

const FIXTURE_HASH = '947682a6342f92dcb2d4eb2e2110d6cf317710e191cd203eed67e6571f6e1fe7'
const reportUrl = new URL('../docs/evidence/testnet-attacks.json', import.meta.url)
const report = { network: 'Stellar Testnet', rpc: RPC_URL, startedAt: new Date().toISOString(), status: 'running', fixtureOnly: true, accountWasmHash: ACCOUNT_WASM_HASH, fixtureWasmHash: FIXTURE_HASH, setup: [], cases: [] }
const stringify = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? String(item) : item, 2)
const address = value => new Address(value).toScVal()
const integer = value => nativeToScVal(value, { type: 'i128' })
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
async function save() {
  await mkdir(new URL('./', reportUrl), { recursive: true })
  await writeFile(reportUrl, `${stringify(report)}\n`, 'utf8')
}

function diagnostics(result) {
  const meta = result.resultMetaXdr
  const events = result.diagnosticEventsXdr ?? (meta?.type === 'v4' ? meta.value.diagnosticEvents : meta?.type === 'v3' ? meta.value.sorobanMeta?.diagnosticEvents : []) ?? []
  return events.map(item => ({
    successful: item.inSuccessfulContractCall,
    contract: item.event.contractId ? StrKey.encodeContract(item.event.contractId.toBytes()) : undefined,
    topics: item.event.body.value.topics.map(scValToNative),
    data: scValToNative(item.event.body.value.data),
  }))
}

async function main() {
  const binaries = await Promise.all(['caveat_account', 'caveat_demo_router'].map(async name => {
    const bytes = await readFile(new URL(`../contracts/target/wasm32v1-none/release/${name}.wasm`, import.meta.url))
    const hash = createHash('sha256').update(bytes).digest('hex')
    assert.equal(hash, name === 'caveat_account' ? ACCOUNT_WASM_HASH : FIXTURE_HASH, 'Build and verify the pinned contracts before running.')
    return { name, bytes, hash }
  }))
  assert.equal((await server.getNetwork()).passphrase, Networks.TESTNET, 'This experiment runs only on Testnet.')
  if (process.argv.includes('--check')) { console.log('Pinned artifacts and Testnet RPC verified. No account created or transaction submitted.'); return }

  const signer = Keypair.random()
  const owner = signer.publicKey()
  report.owner = owner
  await save()
  console.log(`Creating a disposable Friendbot-funded Testnet issuer: ${owner}`)
  const funding = await fetch(`https://friendbot.stellar.org/?addr=${owner}`, { signal: AbortSignal.timeout(60000) })
  if (!funding.ok) throw new Error(`Friendbot funding failed (${funding.status}).`)
  await server.getAccount(owner)

  async function envelope(operation) {
    return new TransactionBuilder(await server.getAccount(owner), { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(operation).setTimeout(300).build()
  }
  async function simulate(operation) { const tx = await envelope(operation); return { tx, simulation: await server.simulateTransaction(tx) } }
  function requireSimulation(simulation) {
    if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result || rpc.Api.isSimulationRestore(simulation)) throw new Error(`Simulation rejected: ${simulation.error ?? 'Restore required or no result.'}`)
    assert.ok(simulation.result.auth.every(entry => entry.credentials.type === 'sorobanCredentialsSourceAccount'), 'Only the disposable source may authorize this run.')
    return simulation
  }
  async function submit(tx, label, expected = 'SUCCESS') {
    tx.sign(signer)
    const sent = await server.sendTransaction(tx)
    if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') throw new Error(`${label}: submission ${sent.status}; ${sent.errorResult?.result.type ?? 'not accepted'}`)
    console.log(`${label}: submitted ${sent.hash}`)
    report.pending = { label, hash: sent.hash }
    await save()
    for (let attempt = 0; attempt < 60; attempt++) {
      await delay(1500)
      const result = await server.getTransaction(sent.hash)
      if (result.status === 'NOT_FOUND') continue
      const receipt = { label, hash: sent.hash, status: result.status, ledger: result.ledger, closedAt: new Date(result.createdAt * 1000).toISOString(), resultCode: result.resultXdr.result.type, feeChargedStroops: String(result.resultXdr.feeCharged), value: result.returnValue ? scValToNative(result.returnValue) : undefined, diagnostics: diagnostics(result) }
      delete report.pending
      report.setup.push(receipt)
      await save()
      assert.equal(result.status, expected, `${label}: unexpected ledger status`)
      console.log(`${label}: ledger ${result.ledger} ${result.status}`)
      return receipt
    }
    throw new Error(`${label}: confirmation pending. Inspect ${sent.hash} before retrying.`)
  }
  async function invoke(operation, label) {
    const { tx, simulation } = await simulate(operation)
    return submit(rpc.assembleTransaction(tx, requireSimulation(simulation)).build(), label)
  }

  for (const binary of binaries) {
    const existing = await server.getLedgerEntries(xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(binary.hash, 'hex') })))
    if (!existing.entries.length) await invoke(Operation.uploadContractWasm({ wasm: binary.bytes }), `Upload ${binary.name}`)
  }
  const tokens = []
  for (const code of ['CAVIN', 'CAVOUT']) {
    const asset = new Asset(code, owner)
    const token = asset.contractId(Networks.TESTNET)
    const receipt = await invoke(Operation.createStellarAssetContract({ asset }), `Deploy ${code} test asset`)
    assert.equal(receipt.value, token)
    assert.equal((await contractInstance(token)).instance.executable.type, 'contractExecutableStellarAsset')
    tokens.push(token)
  }
  const [input, output] = tokens
  report.tokens = { input, output, decimals: 7, inputCode: 'CAVIN', outputCode: 'CAVOUT', issuer: owner }

  async function snapshot(account, router) {
    const values = await Promise.all([
      readContract(owner, input, 'balance', [address(account)]), readContract(owner, output, 'balance', [address(account)]),
      readContract(owner, input, 'balance', [address(router)]), readContract(owner, output, 'balance', [address(router)]),
      readContract(owner, account, 'nonce'), readContract(owner, input, 'allowance', [address(account), address(router)]),
    ])
    return Object.fromEntries(['accountInput', 'accountOutput', 'routerInput', 'routerOutput', 'nonce', 'allowance'].map((key, index) => [key, String(values[index])]))
  }

  for (const [mode, name] of ['honest', 'lying-underpayment', 'forbidden-approval', 'extra-transfer'].entries()) {
    console.log(`\n${name.toUpperCase()} — actual Testnet contracts`)
    const routerReceipt = await invoke(Operation.createCustomContract({ address: new Address(owner), wasmHash: Buffer.from(FIXTURE_HASH, 'hex'), salt: randomBytes(32), constructorArgs: [nativeToScVal(mode, { type: 'u32' })] }), `Deploy ${name} fixture`)
    const router = String(routerReceipt.value)
    const config = { router, input, output }
    const accountReceipt = await invoke(accountConstructor(owner, config, Buffer.from(ACCOUNT_WASM_HASH, 'hex'), randomBytes(32)), `Deploy ${name} Caveat account`)
    const account = String(accountReceipt.value)
    requireWasm((await contractInstance(router)).instance, FIXTURE_HASH, 'Isolated router fixture')
    const caveat = await contractInstance(account)
    requireWasm(caveat.instance, ACCOUNT_WASM_HASH, 'Isolated Caveat account')
    const storage = new Map(caveat.instance.storage.map(entry => [stringify(scValToNative(entry.key)), scValToNative(entry.val)]))
    assert.equal(storage.get(stringify(['Owner'])), owner)
    assert.deepEqual(storage.get(stringify(['Tokens'])), tokens)
    assert.deepEqual(storage.get(stringify(['Routers'])), [router])
    await invoke(new Contract(input).call('mint', address(account), integer(100000000n)), `Fund ${name} account with 10 test CAVIN`)
    await invoke(new Contract(output).call('mint', address(router), integer(1000000000n)), `Fund ${name} fixture with 100 test CAVOUT`)
    const before = await snapshot(account, router)
    const expiry = Math.floor(Date.now() / 1000) + 600
    const policy = encodePolicy({ account, ...config }, 10000000n, 19000000n, 0n, router, expiry)
    const { tx, simulation } = await simulate(new Contract(account).call('execute', policy))
    const evidence = { name, mode, account, router, policy: scValToNative(policy), before, simulationLedger: simulation.latestLedger }
    report.cases.push(evidence)
    if (mode === 0) {
      requireSimulation(simulation)
      evidence.receipt = await submit(rpc.assembleTransaction(tx, simulation).build(), 'Honest guarded fixture swap')
      assert.deepEqual(evidence.receipt.value, { spent: 10000000n, received: 20000000n })
      evidence.after = await snapshot(account, router)
      assert.deepEqual(evidence.after, { accountInput: '90000000', accountOutput: '20000000', routerInput: '10000000', routerOutput: '980000000', nonce: '1', allowance: '0' })
    } else {
      assert.ok(rpc.Api.isSimulationError(simulation), `${name} must fail genuine RPC simulation`)
      const expectedError = mode === 1 ? /Error\(Contract, #8\)/ : /Error\(Auth, InvalidAction\)/
      assert.match(simulation.error, expectedError, 'A different infrastructure error does not prove protection.')
      evidence.simulationError = simulation.error
      if (mode === 1) {
        // A successful WEAK policy simulation supplies the same real transfer footprint.
        // It is never submitted. The submitted policy and source authorization are STRICT.
        // This deliberately bypasses client preflight to verify failure on the ledger itself.
        const probePolicy = encodePolicy({ account, ...config }, 10000000n, 1n, 0n, router, expiry)
        const probe = requireSimulation((await simulate(new Contract(account).call('execute', probePolicy))).simulation)
        assert.deepEqual(scValToNative(probe.result.retval), { spent: 10000000n, received: 5000000n })
        assert.equal(probe.result.auth.length, 1)
        assert.equal(probe.result.auth[0].rootInvocation.subInvocations.length, 0)
        const auth = new xdr.SorobanAuthorizationEntry({
          credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
          rootInvocation: new xdr.SorobanAuthorizedInvocation({
            function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({ contractAddress: new Address(account).toScAddress(), functionName: 'execute', args: [policy] })),
            subInvocations: [],
          }),
        })
        const failing = await envelope(Operation.invokeContractFunction({ contract: account, function: 'execute', args: [policy], auth: [auth] }))
        evidence.resourceProbe = { minReceive: '1', simulationLedger: probe.latestLedger, simulatedOutcome: scValToNative(probe.result.retval), submitted: false }
        evidence.receipt = await submit(rpc.assembleTransaction(failing, probe).build(), 'Lying underpayment — deliberate ledger rejection', 'FAILED')
        assert.ok(evidence.receipt.diagnostics.some(event => event.contract === account && event.topics[0] === 'error' && event.topics.some(topic => topic?.type === 'contract' && topic.code === 8)), 'Ledger diagnostics must identify Caveat ReceiptTooLow, not an unrelated failure.')
      }
      evidence.after = await snapshot(account, router)
      assert.deepEqual(evidence.after, before, 'Account/router balances, nonce and allowance must remain unchanged.')
    }
    evidence.passed = true
    await save()
    console.log(`${name}: checks passed. ${mode === 0 ? 'Balances changed exactly as authorized.' : 'Balances, nonce and allowance unchanged.'}`)
  }
  report.status = 'passed'
  report.completedAt = new Date().toISOString()
  await save()
  console.log('\nPASS — public evidence saved to docs/evidence/testnet-attacks.json. Disposable key discarded when this process exits.')
}

main().catch(async error => {
  report.status = 'failed'
  report.failure = error.message
  if (!process.argv.includes('--check')) await save()
  console.error(`Attack experiment stopped: ${error.message}`)
  process.exitCode = 1
})
