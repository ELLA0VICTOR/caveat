import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Account, Address, Asset, Contract, Keypair, Networks, StrKey, TransactionBuilder, contract, scValToNative } from '@stellar/stellar-sdk'
import { readFile } from 'node:fs/promises'
import { CaveatClient, MAINNET, TESTNET, ROUTE, encodePolicy, pendingKey } from '@caveat/sdk'

test('swap and liquidity policies use exact symbol-keyed ABIs and bind wallet settlement', () => {
  const owner = Keypair.random().publicKey()
  for (const action of ['swap', 'liquidity'] as const) {
    const policy = encodePolicy(action, owner, { amount: '1', maxB: '0.2', minimum: '0.01', minutes: 10 }, 123n, 2000000000)
    assert.equal(policy.type, 'scvMap')
    if (policy.type !== 'scvMap') throw new Error('Wrong wire type')
    assert.ok(policy.value!.every(entry => entry.key.type === 'scvSymbol'))
    const native = scValToNative(policy)
    assert.equal(native.owner, owner); assert.equal(native.router, ROUTE.router); assert.equal(native.pair, ROUTE.pair)
    assert.equal(native.nonce, 123n); assert.equal(native.expires_at, 2000000000n); assert.equal(native.deny_approvals, true)
    if (action === 'swap') {
      assert.equal(native.token_in, ROUTE.token_a); assert.equal(native.token_out, ROUTE.token_b)
      assert.equal(native.amount_in, 10000000n); assert.equal(native.max_spend, 10000000n); assert.equal(native.min_receive, 100000n)
    } else {
      assert.equal(native.token_a, ROUTE.token_a); assert.equal(native.token_b, ROUTE.token_b)
      assert.equal(native.max_a, 10000000n); assert.equal(native.max_b, 2000000n); assert.equal(native.min_shares, 100000n)
    }
    const types = new Map(policy.value!.map(entry => [scValToNative(entry.key), entry.val.type]))
    assert.equal(types.get('owner'), 'scvAddress'); assert.equal(types.get('nonce'), 'scvU64'); assert.equal(types.get('expires_at'), 'scvU64')
    assert.equal(types.get(action === 'swap' ? 'min_receive' : 'min_shares'), 'scvI128')
  }
})

