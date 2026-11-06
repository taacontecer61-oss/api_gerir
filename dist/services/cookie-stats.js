import { and, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cookieConsents, cookieNoticeReceipts } from '../db/schema/index.js';
import { badRequest } from '../lib/errors.js';
import { luandaDay, shiftDay } from './analytics.js';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function assertRange(from, to) {
    if (!DAY.test(from) || !DAY.test(to) || from > to) {
        throw badRequest('INVALID_RANGE', 'O intervalo de datas é inválido.');
    }
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || (end - start) / 86_400_000 > 366) {
        throw badRequest('INVALID_RANGE', 'O intervalo não pode ultrapassar 366 dias.');
    }
}
export async function getConsentStats(from = '', to = '') {
    const end = to || luandaDay();
    const start = from || shiftDay(end, -29);
    assertRange(start, end);
    const decisions = await db
        .select({
        day: cookieConsents.day,
        action: cookieConsents.action,
        visitorId: cookieConsents.visitorId,
        preferences: cookieConsents.preferences,
        analytics: cookieConsents.analytics,
        marketing: cookieConsents.marketing,
        personalization: cookieConsents.personalization,
        createdAt: cookieConsents.createdAt,
    })
        .from(cookieConsents)
        .where(and(gte(cookieConsents.day, start), lte(cookieConsents.day, end)));
    const notices = await db
        .select({
        day: cookieNoticeReceipts.day,
        visitorId: cookieNoticeReceipts.visitorId,
    })
        .from(cookieNoticeReceipts)
        .where(and(gte(cookieNoticeReceipts.day, start), lte(cookieNoticeReceipts.day, end)));
    const latestByVisitor = new Map();
    for (const row of decisions) {
        const current = latestByVisitor.get(row.visitorId);
        if (!current || current.createdAt.getTime() <= row.createdAt.getTime()) {
            latestByVisitor.set(row.visitorId, row);
        }
    }
    const latest = [...latestByVisitor.values()];
    const decidedVisitors = new Set(latest.map((row) => row.visitorId));
    const noticeVisitors = new Set(notices.map((row) => row.visitorId));
    let undecided = 0;
    for (const visitorId of noticeVisitors) {
        if (!decidedVisitors.has(visitorId))
            undecided += 1;
    }
    const countAction = (action) => latest.filter((row) => row.action === action).length;
    const decided = latest.length;
    const percent = (value) => (decided === 0 ? 0 : Math.round((value / decided) * 1000) / 10);
    const enabled = (key) => latest.filter((row) => row[key]).length;
    const byDay = new Map();
    for (let day = start, guard = 0; day <= end && guard < 400; day = shiftDay(day, 1), guard += 1) {
        byDay.set(day, { day, notices: 0, acceptAll: 0, reject: 0, custom: 0, withdraw: 0 });
    }
    for (const notice of notices) {
        const bucket = byDay.get(notice.day);
        if (bucket)
            bucket.notices += 1;
    }
    for (const row of decisions) {
        const bucket = byDay.get(row.day);
        if (!bucket)
            continue;
        if (row.action === 'accept_all')
            bucket.acceptAll += 1;
        else if (row.action === 'reject_optional')
            bucket.reject += 1;
        else if (row.action === 'custom')
            bucket.custom += 1;
        else if (row.action === 'withdraw')
            bucket.withdraw += 1;
    }
    const daily = [...byDay.values()];
    return {
        range: { from: start, to: end },
        notices: notices.length,
        decisions: decisions.length,
        visitorsWithDecision: decided,
        visitorsWithoutDecision: undecided,
        acceptAll: countAction('accept_all'),
        rejectOptional: countAction('reject_optional'),
        custom: countAction('custom'),
        withdraw: countAction('withdraw'),
        percentages: {
            acceptAll: percent(countAction('accept_all')),
            rejectOptional: percent(countAction('reject_optional')),
            custom: percent(countAction('custom')),
            withdraw: percent(countAction('withdraw')),
        },
        categories: {
            necessary: { enabled: decided, total: decided },
            preferences: { enabled: enabled('preferences'), total: decided },
            analytics: { enabled: enabled('analytics'), total: decided },
            marketing: { enabled: enabled('marketing'), total: decided },
            personalization: { enabled: enabled('personalization'), total: decided },
        },
        daily,
        weekly: aggregate(daily, 'week'),
        monthly: aggregate(daily, 'month'),
    };
}
function aggregate(daily, mode) {
    const buckets = new Map();
    for (const row of daily) {
        const label = mode === 'month' ? row.day.slice(0, 7) : weekLabel(row.day);
        const current = buckets.get(label) ?? {
            day: label,
            label,
            notices: 0,
            acceptAll: 0,
            reject: 0,
            custom: 0,
            withdraw: 0,
        };
        current.notices += row.notices;
        current.acceptAll += row.acceptAll;
        current.reject += row.reject;
        current.custom += row.custom;
        current.withdraw += row.withdraw;
        buckets.set(label, current);
    }
    return [...buckets.values()];
}
function weekLabel(day) {
    const date = new Date(`${day}T12:00:00Z`);
    const start = new Date(date);
    const weekday = (date.getUTCDay() + 6) % 7;
    start.setUTCDate(date.getUTCDate() - weekday);
    return start.toISOString().slice(0, 10);
}
