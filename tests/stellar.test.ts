import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Account, Address, Contract, Keypair, Networks, StrKey, TransactionBuilder, scValToNative } from '@stellar/stellar-sdk'
import { encodePolicy, validateDeployment } from '../src/lib/stellar.ts'

const contract = (byte: number) => StrKey.encodeContract(Buffer.alloc(32, byte))
const config = { account: contract(1), router: contract(2), input: contract(3), output: contract(4) }
test('deployment rejects account keys and identical token identities', () => {
  assert.doesNotThrow(() => validateDeployment(config))
  assert.throws(() => validateDeployment({ ...config, account: Keypair.random().publicKey() }))
  assert.throws(() => validateDeployment({ ...config, output: config.input }))
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
  assert.deepEqual(scValToNative(invoke.args[0]), {
    amount_in: 90071992547409931234567n, deny_approvals: true, expires_at: 2000000000n,
    max_spend: 90071992547409931234567n, min_receive: 123000000n, nonce: 7n,
    pair: contract(5), router: config.router, token_in: config.input, token_out: config.output,
  })
})
