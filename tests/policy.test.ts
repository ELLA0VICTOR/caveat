import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { fromUnits, toUnits } from '../src/lib/policy.ts'

test('amounts use exact integers, including above Number precision', () => {
  assert.equal(toUnits('100.0000001'), 1000000001n)
  assert.equal(fromUnits(toUnits('9007199254740993.1234567')), '9007199254740993.1234567')
  assert.equal(toUnits('1.123456', 6), 1123456n)
  for (const input of ['-1', '0', 'NaN', 'Infinity', '1e9', '1.00000001', '']) assert.throws(() => toUnits(input))
  assert.throws(() => toUnits((1n << 127n).toString(), 0))
})