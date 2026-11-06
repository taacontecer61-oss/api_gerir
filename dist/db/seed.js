import { and, eq } from 'drizzle-orm';
import { env } from '../config.js';
import { newId } from '../lib/ids.js';
import { PERMISSION_DESCRIPTIONS, ROLE_META, ROLE_PERMISSION_MAP, ROLE_SLUGS, } from '../lib/permissions.js';
import { hashPassword } from '../lib/password.js';
import { db, pool } from './index.js';
import { categories, permissions, rolePermissions, roles, settings, userRoles, users, } from './schema/index.js';
import { ensureCookieCatalog } from '../services/cookie-catalog.js';
const CATEGORY_SEED = [
    {
        slug: 'politica',
        name: 'Política',
        description: 'Cobertura institucional, governação e actualidade política em Angola e no exterior.',
        sortOrder: 1,
    },
    {
        slug: 'economia',
        name: 'Economia',
        description: 'Mercados, investimento, petróleo, diversificação económica e finanças.',
        sortOrder: 2,
    },
    {
        slug: 'sociedade',
        name: 'Sociedade',
        description: 'Comunidades, educação, saúde, inclusão e dinâmicas sociais no país.',
        sortOrder: 3,
    },
    {
        slug: 'internacional',
        name: 'Internacional',
        description: 'África, CPLP e principais desenvolvimentos no cenário mundial.',
        sortOrder: 4,
    },
    {
        slug: 'desporto',
        name: 'Desporto',
        description: 'Girabola, selecções nacionais, competições africanas e internacionais.',
        sortOrder: 5,
    },
    {
        slug: 'cultura',
        name: 'Cultura',
        description: 'Artes, património, literatura, música e identidade cultural angolana.',
        sortOrder: 6,
    },
    {
        slug: 'entretenimento',
        name: 'Entretenimento',
        description: 'Cinema, televisão, espectáculos e vida cultural contemporânea.',
        sortOrder: 7,
    },
    {
        slug: 'tecnologia',
        name: 'Tecnologia',
        description: 'Inovação digital, telecomunicações, startups e transformação tecnológica.',
        sortOrder: 8,
    },
];
async function seedPermissions() {
    const permissionIds = new Map();
    for (const [slug, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
        const [existing] = await db
            .select()
            .from(permissions)
            .where(eq(permissions.slug, slug))
            .limit(1);
        if (existing) {
            permissionIds.set(slug, existing.id);
            if (existing.description !== description) {
                await db.update(permissions).set({ description }).where(eq(permissions.id, existing.id));
            }
            continue;
        }
        const id = newId();
        await db.insert(permissions).values({ id, slug, description });
        permissionIds.set(slug, id);
    }
    return permissionIds;
}
async function seedRoles(permissionIds) {
    const roleIds = new Map();
    for (const slug of Object.values(ROLE_SLUGS)) {
        const meta = ROLE_META[slug];
        const [existing] = await db.select().from(roles).where(eq(roles.slug, slug)).limit(1);
        let roleId = existing?.id;
        if (!roleId) {
            roleId = newId();
            await db.insert(roles).values({
                id: roleId,
                slug,
                name: meta.name,
                description: meta.description,
                isSystem: true,
            });
        }
        roleIds.set(slug, roleId);
        for (const permissionSlug of ROLE_PERMISSION_MAP[slug] ?? []) {
            const permissionId = permissionIds.get(permissionSlug);
            if (!permissionId)
                continue;
            const [already] = await db
                .select()
                .from(rolePermissions)
                .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)))
                .limit(1);
            if (already)
                continue;
            await db.insert(rolePermissions).values({
                roleId,
                permissionId,
            });
        }
    }
    return roleIds;
}
async function seedCategories() {
    for (const category of CATEGORY_SEED) {
        const [existing] = await db
            .select()
            .from(categories)
            .where(eq(categories.slug, category.slug))
            .limit(1);
        if (existing) {
            await db
                .update(categories)
                .set({
                name: category.name,
                description: category.description,
                sortOrder: category.sortOrder,
                isActive: true,
            })
                .where(eq(categories.id, existing.id));
            continue;
        }
        await db.insert(categories).values({
            id: newId(),
            ...category,
            isActive: true,
        });
    }
}
async function seedAdmin(roleIds) {
    const email = env.SEED_ADMIN_EMAIL.toLowerCase();
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let userId = existing?.id;
    if (!userId) {
        userId = newId();
        await db.insert(users).values({
            id: userId,
            email,
            name: env.SEED_ADMIN_NAME,
            passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
            isActive: true,
        });
    }
    const adminRoleId = roleIds.get(ROLE_SLUGS.SUPERADMIN);
    if (adminRoleId) {
        const [link] = await db
            .select()
            .from(userRoles)
            .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, adminRoleId)))
            .limit(1);
        if (!link) {
            await db.insert(userRoles).values({ userId, roleId: adminRoleId });
        }
    }
}
async function seedSettings() {
    const defaults = [
        {
            key: 'site.timezone',
            valueJson: JSON.stringify(env.TIMEZONE),
        },
        {
            key: 'editorial.categories_locked',
            valueJson: JSON.stringify(true),
        },
    ];
    for (const item of defaults) {
        const [existing] = await db
            .select()
            .from(settings)
            .where(eq(settings.key, item.key))
            .limit(1);
        if (existing)
            continue;
        await db.insert(settings).values(item);
    }
}
async function main() {
    console.log('A popular dados iniciais…');
    const permissionIds = await seedPermissions();
    const roleIds = await seedRoles(permissionIds);
    await seedCategories();
    await seedAdmin(roleIds);
    await seedSettings();
    await ensureCookieCatalog();
    console.log(`Administrador: ${env.SEED_ADMIN_EMAIL}`);
    console.log('Seed concluído.');
    await pool.end();
}
main().catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
});
