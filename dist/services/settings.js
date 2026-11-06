import { inArray } from 'drizzle-orm';
import { env } from '../config.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema/index.js';
import { badRequest } from '../lib/errors.js';
import { requireAll } from '../lib/guards.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { writeAuditLog } from './audit.js';
function stringSetting(label, max, opts) {
    return (value) => {
        if (typeof value !== 'string')
            throw badRequest('INVALID_SETTING', `«${label}» deve ser texto.`);
        const trimmed = value.trim();
        if (!trimmed && !opts?.allowEmpty) {
            throw badRequest('INVALID_SETTING', `«${label}» não pode ficar vazio.`);
        }
        if (trimmed.length > max) {
            throw badRequest('INVALID_SETTING', `«${label}» excede ${max} caracteres.`);
        }
        return trimmed;
    };
}
function booleanSetting(label) {
    return (value) => {
        if (typeof value !== 'boolean') {
            throw badRequest('INVALID_SETTING', `«${label}» deve ser verdadeiro ou falso.`);
        }
        return value;
    };
}
function timezoneSetting(value) {
    const timezone = stringSetting('Fuso horário', 64)(value);
    try {
        new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    }
    catch {
        throw badRequest('INVALID_SETTING', 'Fuso horário inválido (ex.: Africa/Luanda).');
    }
    return timezone;
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
        parse: (value) => {
            const raw = typeof value === 'number' ? String(value) : value;
            const text = stringSetting('Validade do consentimento', 4)(raw);
            const days = Number(text);
            if (!Number.isInteger(days) || days < 30 || days > 730) {
                throw badRequest('INVALID_SETTING', 'A validade do consentimento deve ser um número inteiro entre 30 e 730 dias.');
            }
            return String(days);
        },
    },
};
export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS);
export function isSettingKey(key) {
    return key in SETTING_DEFINITIONS;
}
function decode(raw, fallback) {
    if (raw === undefined)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
/** Todas as definições permitidas, com valor por omissão quando ainda não gravadas. */
export async function getAllSettings() {
    const rows = await db.select().from(settings).where(inArray(settings.key, SETTING_KEYS));
    const stored = new Map(rows.map((row) => [row.key, row.valueJson]));
    return Object.fromEntries(SETTING_KEYS.map((key) => [key, decode(stored.get(key), SETTING_DEFINITIONS[key].default)]));
}
export async function setSetting(user, key, value) {
    requireAll(user, PERMISSIONS.SETTINGS_MANAGE);
    if (!isSettingKey(key)) {
        throw badRequest('INVALID_SETTING_KEY', `A definição «${key}» não é permitida.`);
    }
    const parsed = SETTING_DEFINITIONS[key].parse(value);
    const valueJson = JSON.stringify(parsed);
    await db
        .insert(settings)
        .values({ key, valueJson })
        .onDuplicateKeyUpdate({ set: { valueJson } });
    await writeAuditLog({
        actorUserId: user.id,
        action: 'settings.update',
        entityType: 'settings',
        meta: { key, value: parsed },
    });
    return { key, value: parsed };
}
