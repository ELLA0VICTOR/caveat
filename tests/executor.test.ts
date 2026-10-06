import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Account, Contract, Keypair, Networks, TransactionBuilder, scValToNative } from '@stellar/stellar-sdk'
import { CaveatClient, ROUTE, encodePolicy } from '@caveat/sdk'

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
