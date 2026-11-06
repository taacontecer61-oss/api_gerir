import geoip from 'geoip-lite';
const COUNTRY_CODE = /^[A-Z]{2}$/;
const UNKNOWN = 'XX';
const HEADER_KEYS = [
    'cf-ipcountry',
    'cloudfront-viewer-country',
    'x-vercel-ip-country',
    'x-country-code',
    'x-geo-country',
];
function normalizeCountry(value) {
    if (!value)
        return null;
    const code = value.trim().toUpperCase();
    if (code === 'XX' || code === 'T1' || code === 'A1' || code === 'A2')
        return UNKNOWN;
    return COUNTRY_CODE.test(code) ? code : null;
}
function isPrivateOrLocalIp(ip) {
    const value = ip.replace(/^::ffff:/i, '');
    if (value === '::1' || value === '127.0.0.1' || value === 'localhost')
        return true;
    if (value.startsWith('10.') || value.startsWith('192.168.') || value.startsWith('169.254.')) {
        return true;
    }
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value))
        return true;
    if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80'))
        return true;
    return false;
}
/**
 * Código ISO 3166-1 alpha-2 do visitante.
 * Preferência: cabeçalhos de CDN/proxy; senão GeoIP local. Sem PII persistido.
 */
export function resolveCountryCode(headers, ip) {
    for (const key of HEADER_KEYS) {
        const raw = headers[key];
        const value = Array.isArray(raw) ? raw[0] : raw;
        const code = normalizeCountry(value);
        if (code)
            return code;
    }
    if (!ip || isPrivateOrLocalIp(ip))
        return UNKNOWN;
    try {
        const lookup = geoip.lookup(ip.replace(/^::ffff:/i, ''));
        return normalizeCountry(lookup?.country) ?? UNKNOWN;
    }
    catch {
        return UNKNOWN;
    }
}
const displayNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['pt'], { type: 'region' })
    : null;
/** Nome do país em português (ex.: AO → Angola). */
export function countryDisplayName(code) {
    if (!code || code === UNKNOWN)
        return 'Desconhecido';
    try {
        return displayNames?.of(code) ?? code;
    }
    catch {
        return code;
    }
}
