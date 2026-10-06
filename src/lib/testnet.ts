import { Address, Asset, Contract, Networks, Operation, StrKey, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk'
import { ACCOUNT_WASM_BYTES, ACCOUNT_WASM_HASH } from './contracts.ts'
import { DEFAULT_ROUTER, hex, prepareOperation, readContract, server } from './stellar.ts'
import type { Deployment, PreparedTransaction } from './stellar.ts'
import { fromUnits, toUnits } from './policy.ts'

export const TEST_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
export const TESTNET_INPUT = Asset.native().contractId(Networks.TESTNET)
export const TESTNET_OUTPUT = new Asset('USDC', TEST_USDC_ISSUER).contractId(Networks.TESTNET)
export const SOROSWAP_FACTORY = 'CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY'
export const SOROSWAP_HASHES = {
  router: '4b95bbf9caec2c6e00c786f53c5f392c2fcdb8435ac0a862ab5e0645eb65824c',
  factory: '86285a9234d3f0d687eaf88efe8d5d72172b38c9a86624c9934c0cbf2aff2993',
  pair: '8447525edd62f72ffaf52136358034657ea0511a8fec1cd0ebde649f86cca464',
}
export const supportedRoute = { router: DEFAULT_ROUTER, input: TESTNET_INPUT, output: TESTNET_OUTPUT }
export type SetupAction = {
  kind: 'upload' | 'create' | 'deposit' | 'withdraw'
  transaction: PreparedTransaction
  config: Deployment
  amount?: string
  token?: string
}
const address = (value: string) => new Address(value).toScVal()

export async function contractInstance(id: string) {
  const ledger = await server.getLedgerEntries(new Contract(id).getFootprint())
  const entry = ledger.entries[0]
  if (!entry || entry.val.type !== 'contractData' || entry.val.value.val.type !== 'scvContractInstance') throw new Error(`Contract ${id} is unavailable on testnet.`)
  return { instance: entry.val.value.val.value, ledger: ledger.latestLedger }
}

export function requireWasm(instance: xdr.ScContractInstance, expected: string, name: string) {
  if (instance.executable.type !== 'contractExecutableWasm' || hex(instance.executable.value.toBytes()) !== expected) throw new Error(`${name} bytecode does not match the verified release. Stop and check deployment provenance.`)
}

export async function verifySupportedRoute(source?: string) {
  const [router, factory, input, output, pair, registeredPair, name] = await Promise.all([
    contractInstance(DEFAULT_ROUTER), contractInstance(SOROSWAP_FACTORY),
    contractInstance(TESTNET_INPUT), contractInstance(TESTNET_OUTPUT),
    readContract(source, DEFAULT_ROUTER, 'router_pair_for', [address(TESTNET_INPUT), address(TESTNET_OUTPUT)]),
    readContract(source, SOROSWAP_FACTORY, 'get_pair', [address(TESTNET_INPUT), address(TESTNET_OUTPUT)]),
    readContract(source, TESTNET_OUTPUT, 'name'),
  ])
  requireWasm(router.instance, SOROSWAP_HASHES.router, 'Soroswap router')
  requireWasm(factory.instance, SOROSWAP_HASHES.factory, 'Soroswap factory')
  const factoryEntry = router.instance.storage?.find(entry => JSON.stringify(scValToNative(entry.key)) === '["Factory"]')
  if (!factoryEntry || scValToNative(factoryEntry.val) !== SOROSWAP_FACTORY) throw new Error('Soroswap router points to a different factory.')
  if (input.instance.executable.type !== 'contractExecutableStellarAsset' || output.instance.executable.type !== 'contractExecutableStellarAsset' || name !== `USDC:${TEST_USDC_ISSUER}`) throw new Error('The selected tokens are not the expected Stellar Asset Contracts.')
  if (pair !== registeredPair || !StrKey.isValidContract(String(pair))) throw new Error('The router and factory disagree about this pool.')
  const pool = await contractInstance(String(pair))
  requireWasm(pool.instance, SOROSWAP_HASHES.pair, 'Soroswap pair')
  const reserves = await readContract(source, String(pair), 'get_reserves') as bigint[]
  if (reserves.length !== 2 || reserves.some(value => BigInt(value) <= 0n)) throw new Error('The XLM / test USDC pool has no active liquidity.')
  return { pair: String(pair), ledger: pool.ledger }
}

export function accountConstructor(source: string, config: Omit<Deployment, 'account'>, wasmHash: Uint8Array, salt: Uint8Array) {
  if (!StrKey.isValidEd25519PublicKey(source)) throw new Error('A Stellar wallet owner is required.')
  for (const id of [config.router, config.input, config.output]) if (!StrKey.isValidContract(id)) throw new Error('Constructor allowlists require exact contract addresses.')
  if (config.input === config.output) throw new Error('Constructor tokens must be different.')
  return Operation.createCustomContract({
    address: new Address(source), wasmHash, salt,
    constructorArgs: [address(source), nativeToScVal([address(config.input), address(config.output)]), nativeToScVal([address(config.router)])],
  })
}

export async function verifiedAccountWasm(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))
  if (bytes.length !== ACCOUNT_WASM_BYTES || hex(new Uint8Array(digest)) !== ACCOUNT_WASM_HASH) throw new Error('Caveat deployment file does not match the tested release checksum.')
  return bytes
}

