import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Account, Address, Contract, Keypair, Networks, StrKey, TransactionBuilder, scValToNative, xdr } from '@stellar/stellar-sdk'
import { encodePolicy, validateDeployment } from '../src/lib/stellar.ts'
import { accountConstructor, requireWasm, verifiedAccountWasm } from '../src/lib/testnet.ts'
import { ACCOUNT_WASM_BYTES, ACCOUNT_WASM_HASH } from '../src/lib/contracts.ts'
import { readFile } from 'node:fs/promises'

const contract = (byte: number) => StrKey.encodeContract(Buffer.alloc(32, byte))
const config = { account: contract(1), router: contract(2), input: contract(3), output: contract(4) }
test('deployment rejects account keys and identical token identities', () => {
  assert.doesNotThrow(() => validateDeployment(config))
  assert.throws(() => validateDeployment({ ...config, account: Keypair.random().publicKey() }))
  assert.throws(() => validateDeployment({ ...config, output: config.input }))
})

test('atomic deployment binds the wallet owner and exact immutable allowlists', () => {
  const owner = Keypair.random().publicKey()
  const wasmHash = Buffer.from(ACCOUNT_WASM_HASH, 'hex')
  const salt = Buffer.alloc(32, 9)
  const tx = new TransactionBuilder(new Account(owner, '0'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(accountConstructor(owner, config, wasmHash, salt)).setTimeout(60).build()
  const operation = TransactionBuilder.fromXDR(tx.toXDR(), Networks.TESTNET).operations[0]
  assert.equal(operation.type, 'invokeHostFunction')
  if (operation.type !== 'invokeHostFunction' || operation.func.type !== 'hostFunctionTypeCreateContractV2') throw new Error('Deployment must run the constructor atomically.')
  const creation = operation.func.value
  assert.equal(creation.contractIdPreimage.type, 'contractIdPreimageFromAddress')
  if (creation.contractIdPreimage.type !== 'contractIdPreimageFromAddress') throw new Error('Wrong preimage')
  assert.equal(Address.fromScAddress(creation.contractIdPreimage.value.address).toString(), owner)
  assert.deepEqual(Buffer.from(creation.contractIdPreimage.value.salt.toBytes()), salt)
  assert.deepEqual(creation.constructorArgs.map(scValToNative), [owner, [config.input, config.output], [config.router]])
  assert.throws(() => accountConstructor(owner, { ...config, output: config.input }, wasmHash, salt))
  assert.throws(() => accountConstructor(config.account, config, wasmHash, salt))
})

test('provenance checks reject a different executable and an asset impersonating Caveat', () => {
  const instance = (executable: xdr.ContractExecutable) => new xdr.ScContractInstance({ executable, storage: [] })
  assert.doesNotThrow(() => requireWasm(instance(xdr.ContractExecutable.contractExecutableWasm(Buffer.from(ACCOUNT_WASM_HASH, 'hex'))), ACCOUNT_WASM_HASH, 'Caveat'))
  assert.throws(() => requireWasm(instance(xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32))), ACCOUNT_WASM_HASH, 'Caveat'))
  assert.throws(() => requireWasm(instance(xdr.ContractExecutable.contractExecutableStellarAsset()), ACCOUNT_WASM_HASH, 'Caveat'))
})

test('wallet deployment refuses corrupt bytecode, including equal-length substitutions', async () => {
  await assert.rejects(verifiedAccountWasm(new Uint8Array(8)))
  await assert.rejects(verifiedAccountWasm(new Uint8Array(ACCOUNT_WASM_BYTES)))
})

test('the built release matches the wallet deployment pin', async context => {
  let bytes: Buffer
  try { bytes = await readFile(new URL('../contracts/target/wasm32v1-none/release/caveat_account.wasm', import.meta.url)) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') { context.skip('Build the contracts to check the release artifact.'); return }
    throw error
  }
  assert.equal(await verifiedAccountWasm(bytes), bytes)
  const corrupted = Uint8Array.from(bytes)
  corrupted[corrupted.length - 1] ^= 1
  await assert.rejects(verifiedAccountWasm(corrupted))
})
test('the signing payload binds all exact identities and integer conditions in the contract ABI', () => {
  const policy = encodePolicy(config, 90071992547409931234567n, 123000000n, 7n, contract(5), 2000000000)
  const source = Keypair.random().publicKey()
  const tx = new TransactionBuilder(new Account(source, '0'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(config.account).call('execute', policy)).setTimeout(60).build()
  const roundTrip = TransactionBuilder.fromXDR(tx.toXDR(), Networks.TESTNET)
  assert.equal(roundTrip.source, source)
  assert.equal(roundTrip.operations.length, 1)
  const operation = roundTrip.operations[0]
  assert.equal(operation.type, 'invokeHostFunction')
  if (operation.type !== 'invokeHostFunction') throw new Error('Unexpected operation')
  assert.equal(operation.func.type, 'hostFunctionTypeInvokeContract')
  if (operation.func.type !== 'hostFunctionTypeInvokeContract') throw new Error('Unexpected host function')
  const invoke = operation.func.value
  assert.equal(Address.fromScAddress(invoke.contractAddress).toString(), config.account)
  assert.equal(invoke.functionName.toString(), 'execute')
  // Native decoding treats strings and symbols alike; inspect the actual wire types.
  const encoded = invoke.args[0]
  assert.equal(encoded.type, 'scvMap')
  if (encoded.type !== 'scvMap') throw new Error('Policy must be a struct map')
  assert.deepEqual(encoded.value?.map(entry => [entry.key.type, scValToNative(entry.key), entry.val.type]), [
    ['scvSymbol', 'amount_in', 'scvI128'],
    ['scvSymbol', 'deny_approvals', 'scvBool'],
    ['scvSymbol', 'expires_at', 'scvU64'],
    ['scvSymbol', 'max_spend', 'scvI128'],
    ['scvSymbol', 'min_receive', 'scvI128'],
    ['scvSymbol', 'nonce', 'scvU64'],
    ['scvSymbol', 'pair', 'scvAddress'],
    ['scvSymbol', 'router', 'scvAddress'],
    ['scvSymbol', 'token_in', 'scvAddress'],
    ['scvSymbol', 'token_out', 'scvAddress'],
  ])
  assert.deepEqual(scValToNative(invoke.args[0]), {
    amount_in: 90071992547409931234567n, deny_approvals: true, expires_at: 2000000000n,
    max_spend: 90071992547409931234567n, min_receive: 123000000n, nonce: 7n,
    pair: contract(5), router: config.router, token_in: config.input, token_out: config.output,
  })
})
