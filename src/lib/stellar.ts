import { Account, Address, BASE_FEE, Contract, Networks, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, scvSortedMap, xdr } from '@stellar/stellar-sdk'
import { toUnits } from './policy.ts'

export const RPC_URL = 'https://soroban-testnet.stellar.org'
export const DEFAULT_ROUTER = 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD'
export const server = new rpc.Server(RPC_URL)
export type Deployment = { account: string; router: string; input: string; output: string }
export type Intent = { amount: string; minimum: string; minutes: number }
export type PreparedTransaction = { xdr: string; expiresAt: number; source: string; fee: string }
export type Prepared = PreparedTransaction & { intent: Intent; spentBefore: bigint; receivedBefore: bigint; nonce: bigint; inputDecimals: number; outputDecimals: number; pair: string }
export type LedgerReceipt = { hash: string; status: 'confirmed' | 'failed' | 'pending'; value?: unknown }
export const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export function validateDeployment(config: Deployment) {
  for (const [name, address] of Object.entries(config)) {
    if (!StrKey.isValidContract(address)) throw new Error(`Enter a valid contract address for ${name}.`)
  }
  if (config.input === config.output) throw new Error('Input and output contracts must be different.')
}

export function encodePolicy(config: Deployment, amount: bigint, minimum: bigint, nonce: bigint, pair: string, expiresAt: number): xdr.ScVal {
  const address = (value: string) => new Address(value).toScVal()
  const fields = {
    amount_in: nativeToScVal(amount, { type: 'i128' }),
    deny_approvals: nativeToScVal(true),
    expires_at: nativeToScVal(expiresAt, { type: 'u64' }),
    max_spend: nativeToScVal(amount, { type: 'i128' }),
    min_receive: nativeToScVal(minimum, { type: 'i128' }),
    nonce: nativeToScVal(nonce, { type: 'u64' }),
    pair: address(pair), router: address(config.router), token_in: address(config.input), token_out: address(config.output),
  }
  // Soroban named structs require symbol keys, in canonical map order.
  return scvSortedMap(Object.entries(fields).map(([name, val]) => new xdr.ScMapEntry({
    key: xdr.ScVal.scvSymbol(name), val,
  })))
}

export async function connectWallet(): Promise<string> {
  const { requestAccess, getNetworkDetails } = await import('@stellar/freighter-api')
  const result = await requestAccess()
  if (result.error || !result.address) throw new Error(result.error?.message || 'Install or unlock Freighter to connect your wallet.')
  const network = await getNetworkDetails()
  if (network.error || network.networkPassphrase !== Networks.TESTNET) throw new Error('Switch Freighter to Stellar Testnet, then reconnect.')
  return result.address
}

export async function restoreWallet(): Promise<string> {
  const { isConnected, isAllowed, getAddress, getNetworkDetails } = await import('@stellar/freighter-api')
  const [extension, permission] = await Promise.all([isConnected(), isAllowed()])
  if (extension.error || !extension.isConnected || permission.error || !permission.isAllowed) return ''
  const [account, network] = await Promise.all([getAddress(), getNetworkDetails()])
  if (account.error || !StrKey.isValidEd25519PublicKey(account.address) || network.error || network.networkPassphrase !== Networks.TESTNET) return ''
  return account.address
}

export async function readContract(source: string | undefined, contract: string, method: string, args: xdr.ScVal[] = []) {
  // Public reads need no wallet or funded source. This envelope is simulated only.
  const account = source ? await server.getAccount(source) : new Account(StrKey.encodeEd25519PublicKey(new Uint8Array(32)), '0')
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(contract).call(method, ...args)).setTimeout(60).build()
  const simulation = await server.simulateTransaction(tx)
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) throw new Error(`Cannot read ${method}. ${'error' in simulation ? simulation.error : 'Contract not available on testnet.'}`)
  return scValToNative(simulation.result.retval)
}

export async function prepareOperation(source: string, operation: xdr.Operation, seconds = 300): Promise<PreparedTransaction & { value: unknown }> {
  const [account, fees] = await Promise.all([server.getAccount(source), server.getFeeStats()])
  const inclusion = BigInt(fees.sorobanInclusionFee.p95) * 2n
  if (inclusion > 1_000_000n) throw new Error('Testnet inclusion fees are unusually high. Retry later.')
  const fee = inclusion > BigInt(BASE_FEE) ? String(inclusion) : BASE_FEE
  const expiresAt = Math.floor(Date.now() / 1000) + seconds
  const tx = new TransactionBuilder(account, { fee, networkPassphrase: Networks.TESTNET })
    .addOperation(operation).setTimeout(seconds).build()
  const simulation = await server.simulateTransaction(tx)
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) throw new Error(`Testnet simulation rejected: ${'error' in simulation ? simulation.error : 'Missing simulation result.'}`)
  if (simulation.result.auth.some(entry => entry.credentials.type !== 'sorobanCredentialsSourceAccount')) throw new Error('This operation needs an additional authorization that this wallet flow does not support.')
  const prepared = rpc.assembleTransaction(tx, simulation).build()
  return { xdr: prepared.toXDR(), expiresAt, source, fee: prepared.fee, value: scValToNative(simulation.result.retval) }
}

