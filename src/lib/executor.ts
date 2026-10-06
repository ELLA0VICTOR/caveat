import { CaveatClient } from '@caveat/sdk'
import type { Action, NetworkId, SwapDirection } from '@caveat/sdk'
import { fromUnits, toUnits } from '@caveat/sdk'
import type { Venue } from './venues'
export const executor = new CaveatClient()
export const clientFor = (network: NetworkId, executorId?: string) => network === 'testnet' ? executor : new CaveatClient(executorId || undefined, undefined, network)
export const quoteAction = (action: Action, amount: string, direction: SwapDirection, venue: Venue = 'soroswap', network: NetworkId = 'testnet') => {
  if (network === 'mainnet' && venue !== 'soroswap') throw new Error('Security test contracts are available only on Testnet.')
  if (action !== 'swap' || venue === 'soroswap') return clientFor(network).quote(action, amount, direction)
  const units = toUnits(amount)
  if (units > 10_000_000n) throw new Error('Use up to 1 XLM for the funded test contracts.')
  // Declared fixture terms; these artificial rates are explicitly labelled in the form.
  return Promise.resolve({ expected: fromUnits(units * 2n), minimum: fromUnits(units * 19n / 10n) })
}
