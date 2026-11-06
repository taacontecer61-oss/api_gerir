/** Slugs que colidem com rotas públicas fixas do frontend. */
export const RESERVED_ARTICLE_SLUGS = new Set([
    'politica',
    'economia',
    'sociedade',
    'internacional',
    'desporto',
    'cultura',
    'entretenimento',
    'tecnologia',
    'pesquisa',
    'arquivo',
    'videos',
    'galeria',
    'em-direto',
    'tendencias',
    'sobre-nos',
    'contactos',
    'publicidade',
    'termos-e-condicoes',
    'politica-de-privacidade',
    'politica-de-cookies',
    'admin',
    'api',
    'media',
]);
export function isReservedSlug(slug) {
    return RESERVED_ARTICLE_SLUGS.has(slug.toLowerCase());
}