export async function prepareAccount(source: string): Promise<SetupAction> {
  await verifySupportedRoute(source)
  const hash = Uint8Array.from(ACCOUNT_WASM_HASH.match(/../g)!, byte => parseInt(byte, 16))
  const code = await server.getLedgerEntries(xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash })))
  const config = { account: '', ...supportedRoute }
  if (!code.entries.length) {
    const response = await fetch(`${import.meta.env?.BASE_URL ?? '/'}contracts/caveat_account.wasm`)
    if (!response.ok) throw new Error('Build the contracts and run npm run contracts:stage before deploying.')
    const wasm = await verifiedAccountWasm(new Uint8Array(await response.arrayBuffer()))
    const transaction = await prepareOperation(source, Operation.uploadContractWasm({ wasm }))
    return { kind: 'upload', transaction, config }
  }
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const transaction = await prepareOperation(source, accountConstructor(source, supportedRoute, hash, salt))
  if (!StrKey.isValidContract(String(transaction.value))) throw new Error('Deployment simulation did not return a contract address.')
  return { kind: 'create', transaction, config: { ...config, account: String(transaction.value) } }
}

export async function inspectAccount(source: string, config: Deployment) {
  if (config.router !== DEFAULT_ROUTER || config.input !== TESTNET_INPUT || config.output !== TESTNET_OUTPUT) throw new Error('Wallet setup supports the verified XLM / test USDC Soroswap route.')
  const { instance, ledger } = await contractInstance(config.account)
  requireWasm(instance, ACCOUNT_WASM_HASH, 'Caveat account')
  const storage = new Map(instance.storage?.map(entry => [JSON.stringify(scValToNative(entry.key)), scValToNative(entry.val)]))
  if (storage.get('["Owner"]') !== source) throw new Error('This wallet is not the owner of the Caveat account.')
  const tokens = storage.get('["Tokens"]') as string[] | undefined
  const routers = storage.get('["Routers"]') as string[] | undefined
  if (!tokens || tokens.length !== 2 || !tokens.includes(config.input) || !tokens.includes(config.output) || !routers || routers.length !== 1 || routers[0] !== DEFAULT_ROUTER) throw new Error('The account allowlists do not match the supported route.')
  const [input, output] = await Promise.all([
    readContract(source, config.input, 'balance', [address(config.account)]),
    readContract(source, config.output, 'balance', [address(config.account)]),
  ])
  return { input: fromUnits(BigInt(input)), output: fromUnits(BigInt(output)), nonce: String(storage.get('["Nonce"]')), ledger }
}

export async function prepareDeposit(source: string, config: Deployment, amount: string): Promise<SetupAction> {
  await inspectAccount(source, config)
  const units = toUnits(amount)
  // Keep the first test deposit small and leave ample wallet funds for fees.
  if (units > toUnits('100')) throw new Error('Testnet setup accepts deposits of at most 100 XLM.')
  const transaction = await prepareOperation(source, new Contract(config.input).call('transfer', address(source), address(config.account), nativeToScVal(units, { type: 'i128' })))
  return { kind: 'deposit', transaction, config, amount, token: config.input }
}

export async function prepareWithdrawal(source: string, config: Deployment, token: string, amount: string): Promise<SetupAction> {
  await inspectAccount(source, config)
  if (![config.input, config.output].includes(token)) throw new Error('Choose one of this account’s tokens.')
  const transaction = await prepareOperation(source, new Contract(config.account).call('withdraw', address(token), address(source), nativeToScVal(toUnits(amount), { type: 'i128' })))
  return { kind: 'withdraw', transaction, config, amount, token }
}

export async function quoteIntent(config: Deployment, amount: string) {
  if (config.router !== DEFAULT_ROUTER || config.input !== TESTNET_INPUT || config.output !== TESTNET_OUTPUT) throw new Error('Quote lookup supports the XLM / test USDC route configured by wallet setup.')
  const units = toUnits(amount)
  await verifySupportedRoute()
  const amounts = await readContract(undefined, config.router, 'router_get_amounts_out', [nativeToScVal(units, { type: 'i128' }), nativeToScVal([address(config.input), address(config.output)])]) as bigint[]
  if (amounts.length !== 2 || BigInt(amounts[0]) !== units || BigInt(amounts[1]) <= 0n) throw new Error('Soroswap returned an invalid output quote.')
  const minimum = BigInt(amounts[1]) * 99n / 100n
  if (minimum <= 0n) throw new Error('This amount is too small to set a positive minimum receipt.')
  return { expected: fromUnits(BigInt(amounts[1])), minimum: fromUnits(minimum) }
}
