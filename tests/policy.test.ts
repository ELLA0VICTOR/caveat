import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { checkOutcome, demonstrate, fromUnits, toUnits } from '../src/lib/policy.ts'

test('amounts use exact integers, including above Number precision', () => {
  assert.equal(toUnits('100.0000001'), 1000000001n)
  assert.equal(fromUnits(toUnits('9007199254740993.1234567')), '9007199254740993.1234567')
  assert.equal(toUnits('1.123456', 6), 1123456n)
  for (const input of ['-1', '0', 'NaN', 'Infinity', '1e9', '1.00000001', '']) assert.throws(() => toUnits(input))
  assert.throws(() => toUnits((1n << 127n).toString(), 0))
})
test('honest demonstration passes spending and receipt bounds', () => {
  assert.deepEqual(checkOutcome({ maxSpend: toUnits('100'), minReceive: toUnits('12.30'), expiresAt: 200, denyApprovals: true }, demonstrate(toUnits('100'), 'honest'), 100), [])
})
test('underpayment fails independently of a promised quote', () => {
  assert.deepEqual(checkOutcome({ maxSpend: toUnits('100'), minReceive: toUnits('12.30'), expiresAt: 200, denyApprovals: true }, demonstrate(toUnits('100'), 'underpay'), 100), ['Minimum receipt not met'])
})
test('a good receipt does not excuse an approval attack', () => {
  assert.deepEqual(checkOutcome({ maxSpend: toUnits('100'), minReceive: toUnits('12.30'), expiresAt: 200, denyApprovals: true }, demonstrate(toUnits('100'), 'approval'), 100), ['Token approval forbidden'])
})
test('spend, expiry and approval restrictions are independent and inclusive', () => {
  const bounds = { maxSpend: 100n, minReceive: 90n, expiresAt: 200, denyApprovals: true }
  assert.deepEqual(checkOutcome(bounds, { spent: 100n, received: 90n, approval: 0n }, 200), [])
  assert.deepEqual(checkOutcome(bounds, { spent: 101n, received: 89n, approval: 1n }, 201), ['Intent expired', 'Maximum spend exceeded', 'Minimum receipt not met', 'Token approval forbidden'])
})
