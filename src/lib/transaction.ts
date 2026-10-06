import type { NetworkId } from '@caveat/sdk'

export type TransactionKind = 'swap' | 'liquidity' | 'trustline' | 'recovery' | 'setup'
export type TransactionPhase = 'wallet' | 'submitting' | 'pending' | 'confirmed' | 'failed' | 'error' | 'checking' | 'blocked' | 'allowed'
export type TransactionAmount = { label: string; value: string }
export type TransactionNotice = {
  kind: TransactionKind
  title: string
  phase: TransactionPhase
  detail: string
  hash?: string
  amounts?: TransactionAmount[]
  issue?: string
  network?: NetworkId
  verification?: { guard: string; venue: string; ledger?: number }
}

export function transactionHeading(transaction: TransactionNotice) {
  if (transaction.phase === 'checking') return 'Checking test contract'
  if (transaction.phase === 'blocked') return 'Blocked by Caveat'
  if (transaction.phase === 'allowed') return 'Conditions satisfied'
  if (transaction.phase === 'wallet') return 'Confirm in Freighter'
  if (transaction.phase === 'submitting') return 'Submitting transaction'
  if (transaction.phase === 'pending') return 'Awaiting confirmation'
  if (transaction.phase === 'failed') return 'Transaction failed'
  if (transaction.phase === 'error') return 'Transaction interrupted'
  return { swap: 'Swap complete', liquidity: 'Liquidity added', trustline: transaction.network === 'mainnet' ? 'USDC enabled' : 'Test USDC enabled', recovery: 'Recovery complete', setup: 'Transaction confirmed' }[transaction.kind]
}
