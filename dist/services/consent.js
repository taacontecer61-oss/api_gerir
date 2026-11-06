import { desc, eq, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cookieConsents, cookieNoticeReceipts } from '../db/schema/index.js';
import { CONSENT_SYSTEM_VERSION, RETENTION_GRACE_DAYS, choicesForAction, consentIsCurrent, } from '../lib/consent-rules.js';
import { conflict, badRequest } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { luandaDay } from './analytics.js';
import { activeCategorySet, ensureCookieCatalog, getConsentTtlDays, getMaterialPolicyVersion, listCategories, } from './cookie-catalog.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function assertVisitorId(value) {
    if (!UUID.test(value)) {
        throw badRequest('INVALID_VISITOR', 'O identificador do visitante é inválido.');
    }
    return value;
}
function flag(value) {
    return value === true || value === 1;
}
function presentConsent(row, current) {
    return {
        visitorId: row.visitorId,
        consentVersion: row.consentVersion,
        policyVersion: row.policyVersion,
        necessary: true,
        preferences: flag(row.preferences),
        analytics: flag(row.analytics),
        marketing: flag(row.marketing),
        personalization: flag(row.personalization),
        action: row.action,
        jurisdiction: row.jurisdiction,
        decidedAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        current,
    };
}
async function latestConsent(visitorId) {
    const [row] = await db
        .select()
        .from(cookieConsents)
        .where(eq(cookieConsents.visitorId, visitorId))
        .orderBy(desc(cookieConsents.createdAt))
        .limit(1);
    return row ?? null;
}
export async function getConsentPreferences(visitorId) {
    await ensureCookieCatalog();
    assertVisitorId(visitorId);
    const row = await latestConsent(visitorId);
    if (!row)
        return { preferences: null };
    const material = await getMaterialPolicyVersion();
    const current = consentIsCurrent({ ...row, necessary: flag(row.necessary) }, {
        policyVersion: material,
        consentVersion: CONSENT_SYSTEM_VERSION,
    });
    return { preferences: presentConsent(row, current) };
}
async function maskInactive(choices) {
    const categories = await listCategories();
    const active = activeCategorySet(categories);
    return {
        necessary: true,
        preferences: active.has('preferences') ? choices.preferences : false,
        analytics: active.has('analytics') ? choices.analytics : false,
        marketing: active.has('marketing') ? choices.marketing : false,
        personalization: active.has('personalization') ? choices.personalization : false,
    };
}
export async function recordConsent(input) {
    await ensureCookieCatalog();
    assertVisitorId(input.visitorId);
    const material = await getMaterialPolicyVersion();
    if (input.policyVersion !== material) {
        throw conflict('POLICY_OUTDATED', 'A política de cookies foi actualizada. Confirme novamente a sua escolha.', { policyVersion: material });
    }
    const choices = await maskInactive(choicesForAction(input.action, input.preferences));
    const ttlDays = await getConsentTtlDays();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    const id = newId();
    await db.insert(cookieConsents).values({
        id,
        visitorId: input.visitorId,
        userId: input.userId ?? null,
        consentVersion: CONSENT_SYSTEM_VERSION,
        policyVersion: material,
        ...choices,
        action: input.action,
        jurisdiction: input.jurisdiction,
        day: luandaDay(now),
        expiresAt,
    });
    const [row] = await db.select().from(cookieConsents).where(eq(cookieConsents.id, id)).limit(1);
    return {
        ...presentConsent(row, true),
        ttlDays,
    };
}
export async function withdrawConsent(input) {
    return recordConsent({
        visitorId: input.visitorId,
        action: 'withdraw',
        policyVersion: input.policyVersion,
        jurisdiction: input.jurisdiction,
        userId: input.userId,
    });
}
export async function recordNotice(visitorId, policyVersion) {
    await ensureCookieCatalog();
    assertVisitorId(visitorId);
    const material = await getMaterialPolicyVersion();
    if (policyVersion !== material)
        return { recorded: false, policyVersion: material };
    await db
        .insert(cookieNoticeReceipts)
        .ignore()
        .values({
        id: newId(),
        visitorId,
        policyVersion: material,
        day: luandaDay(),
    });
    return { recorded: true, policyVersion: material };
}
export async function hasCategoryConsent(visitorId, category) {
    if (!UUID.test(visitorId))
        return false;
    try {
        await ensureCookieCatalog();
    }
    catch {
        return false;
    }
    const row = await latestConsent(visitorId);
    if (!row)
        return false;
    const material = await getMaterialPolicyVersion();
    if (!consentIsCurrent({ ...row, necessary: flag(row.necessary) }, {
        policyVersion: material,
        consentVersion: CONSENT_SYSTEM_VERSION,
    })) {
        return false;
    }
    return flag(row[category]);
}
/** Remove decisões expiradas depois do período de graça, e avisos com a mesma idade. */
export async function purgeExpiredConsents() {
    const cutoff = new Date(Date.now() - RETENTION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    await db.delete(cookieConsents).where(lt(cookieConsents.expiresAt, cutoff));
    await db.delete(cookieNoticeReceipts).where(lt(cookieNoticeReceipts.createdAt, cutoff));
}
