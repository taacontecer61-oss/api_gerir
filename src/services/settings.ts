import { inArray } from 'drizzle-orm'
import { env } from '../config.js'
import { db } from '../db/index.js'
import { settings } from '../db/schema/index.js'
import { badRequest } from '../lib/errors.js'
import { requireAll } from '../lib/guards.js'
import { PERMISSIONS } from '../lib/permissions.js'
import type { AuthUser } from './auth.js'
import { writeAuditLog } from './audit.js'

type SettingDefinition = {
  default: string | boolean
  parse: (value: unknown) => string | boolean
}

function stringSetting(label: string, max: number, opts?: { allowEmpty?: boolean }) {
  return (value: unknown) => {
    if (typeof value !== 'string') throw badRequest('INVALID_SETTING', `«${label}» deve ser texto.`)
    const trimmed = value.trim()
    if (!trimmed && !opts?.allowEmpty) {
      throw badRequest('INVALID_SETTING', `«${label}» não pode ficar vazio.`)
    }
    if (trimmed.length > max) {
      throw badRequest('INVALID_SETTING', `«${label}» excede ${max} caracteres.`)
    }
    return trimmed
  }
}

function booleanSetting(label: string) {
  return (value: unknown) => {
    if (typeof value !== 'boolean') {
      throw badRequest('INVALID_SETTING', `«${label}» deve ser verdadeiro ou falso.`)
    }
    return value
  }
}

function timezoneSetting(value: unknown) {
  const timezone = stringSetting('Fuso horário', 64)(value) as string
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
  } catch {
    throw badRequest('INVALID_SETTING', 'Fuso horário inválido (ex.: Africa/Luanda).')
  }
  return timezone
}

export const SETTING_DEFINITIONS = {
  'site.timezone': { default: env.TIMEZONE, parse: timezoneSetting },
  'site.name': { default: 'Kwanza News', parse: stringSetting('Nome do site', 120) },
  'site.tagline': { default: '', parse: stringSetting('Slogan', 255, { allowEmpty: true }) },
  'editorial.categories_locked': {
    default: true,
    parse: booleanSetting('Categorias bloqueadas'),
  },
  'analytics.enabled': { default: true, parse: booleanSetting('Analítica activa') },
  'consent.ttl_days': {
    default: '180',
    parse: (value: unknown) => {
      const raw = typeof value === 'number' ? String(value) : value
      const text = stringSetting('Validade do consentimento', 4)(raw)
      const days = Number(text)
      if (!Number.isInteger(days) || days < 30 || days > 730) {
        throw badRequest(
          'INVALID_SETTING',
          'A validade do consentimento deve ser um número inteiro entre 30 e 730 dias.',
        )
      }
      return String(days)
    },
  },
} as const satisfies Record<string, SettingDefinition>

export type SettingKey = keyof typeof SETTING_DEFINITIONS

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[]

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTING_DEFINITIONS
}

function decode(raw: string | undefined, fallback: string | boolean) {
  if (raw === undefined) return fallback
  try {
    return JSON.parse(raw) as string | boolean
  } catch {
    return fallback
  }
}

/** Todas as definições permitidas, com valor por omissão quando ainda não gravadas. */
export async function getAllSettings() {
  const rows = await db.select().from(settings).where(inArray(settings.key, SETTING_KEYS))
  const stored = new Map(rows.map((row) => [row.key, row.valueJson]))
  return Object.fromEntries(
    SETTING_KEYS.map((key) => [key, decode(stored.get(key), SETTING_DEFINITIONS[key].default)]),
  ) as Record<SettingKey, string | boolean>
}

export async function setSetting(user: AuthUser, key: string, value: unknown) {
  requireAll(user, PERMISSIONS.SETTINGS_MANAGE)
  if (!isSettingKey(key)) {
    throw badRequest('INVALID_SETTING_KEY', `A definição «${key}» não é permitida.`)
  }
  const parsed = SETTING_DEFINITIONS[key].parse(value)
  const valueJson = JSON.stringify(parsed)
  await db
    .insert(settings)
    .values({ key, valueJson })
    .onDuplicateKeyUpdate({ set: { valueJson } })

  await writeAuditLog({
    actorUserId: user.id,
    action: 'settings.update',
    entityType: 'settings',
    meta: { key, value: parsed },
  })
  return { key, value: parsed }
}
