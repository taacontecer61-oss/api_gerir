/**
 * Agrupa o país já resolvido pelo pedido numa jurisdição grosseira.
 * Não guarda o endereço IP. A mesma regra de opt-in aplica-se a todos os grupos
 * até haver validação jurídica em contrário.
 */
const EU_EEA_UK = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
    'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    'IS', 'LI', 'NO',
    'GB',
]);
export const JURISDICTIONS = ['AO', 'EU', 'OTHER', 'UNKNOWN'];
export function jurisdictionBucket(countryCode) {
    const code = (countryCode ?? '').trim().toUpperCase();
    if (!code || code === 'XX')
        return 'UNKNOWN';
    if (code === 'AO')
        return 'AO';
    if (EU_EEA_UK.has(code))
        return 'EU';
    return 'OTHER';
}
export function jurisdictionLabel(bucket) {
    if (bucket === 'AO')
        return 'Angola';
    if (bucket === 'EU')
        return 'União Europeia, EEE ou Reino Unido';
    if (bucket === 'OTHER')
        return 'Outra jurisdição';
    return 'Jurisdição não determinada';
}
/** Opt-in estrito para categorias opcionais, em todas as jurisdições, até revisão jurídica. */
export function consentRules(bucket) {
    return {
        jurisdiction: bucket,
        jurisdictionLabel: jurisdictionLabel(bucket),
        strictOptIn: true,
    };
}
