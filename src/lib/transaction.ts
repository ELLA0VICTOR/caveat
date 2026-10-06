export type TransactionKind = 'swap' | 'liquidity' | 'trustline' | 'recovery' | 'setup'
export type TransactionPhase = 'wallet' | 'submitting' | 'pending' | 'confirmed' | 'failed' | 'error'
export type TransactionAmount = { label: string; value: string }
export type TransactionNotice = {
  kind: TransactionKind
  title: string
  phase: TransactionPhase
  detail: string
  hash?: string
  amounts?: TransactionAmount[]
  issue?: string
}

export function transactionHeading(transaction: TransactionNotice) {
  if (transaction.phase === 'wallet') return 'Confirm in Freighter'
  if (transaction.phase === 'submitting') return 'Submitting transaction'
  if (transaction.phase === 'pending') return 'Awaiting confirmation'
  if (transaction.phase === 'failed') return 'Transaction failed'
  if (transaction.phase === 'error') return 'Transaction interrupted'
  return { swap: 'Swap complete', liquidity: 'Liquidity added', trustline: 'Test USDC enabled', recovery: 'Recovery complete', setup: 'Transaction confirmed' }[transaction.kind]
}