test('SDK rejects changed signer payloads and expired preparations before submitting', async () => {
  const signer = Keypair.random()
  const transaction = (amount: string) => new TransactionBuilder(new Account(signer.publicKey(), '0'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(ROUTE.router).call('test', encodePolicy('swap', signer.publicKey(), { amount, minimum: '0.1', minutes: 10 }, 0n, 2000000000))).setTimeout(60).build()
  const original = transaction('1'); const changed = transaction('2'); changed.sign(signer)
  const prepared = { xdr: original.toXDR(), source: signer.publicKey(), fee: '100', expiresAt: Math.floor(Date.now()/1000) + 60 }
  const client = new CaveatClient()
  await assert.rejects(client.submitSigned(prepared, changed.toXDR()), /different transaction/)
  await assert.rejects(client.submitSigned({ ...prepared, expiresAt: 1 }, original.toXDR()), /expired/)
})

test('reverse swap signs USDC spending and XLM receipt without changing the pinned venue', () => {
  const owner = Keypair.random().publicKey()
  const policy = encodePolicy('swap', owner, { amount: '0.05', minimum: '0.4', minutes: 10, direction: 'usdc-to-xlm' }, 2n, 2000000000)
  const decoded = scValToNative(policy)
  assert.equal(decoded.token_in, ROUTE.token_b)
  assert.equal(decoded.token_out, ROUTE.token_a)
  assert.equal(decoded.amount_in, 500000n)
  assert.equal(decoded.max_spend, 500000n)
  assert.equal(decoded.min_receive, 4000000n)
  assert.equal(decoded.owner, owner)
  assert.equal(decoded.router, ROUTE.router)
  assert.equal(decoded.pair, ROUTE.pair)
  assert.equal(decoded.nonce, 2n)
  assert.equal(decoded.deny_approvals, true)
})

test('Mainnet policies bind the production venue and Circle asset in both directions', () => {
  const owner = Keypair.random().publicKey()
  assert.equal(MAINNET.route.token_a, Asset.native().contractId(Networks.PUBLIC))
  assert.equal(MAINNET.route.token_b, new Asset('USDC', MAINNET.usdcIssuer).contractId(Networks.PUBLIC))
  assert.notEqual(MAINNET.route.pair, ROUTE.pair)
  for (const direction of ['xlm-to-usdc', 'usdc-to-xlm'] as const) {
    const policy = scValToNative(encodePolicy('swap', owner, { amount: '0.1', minimum: '0.01', minutes: 10, direction }, 4n, 2000000000, MAINNET))
    assert.equal(policy.router, MAINNET.route.router)
    assert.equal(policy.pair, MAINNET.route.pair)
    assert.equal(policy.token_in, direction === 'xlm-to-usdc' ? MAINNET.route.token_a : MAINNET.route.token_b)
    assert.equal(policy.token_out, direction === 'xlm-to-usdc' ? MAINNET.route.token_b : MAINNET.route.token_a)
    assert.equal(policy.max_spend, 1000000n)
    assert.equal(policy.deny_approvals, true)
  }
})

test('network-specific clients cannot submit a preparation belonging to another network', async () => {
  const source = Keypair.random().publicKey()
  const prepared = { source, xdr: 'Never parsed', fee: '100', expiresAt: 2000000000 }
  const mainnet = new CaveatClient(undefined, undefined, 'mainnet')
  assert.equal(mainnet.executor, MAINNET.executor)
  assert.equal(mainnet.profile.passphrase, Networks.PUBLIC)
  await assert.rejects(mainnet.submitSigned({ ...prepared, network: 'testnet' }, ''), /different network/)
  await assert.rejects(mainnet.submitSigned(prepared, ''), /different network/)
  await assert.rejects(new CaveatClient().submitSigned({ ...prepared, network: 'mainnet' }, ''), /different network/)
  assert.equal(new CaveatClient().profile.passphrase, TESTNET.passphrase)
})

test('pending transactions remain separate on Testnet and Mainnet', () => {
  for (const kind of ['action', 'trustline', 'deployment'] as const) {
    assert.notEqual(pendingKey('testnet', kind), pendingKey('mainnet', kind))
  }
  assert.equal(pendingKey('testnet', 'action'), 'caveat-action-pending')
})

test('an uncertain submission keeps the signed transaction hash for confirmation checks', async () => {
  const signer = Keypair.random()
  const tx = new TransactionBuilder(new Account(signer.publicKey(), '0'), { fee: '100', networkPassphrase: Networks.PUBLIC })
    .addOperation(new Contract(MAINNET.route.router).call('test')).setTimeout(60).build()
  tx.sign(signer)
  const client = new CaveatClient(undefined, undefined, 'mainnet')
  client.server.getNetwork = async () => ({ passphrase: Networks.PUBLIC, protocolVersion: 29 })
  client.server.sendTransaction = async () => { throw new Error('Transport closed after acceptance') }
  let tracked = ''
  const result = await client.submitSigned({ source: signer.publicKey(), xdr: tx.toXDR(), network: 'mainnet', fee: '100', expiresAt: 2000000000 }, tx.toXDR(), hash => { tracked = hash })
  assert.equal(result.status, 'pending')
  assert.equal(result.hash, Buffer.from(tx.hash()).toString('hex'))
  assert.equal(tracked, result.hash)
})

test('Mainnet deployment binds production config using the committed executor constructor ABI', async () => {
  const wasm = await readFile(new URL('../contracts/artifacts/caveat_executor.wasm', import.meta.url))
  const owner = Keypair.random().publicKey()
  const id = StrKey.encodeContract(new Uint8Array(32).fill(9))
  const client = new CaveatClient(undefined, undefined, 'mainnet')
  client.verifyRoute = async () => {}
  client.server.getLedgerEntries = async () => ({ entries: [{}] } as never)
  let captured: ReturnType<typeof TransactionBuilder.fromXDR> | undefined
  client.prepareOperation = async (source, operation) => {
    const tx = new TransactionBuilder(new Account(source, '0'), { fee: '100', networkPassphrase: Networks.PUBLIC }).addOperation(operation).setTimeout(60).build()
    captured = TransactionBuilder.fromXDR(tx.toXDR(), Networks.PUBLIC)
    return { source, xdr: tx.toXDR(), network: 'mainnet', expiresAt: 2000000000, fee: '100', value: id }
  }
  const deployed = await client.prepareDeployment(owner, wasm)
  assert.equal(deployed.executor, id)
  assert.equal(deployed.transaction.network, 'mainnet')
  assert.ok(captured && 'operations' in captured)
  const operation = captured.operations[0]
  if (operation.type !== 'invokeHostFunction' || operation.func.type !== 'hostFunctionTypeCreateContractV2') throw new Error('Constructor must execute atomically during creation.')
  const creation = operation.func.value
  if (creation.contractIdPreimage.type !== 'contractIdPreimageFromAddress') throw new Error('Wrong contract preimage')
  assert.equal(Address.fromScAddress(creation.contractIdPreimage.value.address).toString(), owner)
  const config = { router: MAINNET.route.router, pair: MAINNET.route.pair, token_a: MAINNET.route.token_a, token_b: MAINNET.route.token_b }
  const canonical = contract.Spec.fromWasm(wasm).funcArgsToScVals('__constructor', { config })
  assert.deepEqual(creation.constructorArgs.map(value => Buffer.from(value.toXDR())), canonical.map(value => Buffer.from(value.toXDR())))
  const corrupt = Uint8Array.from(wasm); corrupt[corrupt.length - 1] ^= 1
  await assert.rejects(client.prepareDeployment(owner, corrupt), /differs from the tested release/)
})
