import { Account, Address, Asset, BASE_FEE, Contract, Horizon, Operation, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, scvSortedMap, xdr } from '@stellar/stellar-sdk'
import { EXECUTOR_WASM_BYTES, swapAssets } from './deployment.ts'
import type { SwapDirection } from './deployment.ts'
import { networkConfig, TESTNET } from './networks.ts'
import type { NetworkConfig, NetworkId } from './networks.ts'
export * from './deployment.ts'
export * from './networks.ts'
export type Action = 'swap' | 'liquidity'
export type Outcome = { spent_a: bigint; spent_b: bigint; received: bigint }
export type Terms = { amount: string; minimum: string; minutes: number; maxB?: string; direction?: SwapDirection }
export type PreparedAction = { xdr: string; source: string; fee: string; expiresAt: number; network: NetworkId; action: Action; terms: Terms; nonce: bigint; executor: string; simulation: Outcome }
export type TransactionPreparation = Pick<PreparedAction, 'xdr' | 'source' | 'fee' | 'expiresAt'> & { network?: NetworkId }
export type Quote = { expected: string; minimum: string; maxB?: string; ledger?: number }
export type ExecutorDeployment = { kind: 'upload' | 'create'; transaction: TransactionPreparation; executor?: string }
const address = (id: string) => new Address(id).toScVal()
export const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
export function toUnits(value: string, decimals = 7): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a positive decimal amount.')
  const [whole, fraction = ''] = value.split('.')
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`)
  const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  if (amount <= 0n || amount >= 1n << 127n) throw new Error('Amount must be positive and fit an i128.')
  return amount
}
export function fromUnits(value: bigint, decimals = 7): string {
  const scale = 10n ** BigInt(decimals)
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${value / scale}${fraction ? `.${fraction}` : ''}`
}
export function struct(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return scvSortedMap(Object.entries(fields).map(([key, val]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val })))
}
export function encodePolicy(action: Action, owner: string, terms: Terms, nonce: bigint, expiresAt: number, profile: NetworkConfig = TESTNET) {
  const i128 = (value: string) => nativeToScVal(toUnits(value), { type: 'i128' })
  const route = profile.route
  const assets = swapAssets(terms.direction, route)
  return struct({ owner: address(owner), router: address(route.router), pair: address(route.pair),
    expires_at: nativeToScVal(expiresAt, { type: 'u64' }), nonce: nativeToScVal(nonce, { type: 'u64' }), deny_approvals: nativeToScVal(true),
    ...(action === 'swap' ? { token_in: address(assets.tokenIn), token_out: address(assets.tokenOut), amount_in: i128(terms.amount), max_spend: i128(terms.amount), min_receive: i128(terms.minimum) }
      : { token_a: address(route.token_a), token_b: address(route.token_b), max_a: i128(terms.amount), max_b: i128(terms.maxB ?? ''), min_shares: i128(terms.minimum) }),
  })
}

