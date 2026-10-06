import { CaveatClient, MAINNET } from '@caveat/sdk'
import type { ExecutorDeployment } from '@caveat/sdk'
import type { LedgerReceipt } from './stellar'

export type PendingDeployment = { hash: string; deployment: ExecutorDeployment }
export async function prepareMainnetDeployment(owner: string): Promise<ExecutorDeployment> {
  const response = await fetch(`${import.meta.env.BASE_URL}contracts/caveat_executor.wasm`)
  if (!response.ok) throw new Error('The verified executor WASM is unavailable. Rebuild the application before deploying.')
  return new CaveatClient(undefined, undefined, 'mainnet').prepareDeployment(owner, new Uint8Array(await response.arrayBuffer()))
}
export async function confirmedExecutor(pending: PendingDeployment, receipt: LedgerReceipt): Promise<string | undefined> {
  if (receipt.hash !== pending.hash || pending.deployment.transaction.network !== 'mainnet') throw new Error('Deployment checkpoint belongs to a different transaction or network.')
  if (receipt.status !== 'confirmed' || pending.deployment.kind === 'upload') return undefined
  if (typeof receipt.value !== 'string' || receipt.value !== pending.deployment.executor) throw new Error('Confirmed deployment address differs from the reviewed transaction.')
  const client = new CaveatClient(receipt.value, MAINNET.executorHash, 'mainnet')
  await client.verifyExecutor()
  return client.executor
}
