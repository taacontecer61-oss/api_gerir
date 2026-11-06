import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cookieCategories, cookieIntegrations, cookieInventory, cookiePolicyVersions, } from '../db/schema/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { slugify } from '../lib/slugify.js';
import { writeAuditLog } from './audit.js';
import { getAllSettings } from './settings.js';
import { CATEGORY_SLUGS, CONSENT_SYSTEM_VERSION, COOKIE_TYPES, DEFAULT_TTL_DAYS, INTEGRATION_TYPES, MAX_TTL_DAYS, MIN_TTL_DAYS, VENDOR_COOKIES, isClearableCookieName, isInventoryCookieName, publicIdError, } from '../lib/consent-rules.js';
import { consentRules } from '../lib/jurisdiction.js';
const POLICY_VERSION = '2026.1';
const POLICY_ID = 'c0a00006-0000-4000-8000-000000000006';
const CATEGORY_SEED = [
    {
        id: 'c0a00001-0000-4000-8000-000000000001',
        slug: 'necessary',
        name: 'Necessários',
        description: 'Indispensáveis para o funcionamento e a segurança do portal, incluindo a memorização desta escolha.',
        purpose: 'Manter a sessão administrativa, proteger o acesso à redacção e recordar a decisão de cookies neste navegador.',
        examples: 'Cookie de sessão kn_session no painel; identificador local da decisão de consentimento.',
        isEssential: true,
        sortOrder: 1,
    },
    {
        id: 'c0a00002-0000-4000-8000-000000000002',
        slug: 'preferences',
        name: 'Preferências',
        description: 'Memorizam escolhas de apresentação feitas pelo visitante.',
        purpose: 'Guardar idioma, tema ou outras preferências de visualização, quando essas opções existirem.',
        examples: 'Nenhum cookie de preferências está activo no portal neste momento.',
        isEssential: false,
        sortOrder: 2,
    },
    {
        id: 'c0a00003-0000-4000-8000-000000000003',
        slug: 'analytics',
        name: 'Estatísticas',
        description: 'Ajudam a perceber, de forma agregada, como os conteúdos são consultados.',
        purpose: 'Medir visitas, páginas vistas e origem aproximada do tráfego, sem usar esses dados para publicidade.',
        examples: 'Medição interna de visualizações, apenas depois da autorização. Google Analytics 4, se for configurado pela redacção.',
        isEssential: false,
        sortOrder: 3,
    },
    {
        id: 'c0a00004-0000-4000-8000-000000000004',
        slug: 'marketing',
        name: 'Marketing',
        description: 'Medem campanhas e permitem conteúdos ou anúncios de terceiros.',
        purpose: 'Carregar pixels publicitários, etiquetas de campanhas e leitores de vídeo que podem definir cookies nos seus próprios domínios.',
        examples: 'Meta Pixel ou Google Ads, se forem configurados. Emissões incorporadas do YouTube ou do Vimeo.',
        isEssential: false,
        sortOrder: 4,
    },
    {
        id: 'c0a00005-0000-4000-8000-000000000005',
        slug: 'personalization',
        name: 'Personalização',
        description: 'Permitem adaptar conteúdos ou recomendações aos interesses do visitante.',
        purpose: 'Seleccionar notícias ou módulos em função de leituras anteriores, quando essa funcionalidade existir.',
        examples: 'Nenhum serviço de personalização está activo no portal neste momento.',
        isEssential: false,
        sortOrder: 5,
    },
];
const INVENTORY_SEED = [
    {
        id: 'c0a00010-0000-4000-8000-000000000010',
        categorySlug: 'necessary',
        cookieName: 'kn_session',
        provider: 'Kwanza News',
        purpose: 'Mantém a sessão autenticada da redacção no painel DCI Control. HttpOnly, SameSite=Lax e Secure em produção.',
        duration: 'Até 12 horas (SESSION_TTL_HOURS)',
        domain: 'Domínio da API',
        cookieType: 'first_party',
        requiresConsent: false,
        usedOn: 'Início e fim de sessão do painel administrativo',
    },
    {
        id: 'c0a00011-0000-4000-8000-000000000011',
        categorySlug: 'necessary',
        cookieName: 'kn_vid',
        provider: 'Kwanza News',
        purpose: 'Identificador pseudónimo, gerado no navegador, para associar a decisão de cookies a este dispositivo. Não é um cookie HTTP.',
        duration: 'Até ser apagado no navegador',
        domain: 'localStorage deste site',
        cookieType: 'storage',
        requiresConsent: false,
        usedOn: 'Registo e consulta da decisão de consentimento',
    },
    {
        id: 'c0a00012-0000-4000-8000-000000000012',
        categorySlug: 'necessary',
        cookieName: 'kn_cc',
        provider: 'Kwanza News',
        purpose: 'Cópia local da decisão de cookies, para o portal respeitar a escolha mesmo que a rede falhe. Não é um cookie HTTP.',
        duration: 'Até à expiração da decisão (180 dias por omissão) ou até nova escolha',
        domain: 'localStorage deste site',
        cookieType: 'storage',
        requiresConsent: false,
        usedOn: 'Todas as páginas do portal público',
    },
    {
        id: 'c0a00013-0000-4000-8000-000000000013',
        categorySlug: 'necessary',
        cookieName: 'react-router-scroll-positions',
        provider: 'Kwanza News',
        purpose: 'Restaura a posição de scroll na navegação do portal. SessionStorage técnico do React Router.',
        duration: 'Sessão do separador',
        domain: 'sessionStorage deste site',
        cookieType: 'storage',
        requiresConsent: false,
        usedOn: 'Navegação entre páginas do portal',
    },
    {
        id: 'c0a00014-0000-4000-8000-000000000014',
        categorySlug: 'analytics',
        cookieName: 'kn:view:*',
        provider: 'Kwanza News',
        purpose: 'Evita contar duas vezes a mesma visualização no mesmo separador. Só é escrito depois da autorização de estatísticas.',
        duration: 'Sessão do separador',
        domain: 'sessionStorage deste site',
        cookieType: 'storage',
        requiresConsent: true,
        usedOn: 'Artigos, directos, vídeos e galerias',
    },
    {
        id: 'c0a00015-0000-4000-8000-000000000015',
        categorySlug: 'marketing',
        cookieName: 'youtube.com (cookies do fornecedor)',
        provider: 'YouTube (Google)',
        purpose: 'O leitor incorporado pode definir cookies no domínio youtube.com. O Kwanza News não cria esses cookies e não os consegue apagar.',
        duration: 'Definida pelo YouTube',
        domain: 'youtube.com',
        cookieType: 'third_party',
        requiresConsent: true,
        usedOn: 'Coberturas em directo com emissão do YouTube',
        gateKey: 'youtube-embed',
    },
    {
        id: 'c0a00016-0000-4000-8000-000000000016',
        categorySlug: 'marketing',
        cookieName: 'vimeo.com (cookies do fornecedor)',
        provider: 'Vimeo',
        purpose: 'O leitor incorporado pode definir cookies no domínio vimeo.com. O Kwanza News não cria esses cookies e não os consegue apagar.',
        duration: 'Definida pelo Vimeo',
        domain: 'vimeo.com',
        cookieType: 'third_party',
        requiresConsent: true,
        usedOn: 'Coberturas em directo com emissão do Vimeo',
        gateKey: 'vimeo-embed',
    },
    {
        id: 'c0a00017-0000-4000-8000-000000000017',
        categorySlug: 'necessary',
        cookieName: 'fonts.googleapis.com',
        provider: 'Google Fonts',
        purpose: 'Pedido de tipografia (Source Sans 3 e Source Serif 4). Não foi identificado um cookie criado por este recurso no código. O pedido revela o endereço IP à Google e ocorre antes da escolha. Recomenda-se alojar as fontes no próprio servidor.',
        duration: 'Não aplicável (não é um cookie identificado no código)',
        domain: 'fonts.googleapis.com / fonts.gstatic.com',
        cookieType: 'resource',
        requiresConsent: false,
        usedOn: 'Todas as páginas (index.html)',
    },
];
const POLICY_TEXT = `Esta política descreve os cookies e tecnologias semelhantes usados pelo portal Kwanza News. É um texto operacional para o produto e precisa de validação jurídica antes de ser tratado como documento definitivo.

1. Quem é responsável
O portal Kwanza News é o responsável pelo tratamento realizado através deste site. Os contactos da redacção estão na página Contactos. Esta política não substitui a Política de Privacidade.

2. O que são cookies e tecnologias semelhantes
Cookies são pequenos ficheiros guardados no navegador. O portal também usa armazenamento local (localStorage e sessionStorage) para a decisão de consentimento, para a navegação e, quando autorizado, para não repetir a contagem de uma visualização.

3. Como decidimos
Na primeira visita, ou quando a política muda de forma material, ou quando a decisão expira, apresentamos um aviso. Pode aceitar todos os cookies, rejeitar os não essenciais ou personalizar as categorias. Continuar a ler notícias não é uma aceitação. A escolha vale para este navegador e este dispositivo, durante 180 dias, salvo alteração configurada pela redacção ou nova versão material da política.

4. Categorias
Necessários: sessão da redacção, segurança e memorização da própria decisão. Estão sempre activos e não podem ser desligados no painel.
Preferências: escolhas de apresentação. Neste momento não há nenhum serviço activo nesta categoria.
Estatísticas: medição agregada de audiência. A medição interna só arranca depois da autorização. Google Analytics 4 ou o Google Tag Manager, se a redacção os activar, ficam na categoria que lhes for atribuída e não carregam antes do consentimento.
Marketing: publicidade, remarketing e leitores de vídeo do YouTube e do Vimeo. Não carregam antes da autorização correspondente. Carregar uma emissão concreta autoriza só esse leitor, naquele separador, e não activa os restantes serviços de marketing.
Personalização: recomendações adaptadas. Neste momento não há nenhum serviço activo nesta categoria.

5. O que não está instalado
Na auditoria do código não foram encontrados Google Analytics, Google Tag Manager, Meta Pixel, Google Ads, redes de anúncios externas nem mapas. O espaço publicitário visível no site é uma imagem própria, sem cookies de terceiros. As ligações para redes sociais só contactam essas plataformas se o visitante as abrir.

6. Medição interna
Quando as estatísticas estão autorizadas e a medição está activa, o portal envia o tipo e o identificador do conteúdo visto. O servidor calcula um resumo criptográfico com o dia, o endereço IP e o agente do navegador para aproximar visitantes únicos, e guarda o país de forma agregada. Não guarda o endereço IP completo nem o identificador da decisão de cookies na tabela de audiência. Se a autorização for retirada, o portal deixa de enviar novas visualizações.

7. Cookies de terceiros que não controlamos
O YouTube e o Vimeo podem definir cookies nos domínios deles. O Kwanza News não consegue apagá-los. Pode fazê-lo nas definições do navegador. Ao retirar o consentimento, o portal deixa de carregar esses leitores e pede aos fornecedores que interrompam a medição, quando existe um mecanismo técnico para isso.

8. Retirar ou alterar a escolha
O link «Definições de Cookies» no rodapé reabre o painel em qualquer momento, sem necessidade de conta. Rejeitar os não essenciais ou retirar o consentimento desliga as categorias opcionais e impede novos carregamentos.

9. Conservação
As decisões são conservadas até expirarem e, depois disso, durante mais 30 dias, para prova da escolha. Em seguida são eliminadas. O registo de que o aviso foi mostrado segue o mesmo prazo. Não pedimos nome, e-mail nem outros dados pessoais para guardar uma escolha de cookies.

10. Lei aplicável e outras jurisdições
Em Angola, a Lei n.º 22/11, de 17 de Junho, regula a protecção de dados pessoais. Visitantes na União Europeia, no Espaço Económico Europeu ou no Reino Unido podem ter regras adicionais, incluindo o RGPD. O portal aplica hoje a mesma regra a todos: as categorias opcionais só arrancam com uma escolha afirmativa. Isto não é uma certificação jurídica. A qualificação legal de cada tratamento, os prazos e os textos dirigidos a cada país devem ser revistos por um jurista.

11. Os seus direitos
Pode pedir acesso, rectificação, oposição ou eliminação dos dados pessoais que lhe digam respeito, nos termos da lei aplicável, através dos contactos da redacção. O consentimento de cookies não autoriza outros tratamentos, como o envio de marketing directo ou a cedência de dados a terceiros para fins distintos dos aqui descritos.`;
let ensured = false;
export async function ensureCookieCatalog() {
    if (ensured)
        return;
    for (const category of CATEGORY_SEED) {
        const [existing] = await db
            .select({ id: cookieCategories.id })
            .from(cookieCategories)
            .where(eq(cookieCategories.slug, category.slug))
            .limit(1);
        if (existing)
            continue;
        await db.insert(cookieCategories).values({
            id: category.id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            purpose: category.purpose,
            examples: category.examples,
            isEssential: category.isEssential,
            isActive: true,
            sortOrder: category.sortOrder,
        });
    }
    const categories = await db.select().from(cookieCategories);
    const bySlug = new Map(categories.map((row) => [row.slug, row]));
    for (const item of INVENTORY_SEED) {
        const category = bySlug.get(item.categorySlug);
        if (!category)
            continue;
        const [existing] = await db
            .select({ id: cookieInventory.id })
            .from(cookieInventory)
            .where(and(eq(cookieInventory.cookieName, item.cookieName), eq(cookieInventory.domain, item.domain)))
            .limit(1);
        if (existing)
            continue;
        await db.insert(cookieInventory).values({
            id: item.id,
            categoryId: category.id,
            cookieName: item.cookieName,
            provider: item.provider,
            purpose: item.purpose,
            duration: item.duration,
            domain: item.domain,
            cookieType: item.cookieType,
            requiresConsent: item.requiresConsent,
            isActive: true,
            usedOn: item.usedOn,
            gateKey: item.gateKey ?? null,
        });
    }
    const analytics = bySlug.get('analytics');
    if (analytics) {
        const [existing] = await db
            .select({ id: cookieIntegrations.id })
            .from(cookieIntegrations)
            .where(eq(cookieIntegrations.slug, 'medicao-interna'))
            .limit(1);
        if (!existing) {
            await db.insert(cookieIntegrations).values({
                id: 'c0a00020-0000-4000-8000-000000000020',
                categoryId: analytics.id,
                name: 'Medição interna de visualizações',
                slug: 'medicao-interna',
                provider: 'Kwanza News',
                integrationType: 'first_party_analytics',
                publicId: '',
                purpose: 'Conta visualizações de artigos, directos, vídeos e galerias. Não carrega nenhum script externo.',
                requiresConsent: true,
                isActive: true,
            });
        }
    }
    const [policy] = await db
        .select({ id: cookiePolicyVersions.id })
        .from(cookiePolicyVersions)
        .where(eq(cookiePolicyVersions.version, POLICY_VERSION))
        .limit(1);
    if (!policy) {
        const now = new Date();
        await db.insert(cookiePolicyVersions).values({
            id: POLICY_ID,
            version: POLICY_VERSION,
            title: 'Política de cookies',
            content: POLICY_TEXT,
            changeSummary: 'Versão inicial do sistema de consentimento.',
            requiresReconsent: true,
            isPublished: true,
            effectiveAt: now,
            publishedAt: now,
        });
    }
    ensured = true;
}
export async function getConsentTtlDays() {
    const settings = await getAllSettings();
    const raw = settings['consent.ttl_days'];
    const parsed = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
    if (!Number.isInteger(parsed) || parsed < MIN_TTL_DAYS || parsed > MAX_TTL_DAYS) {
        return DEFAULT_TTL_DAYS;
    }
    return parsed;
}
export async function getMaterialPolicyVersion() {
    const rows = await db
        .select({
        version: cookiePolicyVersions.version,
        requiresReconsent: cookiePolicyVersions.requiresReconsent,
        effectiveAt: cookiePolicyVersions.effectiveAt,
    })
        .from(cookiePolicyVersions)
        .where(eq(cookiePolicyVersions.isPublished, true))
        .orderBy(desc(cookiePolicyVersions.effectiveAt));
    const material = rows.find((row) => row.requiresReconsent) ?? rows[0];
    return material?.version ?? POLICY_VERSION;
}
async function loadCategories() {
    return db.select().from(cookieCategories).orderBy(asc(cookieCategories.sortOrder));
}
function presentCategory(row) {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        purpose: row.purpose,
        examples: row.examples,
        isEssential: row.isEssential,
        isActive: row.isActive,
    };
}
export async function listCategories(options = {}) {
    const rows = await loadCategories();
    const filtered = options.activeOnly ? rows.filter((row) => row.isActive || row.isEssential) : rows;
    return filtered.map(presentCategory);
}
export async function updateCategory(user, id, input, ip) {
    const [row] = await db.select().from(cookieCategories).where(eq(cookieCategories.id, id)).limit(1);
    if (!row)
        throw notFound('Categoria não encontrada.');
    if (input.isActive === false && row.isEssential) {
        throw badRequest('ESSENTIAL_CATEGORY', 'A categoria necessária não pode ser desactivada.');
    }
    const patch = {};
    if (input.description !== undefined)
        patch.description = input.description;
    if (input.purpose !== undefined)
        patch.purpose = input.purpose;
    if (input.examples !== undefined)
        patch.examples = input.examples;
    if (input.isActive !== undefined)
        patch.isActive = input.isActive;
    if (!Object.keys(patch).length)
        return presentCategory(row);
    await db.update(cookieCategories).set(patch).where(eq(cookieCategories.id, id));
    await writeAuditLog({
        actorUserId: user.id,
        action: 'cookies.category.update',
        entityType: 'cookie_category',
        entityId: id,
        meta: patch,
        ip,
    });
    const [next] = await db.select().from(cookieCategories).where(eq(cookieCategories.id, id)).limit(1);
    return presentCategory(next ?? row);
}
function presentInventory(row, categorySlug) {
    return {
        id: row.id,
        categoryId: row.categoryId,
        categorySlug,
        cookieName: row.cookieName,
        provider: row.provider,
        purpose: row.purpose,
        duration: row.duration,
        domain: row.domain,
        cookieType: row.cookieType,
        requiresConsent: row.requiresConsent,
        isActive: row.isActive,
        usedOn: row.usedOn,
        gateKey: row.gateKey,
    };
}
export async function listInventory(options = {}) {
    const rows = await db
        .select({ item: cookieInventory, slug: cookieCategories.slug })
        .from(cookieInventory)
        .innerJoin(cookieCategories, eq(cookieInventory.categoryId, cookieCategories.id))
        .orderBy(asc(cookieCategories.sortOrder), asc(cookieInventory.cookieName));
    return rows
        .filter((row) => !options.activeOnly || row.item.isActive)
        .map((row) => presentInventory(row.item, row.slug));
}
function assertCookieFields(input) {
    if (!isInventoryCookieName(input.cookieName)) {
        throw badRequest('INVALID_COOKIE', 'O nome do cookie ou tecnologia não é válido.');
    }
    if (!COOKIE_TYPES.includes(input.cookieType)) {
        throw badRequest('INVALID_COOKIE_TYPE', 'O tipo de cookie não é válido.');
    }
    if (!input.domain.trim() || input.domain.length > 191 || /[\r\n<>]/.test(input.domain)) {
        throw badRequest('INVALID_DOMAIN', 'O domínio indicado não é válido.');
    }
    if (input.gateKey) {
        if (!/^[a-z0-9-]{3,64}$/.test(input.gateKey)) {
            throw badRequest('INVALID_GATE', 'A chave de bloqueio só pode usar letras minúsculas, números e hífens.');
        }
    }
}
export async function createInventoryItem(user, input, ip) {
    assertCookieFields(input);
    const [category] = await db
        .select()
        .from(cookieCategories)
        .where(eq(cookieCategories.id, input.categoryId))
        .limit(1);
    if (!category)
        throw badRequest('INVALID_CATEGORY', 'A categoria indicada não existe.');
    const requiresConsent = category.isEssential ? input.requiresConsent : true;
    const id = newId();
    try {
        await db.insert(cookieInventory).values({
            id,
            categoryId: category.id,
            cookieName: input.cookieName.trim(),
            provider: input.provider.trim(),
            purpose: input.purpose.trim(),
            duration: input.duration.trim(),
            domain: input.domain.trim(),
            cookieType: input.cookieType,
            requiresConsent,
            isActive: input.isActive,
            usedOn: input.usedOn.trim(),
            gateKey: input.gateKey?.trim() || null,
        });
    }
    catch {
        throw conflict('COOKIE_EXISTS', 'Já existe um registo com este nome e domínio, ou com esta chave de bloqueio.');
    }
    await writeAuditLog({
        actorUserId: user.id,
        action: 'cookies.inventory.create',
        entityType: 'cookie_inventory',
        entityId: id,
        meta: { cookieName: input.cookieName, category: category.slug },
        ip,
    });
    const [created] = await db.select().from(cookieInventory).where(eq(cookieInventory.id, id)).limit(1);
    return presentInventory(created, category.slug);
}
export async function updateInventoryItem(user, id, input, ip) {
    const [current] = await db.select().from(cookieInventory).where(eq(cookieInventory.id, id)).limit(1);
    if (!current)
        throw notFound('Cookie não encontrado.');
    const categoryId = input.categoryId ?? current.categoryId;
    const [category] = await db
        .select()
        .from(cookieCategories)
        .where(eq(cookieCategories.id, categoryId))
        .limit(1);
    if (!category)
        throw badRequest('INVALID_CATEGORY', 'A categoria indicada não existe.');
    const next = {
        cookieName: input.cookieName?.trim() ?? current.cookieName,
        provider: input.provider?.trim() ?? current.provider,
        purpose: input.purpose?.trim() ?? current.purpose,
        duration: input.duration?.trim() ?? current.duration,
        domain: input.domain?.trim() ?? current.domain,
        cookieType: input.cookieType ?? current.cookieType,
        requiresConsent: category.isEssential ? (input.requiresConsent ?? current.requiresConsent) : true,
        isActive: input.isActive ?? current.isActive,
        usedOn: input.usedOn?.trim() ?? current.usedOn,
        gateKey: input.gateKey === undefined ? current.gateKey : input.gateKey?.trim() || null,
    };
    assertCookieFields(next);
    try {
        await db
            .update(cookieInventory)
            .set({ ...next, categoryId: category.id })
            .where(eq(cookieInventory.id, id));
    }
    catch {
        throw conflict('COOKIE_EXISTS', 'Já existe um registo com este nome e domínio, ou com esta chave de bloqueio.');
    }
    await writeAuditLog({
        actorUserId: user.id,
        action: 'cookies.inventory.update',
        entityType: 'cookie_inventory',
        entityId: id,
        meta: { cookieName: next.cookieName, isActive: next.isActive, category: category.slug },
        ip,
    });
    return presentInventory({ ...current, ...next, categoryId: category.id }, category.slug);
}
function presentIntegration(row, categorySlug) {
    return {
        id: row.id,
        categoryId: row.categoryId,
        categorySlug,
        name: row.name,
        slug: row.slug,
        provider: row.provider,
        integrationType: row.integrationType,
        publicId: row.publicId,
        purpose: row.purpose,
        requiresConsent: row.requiresConsent,
        isActive: row.isActive,
    };
}
export async function listIntegrations(options = {}) {
    const rows = await db
        .select({ item: cookieIntegrations, slug: cookieCategories.slug })
        .from(cookieIntegrations)
        .innerJoin(cookieCategories, eq(cookieIntegrations.categoryId, cookieCategories.id))
        .orderBy(asc(cookieIntegrations.name));
    return rows
        .filter((row) => !options.activeOnly || row.item.isActive)
        .map((row) => presentIntegration(row.item, row.slug));
}
async function ensureVendorCookies(categoryId, type) {
    const cookies = VENDOR_COOKIES[type] ?? [];
    for (const cookie of cookies) {
        const [existing] = await db
            .select({ id: cookieInventory.id })
            .from(cookieInventory)
            .where(and(eq(cookieInventory.cookieName, cookie.name), eq(cookieInventory.domain, 'Domínio do portal')))
            .limit(1);
        if (existing)
            continue;
        await db.insert(cookieInventory).values({
            id: newId(),
            categoryId,
            cookieName: cookie.name,
            provider: type === 'meta_pixel' ? 'Meta' : 'Google',
            purpose: cookie.purpose,
            duration: cookie.duration,
            domain: 'Domínio do portal',
            cookieType: 'first_party',
            requiresConsent: true,
            isActive: true,
            usedOn: 'Carregado apenas depois do consentimento da categoria associada',
        });
    }
}
export async function createIntegration(user, input, ip) {
    if (!INTEGRATION_TYPES.includes(input.integrationType)) {
        throw badRequest('INVALID_INTEGRATION', 'O tipo de integração não é permitido.');
    }
    const idError = publicIdError(input.integrationType, input.publicId);
    if (idError)
        throw badRequest('INVALID_PUBLIC_ID', idError);
    const [category] = await db
        .select()
        .from(cookieCategories)
        .where(eq(cookieCategories.id, input.categoryId))
        .limit(1);
    if (!category)
        throw badRequest('INVALID_CATEGORY', 'A categoria indicada não existe.');
    if (!category.isActive && !category.isEssential) {
        throw badRequest('INACTIVE_CATEGORY', 'Active a categoria antes de lhe associar uma integração.');
    }
    const slugBase = slugify(input.name).slice(0, 60) || 'integracao';
    const id = newId();
    let slug = slugBase;
    for (let n = 2; n < 50; n += 1) {
        const [taken] = await db
            .select({ id: cookieIntegrations.id })
            .from(cookieIntegrations)
            .where(eq(cookieIntegrations.slug, slug))
            .limit(1);
        if (!taken)
            break;
        slug = `${slugBase}-${n}`.slice(0, 64);
    }
    await db.insert(cookieIntegrations).values({
        id,
        categoryId: category.id,
        name: input.name.trim(),
        slug,
        provider: providerFor(input.integrationType),
        integrationType: input.integrationType,
        publicId: input.publicId.trim(),
        purpose: input.purpose.trim(),
        requiresConsent: category.isEssential ? false : true,
        isActive: input.isActive,
    });
    await ensureVendorCookies(category.id, input.integrationType);
    await writeAuditLog({
        actorUserId: user.id,
        action: 'cookies.integration.create',
        entityType: 'cookie_integration',
        entityId: id,
        meta: { slug, type: input.integrationType, category: category.slug, isActive: input.isActive },
        ip,
    });
    const [created] = await db.select().from(cookieIntegrations).where(eq(cookieIntegrations.id, id)).limit(1);
    return presentIntegration(created, category.slug);
}
function providerFor(type) {
    if (type === 'meta_pixel')
        return 'Meta';
    if (type === 'first_party_analytics')
        return 'Kwanza News';
    if (type === 'ga4' || type === 'gtm' || type === 'google_ads')
        return 'Google';
    return 'Externo';
}
export async function updateIntegration(user, id, input, ip) {
    const [current] = await db.select().from(cookieIntegrations).where(eq(cookieIntegrations.id, id)).limit(1);
    if (!current)
        throw notFound('Integração não encontrada.');
    const categoryId = input.categoryId ?? current.categoryId;
    const [category] = await db
        .select()
        .from(cookieCategories)
        .where(eq(cookieCategories.id, categoryId))
        .limit(1);
    if (!category)
        throw badRequest('INVALID_CATEGORY', 'A categoria indicada não existe.');
    const publicId = input.publicId ?? current.publicId;
    const idError = publicIdError(current.integrationType, publicId);
    if (idError)
        throw badRequest('INVALID_PUBLIC_ID', idError);
    const next = {
        name: input.name?.trim() ?? current.name,
        categoryId: category.id,
        publicId: publicId.trim(),
        purpose: input.purpose?.trim() ?? current.purpose,
        isActive: input.isActive ?? current.isActive,
        requiresConsent: category.isEssential ? current.requiresConsent : true,
        provider: providerFor(current.integrationType),
    };
    await db.update(cookieIntegrations).set(next).where(eq(cookieIntegrations.id, id));
    if (next.isActive)
        await ensureVendorCookies(category.id, current.integrationType);
    await writeAuditLog({
        actorUserId: user.id,
        action: 'cookies.integration.update',
        entityType: 'cookie_integration',
        entityId: id,
        meta: { slug: current.slug, isActive: next.isActive, category: category.slug },
        ip,
    });
    return presentIntegration({ ...current, ...next }, category.slug);
}
export async function listPolicyVersions() {
    const rows = await db
        .select()
        .from(cookiePolicyVersions)
        .orderBy(desc(cookiePolicyVersions.createdAt));
    return rows.map((row) => ({
        id: row.id,
        version: row.version,
        title: row.title,
        content: row.content,
        changeSummary: row.changeSummary,
        requiresReconsent: row.requiresReconsent,
        isPublished: row.isPublished,
        effectiveAt: row.effectiveAt?.toISOString() ?? null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
    }));
}
export async function publishPolicyVersion(user, input, ip) {
    if (!/^\d{4}\.\d{1,3}$/.test(input.version)) {
        throw badRequest('INVALID_VERSION', 'A versão deve ter o formato AAAA.N, por exemplo 2026.2.');
    }
    const [existing] = await db
        .select({ id: cookiePolicyVersions.id })
        .from(cookiePolicyVersions)
        .where(eq(cookiePolicyVersions.version, input.version))
        .limit(1);
    if (existing)
        throw conflict('POLICY_EXISTS', 'Já existe uma política com esta versão.');
    const now = new Date();
    const id = newId();
    await db.insert(cookiePolicyVersions).values({
        id,
        version: input.version.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        changeSummary: input.changeSummary.trim(),
        requiresReconsent: input.requiresReconsent,
        isPublished: true,
        effectiveAt: now,
        publishedAt: now,
        createdBy: user.id,
    });
    await writeAuditLog({
        actorUserId: user.id,
        action: 'cookies.policy.publish',
        entityType: 'cookie_policy',
        entityId: id,
        meta: { version: input.version, requiresReconsent: input.requiresReconsent },
        ip,
    });
    const versions = await listPolicyVersions();
    return versions.find((row) => row.id === id) ?? null;
}
export async function getPublicCookiePolicy(jurisdiction) {
    await ensureCookieCatalog();
    const [categories, inventory, integrations, policies, ttlDays, materialPolicyVersion] = await Promise.all([
        listCategories({ activeOnly: true }),
        listInventory({ activeOnly: true }),
        listIntegrations({ activeOnly: true }),
        listPolicyVersions(),
        getConsentTtlDays(),
        getMaterialPolicyVersion(),
    ]);
    const published = policies.filter((row) => row.isPublished);
    const latest = published[0] ?? null;
    const activeSlugs = new Set(categories.map((row) => row.slug));
    const clearableCookies = {};
    for (const slug of CATEGORY_SLUGS)
        clearableCookies[slug] = [];
    for (const item of inventory) {
        if (!item.requiresConsent || item.cookieType !== 'first_party')
            continue;
        if (!isClearableCookieName(item.cookieName))
            continue;
        clearableCookies[item.categorySlug]?.push(item.cookieName);
    }
    const disabledGates = (await db
        .select({
        gateKey: cookieInventory.gateKey,
        active: cookieInventory.isActive,
        categoryActive: cookieCategories.isActive,
    })
        .from(cookieInventory)
        .innerJoin(cookieCategories, eq(cookieInventory.categoryId, cookieCategories.id))
        .where(isNotNull(cookieInventory.gateKey)))
        .filter((row) => row.gateKey && (!row.active || !row.categoryActive))
        .map((row) => row.gateKey);
    const firstParty = integrations.find((row) => row.integrationType === 'first_party_analytics');
    return {
        consentVersion: CONSENT_SYSTEM_VERSION,
        materialPolicyVersion,
        ttlDays,
        rules: consentRules(jurisdiction),
        policy: latest
            ? {
                version: latest.version,
                title: latest.title,
                content: latest.content,
                effectiveAt: latest.effectiveAt,
            }
            : null,
        categories: categories.filter((row) => activeSlugs.has(row.slug)),
        inventory: inventory.map((item) => ({
            id: item.id,
            categorySlug: item.categorySlug,
            cookieName: item.cookieName,
            provider: item.provider,
            purpose: item.purpose,
            duration: item.duration,
            domain: item.domain,
            cookieType: item.cookieType,
            requiresConsent: item.requiresConsent,
            usedOn: item.usedOn,
            gateKey: item.gateKey,
        })),
        integrations: integrations
            .filter((row) => activeSlugs.has(row.categorySlug))
            .map((row) => ({
            id: row.id,
            slug: row.slug,
            name: row.name,
            provider: row.provider,
            integrationType: row.integrationType,
            publicId: row.publicId,
            categorySlug: row.categorySlug,
            requiresConsent: row.requiresConsent,
        })),
        clearableCookies,
        disabledGates,
        firstPartyAnalytics: Boolean(firstParty?.isActive),
    };
}
export function activeCategorySet(categories) {
    return new Set(categories.filter((row) => row.isEssential || row.isActive).map((row) => row.slug));
}
