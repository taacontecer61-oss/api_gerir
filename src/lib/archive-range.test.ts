import assert from 'node:assert/strict'
import { test } from 'node:test'
import { archiveRange } from './archive-range.js'

test('um dia em Luanda começa às 23:00 UTC do dia anterior', () => {
  const { from, to } = archiveRange(2026, 11, 6)
  assert.equal(from.toISOString(), '2026-11-05T23:00:00.000Z')
  assert.equal(to.toISOString(), '2026-11-06T23:00:00.000Z')
})
