import assert from 'node:assert/strict'
import { test } from 'node:test'
import { booleanFulltext } from './search-text.js'

test('monta uma pesquisa boolean com prefixo e remove operadores', () => {
  assert.equal(booleanFulltext('Angola +"economia"'), 'Angola* economia*')
})

test('ignora palavras curtas e injecção de operadores', () => {
  assert.equal(booleanFulltext(`' OR 1=1 --`), null)
  assert.equal(booleanFulltext('de a'), null)
})
