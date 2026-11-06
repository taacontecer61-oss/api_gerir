/**
 * Regras puras do consentimento. A validade jurídica concreta deve ser revista
 * por um jurista; aqui só está a lógica técnica do produto.
 */
export const CONSENT_SYSTEM_VERSION = '1';
export const DEFAULT_TTL_DAYS = 180;
export const MIN_TTL_DAYS = 30;
export const MAX_TTL_DAYS = 730;
export const RETENTION_GRACE_DAYS = 30;
export const CONSENT_ACTIONS = ['accept_all', 'reject_optional', 'custom', 'withdraw'];
export const CATEGORY_SLUGS = [
    'necessary',
    'preferences',
    'analytics',
    'marketing',
    'personalization',
];
export const COOKIE_TYPES = ['first_party', 'third_party', 'storage', 'resource'];
export const INTEGRATION_TYPES = [
    'first_party_analytics',
    'ga4',
    'gtm',
    'meta_pixel',
    'google_ads',
];
const PROTECTED_COOKIE_NAMES = new Set(['kn_session', 'kn_vid', 'kn_cc']);
export function isProtectedCookieName(name) {
    const base = name.replace(/\*$/, '').trim().toLowerCase();
    return PROTECTED_COOKIE_NAMES.has(base) || base.startsWith('kn_session');
}
/** Nomes de cookie que o portal pode tentar apagar no próprio domínio. */
export function isClearableCookieName(name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120 || isProtectedCookieName(trimmed))
        return false;
    const star = trimmed.indexOf('*');
    if (star !== -1 && (star !== trimmed.length - 1 || trimmed.indexOf('*') !== trimmed.lastIndexOf('*'))) {
        return false;
    }
    const body = trimmed.endsWith('*') ? trimmed.slice(0, -1) : trimmed;
    if (!body || !/^[\w!#$%&'*+\-.^`|~]+$/.test(body))
        return false;
    return true;
}
/** Nome documentado no inventário. Recusa o cookie de sessão e caracteres perigosos. */
export function isInventoryCookieName(name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120)
        return false;
    if (/[\u0000-\u001f<>]/.test(trimmed))
        return false;
    if (trimmed.toLowerCase() === 'kn_session' || trimmed.toLowerCase().startsWith('kn_session')) {
        return false;
    }
    return true;
}
export function choicesForAction(action, custom) {
    if (action === 'accept_all') {
        return {
            necessary: true,
            preferences: true,
            analytics: true,
            marketing: true,
            personalization: true,
        };
    }
    if (action === 'reject_optional' || action === 'withdraw') {
        return {
            necessary: true,
            preferences: false,
            analytics: false,
            marketing: false,
            personalization: false,
        };
    }
    return {
        necessary: true,
        preferences: custom?.preferences === true,
        analytics: custom?.analytics === true,
        marketing: custom?.marketing === true,
        personalization: custom?.personalization === true,
    };
}
export function consentIsCurrent(record, required) {
    if (!record.necessary)
        return false;
    if (record.consentVersion !== required.consentVersion)
        return false;
    if (record.policyVersion !== required.policyVersion)
        return false;
    const expires = record.expiresAt instanceof Date ? record.expiresAt : new Date(record.expiresAt);
    const now = required.now ?? new Date();
    return expires.getTime() > now.getTime();
}
export function publicIdError(type, publicId) {
    const id = publicId.trim();
    if (!INTEGRATION_TYPES.includes(type)) {
        return 'Tipo de integração desconhecido.';
    }
    if (type === 'first_party_analytics') {
        return id ? 'A medição interna não usa um identificador externo.' : null;
    }
    if (type === 'ga4') {
        return /^G-[A-Z0-9]{4,20}$/.test(id)
            ? null
            : 'O identificador do Google Analytics 4 deve ter o formato G-XXXXXXXX.';
    }
    if (type === 'gtm') {
        return /^GTM-[A-Z0-9]{4,20}$/.test(id)
            ? null
            : 'O contentor do Google Tag Manager deve ter o formato GTM-XXXX.';
    }
    if (type === 'meta_pixel') {
        return /^\d{5,20}$/.test(id) ? null : 'O identificador do Meta Pixel deve ser numérico.';
    }
    if (type === 'google_ads') {
        return /^AW-\d{5,20}$/.test(id)
            ? null
            : 'A etiqueta do Google Ads deve ter o formato AW-123456789.';
    }
    return 'Tipo de integração desconhecido.';
}
/** Cookies que o script oficial pode escrever no domínio do portal depois do consentimento. */
export const VENDOR_COOKIES = {
    ga4: [
        {
            name: '_ga',
            duration: '2 anos',
            purpose: 'Distingue navegadores na medição do Google Analytics 4.',
        },
        {
            name: '_ga_*',
            duration: '2 anos',
            purpose: 'Mantém o estado da sessão do Google Analytics 4.',
        },
        {
            name: '_gid',
            duration: '24 horas',
            purpose: 'Distingue navegadores ao longo de um dia no Google Analytics.',
        },
    ],
    google_ads: [
        {
            name: '_gcl_au',
            duration: '90 dias',
            purpose: 'Mede conversões de campanhas Google Ads no domínio do portal.',
        },
    ],
    meta_pixel: [
        {
            name: '_fbp',
            duration: '90 dias',
            purpose: 'Identificador do Meta Pixel no domínio do portal.',
        },
        {
            name: '_fbc',
            duration: '90 dias',
            purpose: 'Guarda um identificador de clique em anúncios Meta, quando existe.',
        },
    ],
};
