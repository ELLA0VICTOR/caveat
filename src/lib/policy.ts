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