export async function prepareIntent(source: string, config: Deployment, intent: Intent): Promise<Prepared> {
  validateDeployment(config)
  if (!Number.isInteger(intent.minutes) || intent.minutes < 1 || intent.minutes > 60) throw new Error('Expiry must be 1–60 minutes.')
  const { inspectAccount, verifySupportedRoute } = await import('./testnet.ts')
  await Promise.all([inspectAccount(source, config), verifySupportedRoute(source)])
  const address = (value: string) => new Address(value).toScVal()
  const [owner, nonce, inputDecimals, outputDecimals, pair, spentBefore, receivedBefore] = await Promise.all([
    readContract(source, config.account, 'owner'), readContract(source, config.account, 'nonce'),
    readContract(source, config.input, 'decimals'), readContract(source, config.output, 'decimals'),
    readContract(source, config.router, 'router_pair_for', [address(config.input), address(config.output)]),
    readContract(source, config.input, 'balance', [address(config.account)]), readContract(source, config.output, 'balance', [address(config.account)]),
  ])
  if (owner !== source) throw new Error('Connected wallet is not the owner of this Caveat account.')
  const amount = toUnits(intent.amount, Number(inputDecimals))
  const minimum = toUnits(intent.minimum, Number(outputDecimals))
  if (BigInt(spentBefore) < amount) throw new Error('Fund the Caveat contract with the input token before swapping.')
  const expiresAt = Math.floor(Date.now() / 1000) + intent.minutes * 60
  const policy = encodePolicy(config, amount, minimum, BigInt(nonce), String(pair), expiresAt)
  const prepared = await prepareOperation(source, new Contract(config.account).call('execute', policy), intent.minutes * 60)
  return { ...prepared, intent: { ...intent }, expiresAt, spentBefore: BigInt(spentBefore), receivedBefore: BigInt(receivedBefore), nonce: BigInt(nonce), inputDecimals: Number(inputDecimals), outputDecimals: Number(outputDecimals), pair: String(pair) }
}

export async function transactionStatus(hash: string): Promise<LedgerReceipt> {
  const result = await server.getTransaction(hash)
  if (result.status === rpc.Api.GetTransactionStatus.FAILED) return { hash, status: 'failed' }
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) return { hash, status: 'pending' }
  return { hash, status: 'confirmed', value: result.returnValue ? scValToNative(result.returnValue) : undefined }
}

export async function submitTransaction(source: string, prepared: PreparedTransaction, onProgress: (message: string) => void, onSubmitted?: (hash: string) => void): Promise<LedgerReceipt> {
  const { getNetworkDetails, signTransaction } = await import('@stellar/freighter-api')
  if (source !== prepared.source) throw new Error('Reconnect the wallet that prepared this transaction.')
  if (Math.floor(Date.now() / 1000) >= prepared.expiresAt) throw new Error('This transaction expired. Prepare it again.')
  const network = await getNetworkDetails()
  if (network.error || network.networkPassphrase !== Networks.TESTNET) throw new Error('Freighter must be on Stellar Testnet.')
  onProgress('Review the complete transaction in Freighter.')
  const signed = await signTransaction(prepared.xdr, { networkPassphrase: Networks.TESTNET, address: source })
  if (signed.error || !signed.signedTxXdr) throw new Error(signed.error?.message || 'Wallet signature declined.')
  const tx = TransactionBuilder.fromXDR(signed.signedTxXdr, Networks.TESTNET)
  const original = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET)
  if (hex(tx.hash()) !== hex(original.hash())) throw new Error('Wallet returned a different transaction.')
  const sent = await server.sendTransaction(tx)
  if (sent.status === 'ERROR') throw new Error('RPC rejected submission. No successful execution was recorded.')
  if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') throw new Error('RPC did not accept submission. Prepare the intent again before retrying.')
  const hash = sent.hash
  onSubmitted?.(hash)
  onProgress(`Submitted ${hash.slice(0, 12)}… Waiting for ledger confirmation.`)
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1500))
    let result: LedgerReceipt
    try { result = await transactionStatus(hash) } catch { return { hash, status: 'pending' } }
    if (result.status !== 'pending') return result
  }
  return { hash, status: 'pending' }
}

export async function submitIntent(source: string, prepared: Prepared, onProgress: (message: string) => void) {
  const receipt = await submitTransaction(source, prepared, onProgress)
  const outcome = receipt.value as { spent: bigint; received: bigint } | undefined
  return { ...receipt, spent: outcome?.spent, received: outcome?.received }
}
