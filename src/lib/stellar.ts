import { Address, BASE_FEE, Contract, Networks, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk'
import { toUnits } from './policy.ts'

export const RPC_URL = 'https://soroban-testnet.stellar.org'
export const DEFAULT_ROUTER = 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD'
const server = new rpc.Server(RPC_URL)
export type Deployment = { account: string; router: string; input: string; output: string }
export type Intent = { amount: string; minimum: string; minutes: number }
export type Prepared = { xdr: string; expiresAt: number; spentBefore: bigint; receivedBefore: bigint; nonce: bigint; inputDecimals: number; outputDecimals: number; pair: string }

export function validateDeployment(config: Deployment) {
  for (const [name, address] of Object.entries(config)) {
    if (!StrKey.isValidContract(address)) throw new Error(`Enter a valid contract address for ${name}.`)
  }
  if (config.input === config.output) throw new Error('Input and output contracts must be different.')
}

export function encodePolicy(config: Deployment, amount: bigint, minimum: bigint, nonce: bigint, pair: string, expiresAt: number): xdr.ScVal {
  const address = (value: string) => new Address(value).toScVal()
  return nativeToScVal({
    amount_in: nativeToScVal(amount, { type: 'i128' }),
    deny_approvals: nativeToScVal(true),
    expires_at: nativeToScVal(expiresAt, { type: 'u64' }),
    max_spend: nativeToScVal(amount, { type: 'i128' }),
    min_receive: nativeToScVal(minimum, { type: 'i128' }),
    nonce: nativeToScVal(nonce, { type: 'u64' }),
    pair: address(pair), router: address(config.router), token_in: address(config.input), token_out: address(config.output),
  })
}

export async function connectWallet(): Promise<string> {
  const { requestAccess, getNetworkDetails } = await import('@stellar/freighter-api')
  const result = await requestAccess()
  if (result.error || !result.address) throw new Error(result.error?.message || 'Install or unlock Freighter to connect your wallet.')
  const network = await getNetworkDetails()
  if (network.error || network.networkPassphrase !== Networks.TESTNET) throw new Error('Switch Freighter to Stellar Testnet, then reconnect.')
  return result.address
}

async function read(source: string, contract: string, method: string, args: xdr.ScVal[] = []) {
  const account = await server.getAccount(source)
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(contract).call(method, ...args)).setTimeout(60).build()
  const simulation = await server.simulateTransaction(tx)
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) throw new Error(`Cannot read ${method}. ${'error' in simulation ? simulation.error : 'Contract not available on testnet.'}`)
  return scValToNative(simulation.result.retval)
}

export async function prepareIntent(source: string, config: Deployment, intent: Intent): Promise<Prepared> {
  validateDeployment(config)
  if (!Number.isInteger(intent.minutes) || intent.minutes < 1 || intent.minutes > 60) throw new Error('Expiry must be 1–60 minutes.')
  const address = (value: string) => new Address(value).toScVal()
  const [owner, nonce, inputDecimals, outputDecimals, pair, spentBefore, receivedBefore] = await Promise.all([
    read(source, config.account, 'owner'), read(source, config.account, 'nonce'),
    read(source, config.input, 'decimals'), read(source, config.output, 'decimals'),
    read(source, config.router, 'router_pair_for', [address(config.input), address(config.output)]),
    read(source, config.input, 'balance', [address(config.account)]), read(source, config.output, 'balance', [address(config.account)]),
  ])
  if (owner !== source) throw new Error('Connected wallet is not the owner of this Caveat account.')
  const amount = toUnits(intent.amount, Number(inputDecimals))
  const minimum = toUnits(intent.minimum, Number(outputDecimals))
  if (BigInt(spentBefore) < amount) throw new Error('Fund the Caveat contract with the input token before swapping.')
  const expiresAt = Math.floor(Date.now() / 1000) + intent.minutes * 60
  const policy = encodePolicy(config, amount, minimum, BigInt(nonce), String(pair), expiresAt)
  const account = await server.getAccount(source)
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(config.account).call('execute', policy)).setTimeout(intent.minutes * 60).build()
  const simulation = await server.simulateTransaction(tx)
  if (!rpc.Api.isSimulationSuccess(simulation)) throw new Error(`Guard simulation rejected the intent: ${'error' in simulation ? simulation.error : 'Unknown RPC failure'}`)
  const prepared = rpc.assembleTransaction(tx, simulation).build()
  return { xdr: prepared.toXDR(), expiresAt, spentBefore: BigInt(spentBefore), receivedBefore: BigInt(receivedBefore), nonce: BigInt(nonce), inputDecimals: Number(inputDecimals), outputDecimals: Number(outputDecimals), pair: String(pair) }
}

export async function submitIntent(source: string, prepared: Prepared, onProgress: (message: string) => void): Promise<{ hash: string; status: 'confirmed' | 'failed' | 'pending'; spent?: bigint; received?: bigint }> {
  const { getNetworkDetails, signTransaction } = await import('@stellar/freighter-api')
  if (Math.floor(Date.now() / 1000) >= prepared.expiresAt) throw new Error('This intent expired. Prepare a fresh intent.')
  const network = await getNetworkDetails()
  if (network.error || network.networkPassphrase !== Networks.TESTNET) throw new Error('Freighter must be on Stellar Testnet.')
  onProgress('Review the complete transaction in Freighter.')
  const signed = await signTransaction(prepared.xdr, { networkPassphrase: Networks.TESTNET, address: source })
  if (signed.error || !signed.signedTxXdr) throw new Error(signed.error?.message || 'Wallet signature declined.')
  const tx = TransactionBuilder.fromXDR(signed.signedTxXdr, Networks.TESTNET)
  const original = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET)
  const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  if (hex(tx.hash()) !== hex(original.hash())) throw new Error('Wallet returned a different transaction.')
  const sent = await server.sendTransaction(tx)
  if (sent.status === 'ERROR') throw new Error('RPC rejected submission. No successful execution was recorded.')
  if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') throw new Error('RPC did not accept submission. Prepare the intent again before retrying.')
  const hash = sent.hash
  onProgress(`Submitted ${hash.slice(0, 12)}… Waiting for ledger confirmation.`)
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1500))
    let result: Awaited<ReturnType<typeof server.getTransaction>>
    try { result = await server.getTransaction(hash) } catch { return { hash, status: 'pending' } }
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      try {
        const outcome = result.returnValue ? scValToNative(result.returnValue) : undefined
        return { hash, status: 'confirmed', spent: outcome ? BigInt(outcome.spent) : undefined, received: outcome ? BigInt(outcome.received) : undefined }
      } catch { return { hash, status: 'confirmed' } }
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) return { hash, status: 'failed' }
  }
  return { hash, status: 'pending' }
}
