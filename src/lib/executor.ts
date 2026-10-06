import { CaveatClient } from '@caveat/sdk'
import type { Action, SwapDirection } from '@caveat/sdk'
export const executor = new CaveatClient()
export const quoteAction = (action: Action, amount: string, direction: SwapDirection) => executor.quote(action, amount, direction)
