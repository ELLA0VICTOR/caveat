import { CaveatClient, encodePolicy, fromUnits, hex, struct, toUnits } from '@caveat/sdk'
import { EXECUTOR_HASH, ROUTE, USDC_ISSUER } from '@caveat/sdk/deployment'
import type { Outcome, Terms } from '@caveat/sdk'
import { Address, BASE_FEE, Contract, Networks, StrKey, TransactionBuilder, rpc, scValToNative } from '@stellar/stellar-sdk'
import { FIXTURE_HASH, TEST_VENUES } from './venues.ts'
import type { TestVenue } from './venues'
import type { TransactionAmount } from './transaction'

export type FixtureCheck = {
  phase: 'blocked' | 'allowed'
  detail: string
  amounts: TransactionAmount[]
  ledger: number
  guard: string
  venue: string
  issue?: string
}

// Test venues are isolated deployments, never overrides of the production SDK route.
// This module can verify and simulate; it has no signing or submission path.
export async function checkTestVenue(id: TestVenue, owner: string, terms: Terms): Promise<FixtureCheck> {
  terms = { ...terms }
  if (terms.direction && terms.direction !== 'xlm-to-usdc') throw new Error('Test contracts use XLM → test USDC.')
  const fixture = TEST_VENUES[id]
  if (!fixture || !StrKey.isValidEd25519PublicKey(owner)) throw new Error('Connect a Stellar Testnet wallet.')
  const units = toUnits(terms.amount), minimum = toUnits(terms.minimum)
  if (units > 10_000_000n) throw new Error('Use up to 1 XLM for the funded test contracts.')
  if (!Number.isInteger(terms.minutes) || terms.minutes < 1 || terms.minutes > 60) throw new Error('Expiry must be 1–60 minutes.')
  const client = new CaveatClient(fixture.guard)
  const address = (value: string) => new Address(value).toScVal()
  const [guard, venue, config, tokenA, tokenB, name, resolved, wallet, nonce, account] = await Promise.all([
    client.instance(fixture.guard), client.instance(fixture.venue), client.read(fixture.guard, 'config'),
    client.instance(ROUTE.token_a), client.instance(ROUTE.token_b), client.read(ROUTE.token_b, 'name'),
    client.read(fixture.venue, 'router_pair_for', [address(ROUTE.token_a), address(ROUTE.token_b)]),
    client.horizon.loadAccount(owner), client.read(fixture.guard, 'nonce', [address(owner)]), client.server.getAccount(owner),
  ])
  if (guard.executable.type !== 'contractExecutableWasm' || hex(guard.executable.value.toBytes()) !== EXECUTOR_HASH
    || venue.executable.type !== 'contractExecutableWasm' || hex(venue.executable.value.toBytes()) !== FIXTURE_HASH) {
    throw new Error('Test contract bytecode differs from the verified release.')
  }
  const route = config as Record<string, string>
  const mode = venue.storage?.find(entry => JSON.stringify(scValToNative(entry.key)) === '["Mode"]')
  if (route.router !== fixture.venue || route.pair !== fixture.venue || resolved !== fixture.venue
    || route.token_a !== ROUTE.token_a || route.token_b !== ROUTE.token_b || !mode || scValToNative(mode.val) !== fixture.mode) {
    throw new Error('Test contract configuration differs from the selected scenario.')
  }
  if (tokenA.executable.type !== 'contractExecutableStellarAsset' || tokenB.executable.type !== 'contractExecutableStellarAsset'
    || name !== `USDC:${USDC_ISSUER}`) throw new Error('Unexpected underlying token contracts.')
  const trustline = wallet.balances.find(balance => balance.asset_type !== 'native' && 'asset_code' in balance
    && balance.asset_code === 'USDC' && balance.asset_issuer === USDC_ISSUER)
  if (!trustline || !('is_authorized' in trustline) || !trustline.is_authorized) {
    throw new Error('Enable test USDC in Wallet setup first, then retry this check.')
  }

  const original = encodePolicy('swap', owner, terms, BigInt(nonce as bigint), Math.floor(Date.now() / 1000) + terms.minutes * 60)
  if (original.type !== 'scvMap' || !original.map) throw new Error('Invalid swap policy encoding.')
  const policy = struct(Object.fromEntries(original.map.map(entry => {
    const key = scValToNative(entry.key) as string
    return [key, key === 'pair' || key === 'router' ? address(fixture.venue) : entry.val]
  })))
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(fixture.guard).call('swap', policy)).setTimeout(terms.minutes * 60).build()
  const result = await client.server.simulateTransaction(tx)
  if (rpc.Api.isSimulationRestore(result)) throw new Error('Test contract state needs restoration before this check can run.')
  const evidence = { ledger: result.latestLedger, guard: fixture.guard, venue: fixture.venue }
  if (rpc.Api.isSimulationSuccess(result) && result.result) {
    const outcome = scValToNative(result.result.retval) as Outcome
    if (id !== 'underpayment' || outcome.received !== units / 2n || outcome.spent_a !== units || outcome.received < minimum) {
      throw new Error('The test contract returned an unexpected simulation result.')
    }
    return { ...evidence, phase: 'allowed',
      detail: 'Your minimum permits this smaller receipt. Caveat enforces the conditions you choose. Raise the minimum to block this underpayment.',
      amounts: [{ label: 'Your minimum', value: `${terms.minimum} test USDC` }, { label: 'Simulated wallet receipt', value: `${fromUnits(outcome.received)} test USDC` }] }
  }
  if (!rpc.Api.isSimulationError(result)) throw new Error('The network returned no usable simulation result.')
  const events = result.events.map(diagnostic => {
    const event = diagnostic.event
    if (event.body.type !== 'v0') throw new Error('Unsupported network diagnostic format.')
    return { contract: event.contractId ? StrKey.encodeContract(event.contractId.toBytes()) : '',
      topics: event.body.v0.topics, data: event.body.v0.data }
  })
  const symbol = (value: typeof policy | undefined, expected: string) => value?.type === 'scvSymbol' && scValToNative(value) === expected
  if (id === 'underpayment') {
    const rejected = events.some(event => event.contract === fixture.guard && symbol(event.topics[0], 'error')
      && event.topics[1]?.type === 'scvError' && event.topics[1].error.type === 'sceContract' && event.topics[1].error.contractCode === 8)
    // Use the underlying token's transfer event, not the fixture's self-reported receipt.
    const delivered = events.find(event => event.contract === ROUTE.token_b && symbol(event.topics[0], 'transfer')
      && scValToNative(event.topics[1]) === fixture.venue && scValToNative(event.topics[2]) === fixture.guard)
    const claimed = events.find(event => event.contract === fixture.venue && symbol(event.topics[0], 'fn_return') && symbol(event.topics[1], 'swap_exact_tokens_for_tokens'))
    const paid = delivered && delivered.data.type === 'scvI128' ? BigInt(scValToNative(delivered.data)) : undefined
    const returned = claimed ? scValToNative(claimed.data) as bigint[] : undefined
    if (!rejected || paid === undefined || paid >= minimum || !returned || returned[1] !== units * 2n) {
      throw new Error(`Unable to verify the expected underpayment rejection. ${result.error}`)
    }
    return { ...evidence, phase: 'blocked', issue: result.error,
      detail: 'The contract claimed a larger return than it actually delivered. Caveat measured the token receipt and rejected the swap because it fell below your minimum.',
      amounts: [{ label: 'Your minimum', value: `${terms.minimum} test USDC` }, { label: 'Contract claimed', value: `${fromUnits(returned[1])} test USDC` }, { label: 'Attempted actual delivery', value: `${fromUnits(paid)} test USDC` }] }
  }
  const method = id === 'approval' ? 'approve' : 'transfer'
  const attempted = events.find(event => event.contract === fixture.venue && symbol(event.topics[0], 'fn_call')
    && event.topics[1]?.type === 'scvBytes' && hex(event.topics[1].bytes.toBytes()) === hex(StrKey.decodeContract(ROUTE.token_a))
    && symbol(event.topics[2], method))
  const args = attempted?.data.type === 'scvVec' ? attempted.data.vec?.map(scValToNative) : undefined
  const denied = events.some(event => event.contract === ROUTE.token_a && symbol(event.topics[0], 'error')
    && event.topics[1]?.type === 'scvError' && event.topics[1].error.type === 'sceAuth' && event.topics[1].error.code.name === 'scecInvalidAction')
  if (!denied || !args || args[0] !== fixture.guard || args[1] !== fixture.venue
    || args[2] !== (id === 'approval' ? (1n << 127n) - 1n : units + 1n)) {
    throw new Error(`Unable to verify the expected authorization rejection. ${result.error}`)
  }
  return { ...evidence, phase: 'blocked', issue: result.error,
    detail: id === 'approval' ? 'The test contract tried to give itself unlimited spending permission. Caveat authorized only the exact token transfer, so Stellar rejected the approval.'
      : 'The test contract tried to transfer more XLM than authorized. Caveat permitted only your exact amount, so Stellar rejected the extra transfer.',
    amounts: id === 'approval' ? [{ label: 'Your approval rule', value: 'None allowed' }, { label: 'Attempted allowance', value: 'Unlimited' }]
      : [{ label: 'Authorized transfer', value: `${terms.amount} XLM` }, { label: 'Attempted transfer', value: `${fromUnits(units + 1n)} XLM` }] }
}
