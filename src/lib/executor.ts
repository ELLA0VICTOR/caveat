import { CaveatClient } from '@caveat/sdk'
import type { Action, SwapDirection } from '@caveat/sdk'
import { fromUnits, toUnits } from '@caveat/sdk'
import type { Venue } from './venues'
export const executor = new CaveatClient()
export const quoteAction = (action: Action, amount: string, direction: SwapDirection, venue: Venue = 'soroswap') => {
  if (action !== 'swap' || venue === 'soroswap') return executor.quote(action, amount, direction)
  const units = toUnits(amount)
  if (units > 10_000_000n) throw new Error('Use up to 1 XLM for the funded test contracts.')
  // Declared fixture terms; these artificial rates are explicitly labelled in the form.
  return Promise.resolve({ expected: fromUnits(units * 2n), minimum: fromUnits(units * 19n / 10n) })
}
