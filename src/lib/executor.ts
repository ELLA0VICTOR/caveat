import { CaveatClient } from '@caveat/sdk'
import type { Action } from '@caveat/sdk'
export const executor = new CaveatClient()
export const quoteAction = (action: Action, amount: string) => executor.quote(action, amount)
