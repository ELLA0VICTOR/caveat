export type Scenario = 'honest' | 'underpay' | 'approval'
export type Bounds = { maxSpend: bigint; minReceive: bigint; expiresAt: number; denyApprovals: boolean }
export type Outcome = { spent: bigint; received: bigint; approval: bigint }

export function toUnits(value: string, decimals = 7): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('Unsupported token precision.')
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a positive decimal amount.')
  const [whole, fraction = ''] = value.split('.')
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`)
  const result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  if (result <= 0n || result > (1n << 127n) - 1n) throw new Error('Amount must be positive and fit an i128.')
  return result
}

export function fromUnits(value: bigint, decimals = 7): string {
  const scale = 10n ** BigInt(decimals)
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${value / scale}${fraction ? `.${fraction}` : ''}`
}

export function checkOutcome(bounds: Bounds, outcome: Outcome, now: number): string[] {
  const violations: string[] = []
  if (now > bounds.expiresAt) violations.push('Intent expired')
  if (outcome.spent < 0n || outcome.spent > bounds.maxSpend) violations.push('Maximum spend exceeded')
  if (outcome.received < bounds.minReceive) violations.push('Minimum receipt not met')
  if (!bounds.denyApprovals || outcome.approval !== 0n) violations.push('Token approval forbidden')
  return violations
}

export function demonstrate(amount: bigint, scenario: Scenario): Outcome {
  return { spent: amount, received: scenario === 'underpay' ? amount * 8n / 100n : amount * 1245n / 10000n, approval: scenario === 'approval' ? (1n << 127n) - 1n : 0n }
}