/** An opt-in integration client with explicit network and immutable route pins. */
export class CaveatClient {
  readonly profile: NetworkConfig
  readonly server: rpc.Server
  readonly horizon: Horizon.Server
  readonly executor: string
  readonly expectedHash: string
  constructor(executor?: string, expectedHash?: string, readonly network: NetworkId = 'testnet') {
    this.profile = networkConfig(network)
    this.executor = executor ?? this.profile.executor
    this.expectedHash = expectedHash ?? this.profile.executorHash
    this.server = new rpc.Server(this.profile.rpcUrl)
    this.horizon = new Horizon.Server(this.profile.horizonUrl)
  }
  async read(contract: string, method: string, args: xdr.ScVal[] = []): Promise<unknown> {
    const source = new Account(StrKey.encodeEd25519PublicKey(new Uint8Array(32)), '0')
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: this.profile.passphrase })
      .addOperation(new Contract(contract).call(method, ...args)).setTimeout(60).build()
    const result = await this.server.simulateTransaction(tx)
    if (rpc.Api.isSimulationRestore(result)) throw new Error('Archived contract state needs restoration before this action can proceed.')
    if (!rpc.Api.isSimulationSuccess(result) || !result.result) throw new Error(`Cannot read ${method}: ${'error' in result ? result.error : 'No result'}`)
    return scValToNative(result.result.retval)
  }
  async instance(id: string) {
    const result = await this.server.getLedgerEntries(new Contract(id).getFootprint())
    const entry = result.entries[0]
    if (!entry || entry.val.type !== 'contractData' || entry.val.value.val.type !== 'scvContractInstance') throw new Error(`${this.profile.label} contract unavailable.`)
    return entry.val.value.val.value
  }
  async verifyRoute() {
    const network = await this.server.getNetwork()
    if (network.passphrase !== this.profile.passphrase) throw new Error('RPC is serving a different Stellar network.')
    const ROUTE = this.profile.route
    const ROUTE_HASHES = this.profile.routeHashes
    const [router, factory, pair, a, b, resolved, registered, name] = await Promise.all([
      this.instance(ROUTE.router), this.instance(ROUTE.factory), this.instance(ROUTE.pair), this.instance(ROUTE.token_a), this.instance(ROUTE.token_b),
      this.read(ROUTE.router, 'router_pair_for', [address(ROUTE.token_a), address(ROUTE.token_b)]),
      this.read(ROUTE.factory, 'get_pair', [address(ROUTE.token_a), address(ROUTE.token_b)]), this.read(ROUTE.token_b, 'name'),
    ])
    for (const [instance, hash] of [[router, ROUTE_HASHES.router], [factory, ROUTE_HASHES.factory], [pair, ROUTE_HASHES.pair]] as const) {
      if (instance.executable.type !== 'contractExecutableWasm' || hex(instance.executable.value.toBytes()) !== hash) throw new Error(`Soroswap bytecode differs from the pinned ${this.profile.label} release.`)
    }
    const factoryEntry = router.storage?.find(entry => JSON.stringify(scValToNative(entry.key)) === '["Factory"]')
    if (!factoryEntry || scValToNative(factoryEntry.val) !== ROUTE.factory || resolved !== ROUTE.pair || registered !== ROUTE.pair) throw new Error('The pinned router, factory and pool disagree.')
    if (a.executable.type !== 'contractExecutableStellarAsset' || b.executable.type !== 'contractExecutableStellarAsset' || name !== `USDC:${this.profile.usdcIssuer}`
      || ROUTE.token_a !== Asset.native().contractId(this.profile.passphrase)
      || ROUTE.token_b !== new Asset('USDC', this.profile.usdcIssuer).contractId(this.profile.passphrase)) throw new Error('Unexpected underlying token contracts.')
    const [first, second, da, db, ds] = await Promise.all([this.read(ROUTE.pair, 'token_0'), this.read(ROUTE.pair, 'token_1'), this.read(ROUTE.token_a, 'decimals'), this.read(ROUTE.token_b, 'decimals'), this.read(ROUTE.pair, 'decimals')])
    if (!((first === ROUTE.token_a && second === ROUTE.token_b) || (first === ROUTE.token_b && second === ROUTE.token_a)) || da !== 7 || db !== 7 || ds !== 7) throw new Error('Pool assets or precision differ from the supported route.')
  }
  async verifyExecutor() {
    if (!StrKey.isValidContract(this.executor) || !/^[a-f0-9]{64}$/.test(this.expectedHash)) throw new Error(`Deploy or select the ${this.profile.label} guard in Wallet setup first.`)
    const [instance, config] = await Promise.all([this.instance(this.executor), this.read(this.executor, 'config')])
    if (instance.executable.type !== 'contractExecutableWasm' || hex(instance.executable.value.toBytes()) !== this.expectedHash) throw new Error('Executor bytecode differs from the tested release.')
    const values = config as Record<string, string>
    const ROUTE = this.profile.route
    for (const key of ['router', 'pair', 'token_a', 'token_b'] as const) if (values[key] !== ROUTE[key]) throw new Error('Executor configuration differs from the supported route.')
    await this.verifyRoute()
  }
  async quote(action: Action, amount: string, direction: SwapDirection = 'xlm-to-usdc'): Promise<Quote> {
    const ROUTE = this.profile.route
    const units = toUnits(amount)
    await this.verifyRoute()
    if (action === 'swap') {
      const assets = swapAssets(direction, ROUTE)
      const amounts = await this.read(ROUTE.router, 'router_get_amounts_out', [nativeToScVal(units, { type: 'i128' }), nativeToScVal([address(assets.tokenIn), address(assets.tokenOut)])]) as bigint[]
      if (amounts.length !== 2 || BigInt(amounts[0]) !== units || BigInt(amounts[1]) <= 0n) throw new Error('No usable swap quote.')
      const expected = BigInt(amounts[1]); const minimum = expected * 99n / 100n
      if (minimum <= 0n) throw new Error('Amount is too small.')
      return { expected: fromUnits(expected), minimum: fromUnits(minimum) }
    }
    const [first, reserves, supply] = await Promise.all([this.read(ROUTE.pair, 'token_0'), this.read(ROUTE.pair, 'get_reserves'), this.read(ROUTE.pair, 'total_supply')])
    const [r0, r1] = reserves as bigint[]
    const [ra, rb] = first === ROUTE.token_a ? [BigInt(r0), BigInt(r1)] : first === ROUTE.token_b ? [BigInt(r1), BigInt(r0)] : [0n, 0n]
    if (ra <= 0n || rb <= 0n || BigInt(supply as bigint) <= 0n) throw new Error('The supported pool must already have liquidity.')
    const maxB = units * rb / ra
    const expected = units * BigInt(supply as bigint) / ra < maxB * BigInt(supply as bigint) / rb ? units * BigInt(supply as bigint) / ra : maxB * BigInt(supply as bigint) / rb
    const minimum = expected * 99n / 100n
    if (maxB <= 0n || minimum <= 0n) throw new Error('Amount is too small to provide liquidity.')
    return { maxB: fromUnits(maxB), expected: fromUnits(expected), minimum: fromUnits(minimum) }
  }
  async wallet(owner: string) {
    const ROUTE = this.profile.route
    const USDC_ISSUER = this.profile.usdcIssuer
    if (!StrKey.isValidEd25519PublicKey(owner)) throw new Error('Connect a Stellar wallet.')
    let account
    try { account = await this.horizon.loadAccount(owner) }
    catch (error) {
      if (error && typeof error === 'object' && 'response' in error && (error.response as { status?: number })?.status === 404) throw new Error(`Fund this Freighter address with ${this.network === 'mainnet' ? 'real Mainnet XLM' : 'Testnet XLM'} before preparing transactions.`)
      throw error
    }
    const trustline = account.balances.find(balance => balance.asset_type !== 'native' && 'asset_code' in balance && balance.asset_code === 'USDC' && balance.asset_issuer === USDC_ISSUER)
    const [a, b, shares, nonce] = await Promise.all([
      this.read(ROUTE.token_a, 'balance', [address(owner)]), trustline ? this.read(ROUTE.token_b, 'balance', [address(owner)]) : Promise.resolve(0n),
      this.read(ROUTE.pair, 'balance', [address(owner)]), this.executor ? this.read(this.executor, 'nonce', [address(owner)]) : Promise.resolve(0n),
    ])
    return { xlm: fromUnits(BigInt(a as bigint)), usdc: fromUnits(BigInt(b as bigint)), shares: fromUnits(BigInt(shares as bigint)), nonce: BigInt(nonce as bigint), trustline: Boolean(trustline && 'is_authorized' in trustline && trustline.is_authorized) }
  }
  async prepare(owner: string, action: Action, terms: Terms): Promise<PreparedAction> {
    terms = { ...terms } // Capture before any async work; later caller edits cannot alter review terms.
    if (!Number.isInteger(terms.minutes) || terms.minutes < 1 || terms.minutes > 60) throw new Error('Expiry must be 1–60 minutes.')
    await this.verifyExecutor()
    const state = await this.wallet(owner)
    if (!state.trustline) throw new Error(`Enable ${this.network === 'testnet' ? 'test USDC' : 'USDC'} in Wallet setup first. Stellar requires its exact wallet trustline.`)
    const expiresAt = Math.floor(Date.now() / 1000) + terms.minutes * 60
    const policy = encodePolicy(action, owner, terms, state.nonce, expiresAt, this.profile)
    const operation = new Contract(this.executor).call(action === 'swap' ? 'swap' : 'add_liquidity', policy)
    const prepared = await this.prepareOperation(owner, operation, terms.minutes * 60)
    return { ...prepared, expiresAt, action, terms: { ...terms }, nonce: state.nonce, executor: this.executor, simulation: prepared.value as Outcome }
  }
  async prepareOperation(owner: string, operation: xdr.Operation, seconds = 300) {
    const [account, fees] = await Promise.all([this.server.getAccount(owner), this.server.getFeeStats()])
    const inclusion = BigInt(fees.sorobanInclusionFee.p95) * 2n
    if (inclusion > 1_000_000n) throw new Error(`${this.profile.label} inclusion fees are unusually high. Retry when the network settles.`)
    const fee = inclusion > BigInt(BASE_FEE) ? String(inclusion) : BASE_FEE
    const tx = new TransactionBuilder(account, { fee, networkPassphrase: this.profile.passphrase }).addOperation(operation).setTimeout(seconds).build()
    const result = await this.server.simulateTransaction(tx)
    if (rpc.Api.isSimulationRestore(result)) throw new Error('Archived contract state needs restoration before this action can proceed.')
    if (!rpc.Api.isSimulationSuccess(result) || !result.result) throw new Error(`${this.profile.label} simulation rejected: ${'error' in result ? result.error : 'No result'}`)
    if (result.result.auth.some(entry => entry.credentials.type !== 'sorobanCredentialsSourceAccount')) throw new Error('Additional wallet authorization is required; this client supports the transaction source only.')
    const assembled = rpc.assembleTransaction(tx, result).build()
    return { source: owner, network: this.network, xdr: assembled.toXDR(), fee: assembled.fee, expiresAt: Math.floor(Date.now() / 1000) + seconds, value: scValToNative(result.result.retval) }
  }
  async prepareTrustline(owner: string): Promise<TransactionPreparation> {
    const account = await this.server.getAccount(owner)
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.profile.passphrase })
      .addOperation(Operation.changeTrust({ asset: new Asset('USDC', this.profile.usdcIssuer) })).setTimeout(300).build()
    return { source: owner, network: this.network, xdr: tx.toXDR(), fee: tx.fee, expiresAt: Math.floor(Date.now() / 1000) + 300 }
  }
  async prepareDeployment(owner: string, wasm: Uint8Array): Promise<ExecutorDeployment> {
    await this.verifyRoute()
    if (!StrKey.isValidEd25519PublicKey(owner)) throw new Error('Connect a Stellar wallet before deploying.')
    const expected = this.profile.executorHash
    const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(wasm))))
    if (wasm.length !== EXECUTOR_WASM_BYTES || digest !== expected) throw new Error('Executor deployment file differs from the tested release.')
    const hash = Uint8Array.from(expected.match(/../g)!, byte => parseInt(byte, 16))
    const code = await this.server.getLedgerEntries(xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash })))
    if (!code.entries.length) return { kind: 'upload', transaction: await this.prepareOperation(owner, Operation.uploadContractWasm({ wasm })) }
    const config = struct(Object.fromEntries(['router', 'pair', 'token_a', 'token_b'].map(key => [key, address(this.profile.route[key as keyof typeof this.profile.route])])))
    const prepared = await this.prepareOperation(owner, Operation.createCustomContract({ address: new Address(owner), wasmHash: hash, salt: crypto.getRandomValues(new Uint8Array(32)), constructorArgs: [config] }))
    const executor = String(prepared.value)
    if (!StrKey.isValidContract(executor)) throw new Error('Deployment simulation did not return a contract address.')
    return { kind: 'create', executor, transaction: prepared }
  }
  async status(hash: string) {
    const result = await this.server.getTransaction(hash)
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return { hash, status: 'confirmed' as const, outcome: result.returnValue ? scValToNative(result.returnValue) as Outcome : undefined }
    return { hash, status: result.status === rpc.Api.GetTransactionStatus.FAILED ? 'failed' as const : 'pending' as const, outcome: undefined }
  }
  async submitSigned(prepared: TransactionPreparation, signedXdr: string, onSubmitted?: (hash: string) => void) {
    if ((prepared.network && prepared.network !== this.network) || (this.network === 'mainnet' && prepared.network !== 'mainnet')) throw new Error('Prepared transaction belongs to a different network.')
    if (Math.floor(Date.now() / 1000) >= prepared.expiresAt) throw new Error('Transaction expired; prepare it again.')
    const tx = TransactionBuilder.fromXDR(signedXdr, this.profile.passphrase)
    const original = TransactionBuilder.fromXDR(prepared.xdr, this.profile.passphrase)
    if (!('source' in tx) || !('source' in original) || tx.source !== prepared.source || original.source !== prepared.source) throw new Error('Prepared transaction belongs to a different wallet.')
    if (hex(tx.hash()) !== hex(original.hash())) throw new Error('Signer returned a different transaction.')
    if ((await this.server.getNetwork()).passphrase !== this.profile.passphrase) throw new Error('RPC is serving a different Stellar network.')
    let sent
    try { sent = await this.server.sendTransaction(tx) }
    catch {
      // A transport failure can occur after acceptance. Track this exact signed body before retrying.
      const hash = hex(tx.hash())
      onSubmitted?.(hash)
      return { hash, status: 'pending' as const, outcome: undefined }
    }
    if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') throw new Error(`RPC rejected submission: ${sent.status}`)
    onSubmitted?.(sent.hash)
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      let receipt
      try { receipt = await this.status(sent.hash) } catch { return { hash: sent.hash, status: 'pending' as const, outcome: undefined } }
      if (receipt.status !== 'pending') return receipt
    }
    return { hash: sent.hash, status: 'pending' as const, outcome: undefined }
  }
}
