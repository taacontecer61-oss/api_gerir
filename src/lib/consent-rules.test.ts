import assert from 'node:assert/strict'
import test from 'node:test'
import {
  choicesForAction,
  consentIsCurrent,
  isClearableCookieName,
  isInventoryCookieName,
  publicIdError,
} from './consent-rules.ts'
import { jurisdictionBucket } from './jurisdiction.ts'

test('aceitar todos liga as categorias opcionais e rejeitar desliga-as', () => {
  const accepted = choicesForAction('accept_all', { analytics: false })
  assert.equal(accepted.necessary, true)
  assert.equal(accepted.analytics, true)
  assert.equal(accepted.marketing, true)

  const rejected = choicesForAction('reject_optional', { analytics: true })
  assert.equal(rejected.necessary, true)
  assert.equal(rejected.analytics, false)
  assert.equal(rejected.preferences, false)
  assert.equal(rejected.marketing, false)
  assert.equal(rejected.personalization, false)
})

test('personalizar não activa categorias omitidas', () => {
  const custom = choicesForAction('custom', { analytics: true })
  assert.equal(custom.analytics, true)
  assert.equal(custom.marketing, false)
  assert.equal(custom.preferences, false)
  assert.equal(custom.personalization, false)
  assert.equal(choicesForAction('withdraw').analytics, false)
})

test('uma decisão expira ou deixa de valer quando a política muda', () => {
  const now = new Date('2026-11-06T12:00:00Z')
  const record = {
    policyVersion: '2026.1',
    consentVersion: '1',
    expiresAt: new Date('2027-05-05T12:00:00Z'),
    necessary: true,
  }
  assert.equal(
    consentIsCurrent(record, { policyVersion: '2026.1', consentVersion: '1', now }),
    true,
  )
  assert.equal(
    consentIsCurrent(record, { policyVersion: '2026.2', consentVersion: '1', now }),
    false,
  )
  assert.equal(
    consentIsCurrent(
      { ...record, expiresAt: new Date('2026-11-06T11:00:00Z') },
      { policyVersion: '2026.1', consentVersion: '1', now },
    ),
    false,
  )
  assert.equal(
    consentIsCurrent(
      { ...record, necessary: false },
      { policyVersion: '2026.1', consentVersion: '1', now },
    ),
    false,
  )
})

test('o cookie de sessão nunca é apagável e os identificadores externos são validados', () => {
  assert.equal(isClearableCookieName('kn_session'), false)
  assert.equal(isClearableCookieName('kn_vid'), false)
  assert.equal(isClearableCookieName('_ga'), true)
  assert.equal(isClearableCookieName('_ga_*'), true)
  assert.equal(isClearableCookieName('_ga_*_extra'), false)
  assert.equal(isInventoryCookieName('kn_session'), false)
  assert.equal(isInventoryCookieName('fonts.googleapis.com'), true)
  assert.equal(publicIdError('ga4', 'G-AB12'), null)
  assert.equal(publicIdError('ga4', 'UA-1'), 'O identificador do Google Analytics 4 deve ter o formato G-XXXXXXXX.')
  assert.equal(publicIdError('meta_pixel', '12345'), null)
  assert.equal(publicIdError('gtm', 'GTM-ABCD'), null)
  assert.equal(publicIdError('google_ads', 'AW-12345'), null)
  assert.equal(publicIdError('first_party_analytics', ''), null)
  assert.equal(publicIdError('first_party_analytics', 'G-AB12') !== null, true)
  assert.equal(publicIdError('custom_script', 'https://evil.example'), 'Tipo de integração desconhecido.')
})

test('a jurisdição agrupa Angola, a União Europeia e o resto sem guardar o IP', () => {
  assert.equal(jurisdictionBucket('AO'), 'AO')
  assert.equal(jurisdictionBucket('pt'), 'EU')
  assert.equal(jurisdictionBucket('DE'), 'EU')
  assert.equal(jurisdictionBucket('BR'), 'OTHER')
  assert.equal(jurisdictionBucket('XX'), 'UNKNOWN')
  assert.equal(jurisdictionBucket(null), 'UNKNOWN')
})
