/** Catálogo estável de permissões — seed e checagens de rota usam estes slugs. */
export const PERMISSIONS = {
    ARTICLES_READ: 'articles.read',
    ARTICLES_CREATE: 'articles.create',
    ARTICLES_EDIT_OWN: 'articles.edit_own',
    ARTICLES_EDIT_ANY: 'articles.edit_any',
    ARTICLES_SUBMIT: 'articles.submit',
    ARTICLES_APPROVE: 'articles.approve',
    ARTICLES_PUBLISH: 'articles.publish',
    ARTICLES_SCHEDULE: 'articles.schedule',
    CATEGORIES_MANAGE: 'categories.manage',
    TAGS_MANAGE: 'tags.manage',
    AUTHORS_MANAGE: 'authors.manage',
    MEDIA_UPLOAD: 'media.upload',
    MEDIA_DELETE: 'media.delete',
    USERS_MANAGE: 'users.manage',
    AUDIT_READ: 'audit.read',
    SETTINGS_MANAGE: 'settings.manage',
    DASHBOARD_READ: 'dashboard.read',
    LIVE_READ: 'live.read',
    LIVE_MANAGE: 'live.manage',
    LIVE_PUBLISH: 'live.publish',
    REPORTS_READ: 'reports.read',
};
export const PERMISSION_DESCRIPTIONS = {
    [PERMISSIONS.ARTICLES_READ]: 'Consultar artigos no painel',
    [PERMISSIONS.ARTICLES_CREATE]: 'Criar artigos',
    [PERMISSIONS.ARTICLES_EDIT_OWN]: 'Editar artigos próprios',
    [PERMISSIONS.ARTICLES_EDIT_ANY]: 'Editar artigos de outros autores',
    [PERMISSIONS.ARTICLES_SUBMIT]: 'Submeter artigos para revisão',
    [PERMISSIONS.ARTICLES_APPROVE]: 'Aprovar ou devolver artigos',
    [PERMISSIONS.ARTICLES_PUBLISH]: 'Publicar artigos',
    [PERMISSIONS.ARTICLES_SCHEDULE]: 'Agendar publicações',
    [PERMISSIONS.CATEGORIES_MANAGE]: 'Gerir categorias',
    [PERMISSIONS.TAGS_MANAGE]: 'Gerir etiquetas',
    [PERMISSIONS.AUTHORS_MANAGE]: 'Legado. A autoria das notícias usa as contas de utilizador.',
    [PERMISSIONS.MEDIA_UPLOAD]: 'Carregar ficheiros multimédia',
    [PERMISSIONS.MEDIA_DELETE]: 'Eliminar ficheiros multimédia',
    [PERMISSIONS.USERS_MANAGE]: 'Gerir utilizadores e funções',
    [PERMISSIONS.AUDIT_READ]: 'Consultar registos de auditoria',
    [PERMISSIONS.SETTINGS_MANAGE]: 'Alterar definições editoriais',
    [PERMISSIONS.DASHBOARD_READ]: 'Consultar o dashboard editorial',
    [PERMISSIONS.LIVE_READ]: 'Consultar coberturas em directo',
    [PERMISSIONS.LIVE_MANAGE]: 'Criar e editar coberturas em directo',
    [PERMISSIONS.LIVE_PUBLISH]: 'Publicar actualizações e gerir estado do directo',
    [PERMISSIONS.REPORTS_READ]: 'Consultar relatórios e métricas',
};
export const ROLE_SLUGS = {
    SUPERADMIN: 'superadmin',
    ADMIN: 'admin',
    EDITORIAL_DIRECTOR: 'editorial_director',
    EDITOR: 'editor',
    JOURNALIST: 'journalist',
    MEDIA_MANAGER: 'media_manager',
    COLLABORATOR: 'collaborator',
};
const ALL = Object.values(PERMISSIONS);
const JOURNALIST = [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.ARTICLES_READ,
    PERMISSIONS.ARTICLES_CREATE,
    PERMISSIONS.ARTICLES_EDIT_OWN,
    PERMISSIONS.ARTICLES_SUBMIT,
    PERMISSIONS.MEDIA_UPLOAD,
    PERMISSIONS.LIVE_READ,
    PERMISSIONS.LIVE_MANAGE,
];
const EDITOR = [
    ...JOURNALIST,
    PERMISSIONS.ARTICLES_EDIT_ANY,
    PERMISSIONS.ARTICLES_APPROVE,
    PERMISSIONS.CATEGORIES_MANAGE,
    PERMISSIONS.TAGS_MANAGE,
    PERMISSIONS.AUTHORS_MANAGE,
    PERMISSIONS.LIVE_PUBLISH,
];
const EDITORIAL_DIRECTOR = [
    ...EDITOR,
    PERMISSIONS.ARTICLES_PUBLISH,
    PERMISSIONS.ARTICLES_SCHEDULE,
    PERMISSIONS.MEDIA_DELETE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.REPORTS_READ,
];
const MEDIA_MANAGER = [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.MEDIA_UPLOAD,
    PERMISSIONS.MEDIA_DELETE,
];
/** Acesso limitado: ler artigos, carregar multimédia e ver dashboard. */
const COLLABORATOR = [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.ARTICLES_READ,
    PERMISSIONS.MEDIA_UPLOAD,
    PERMISSIONS.LIVE_READ,
];
const ADMIN = ALL;
export const ROLE_PERMISSION_MAP = {
    [ROLE_SLUGS.JOURNALIST]: JOURNALIST,
    [ROLE_SLUGS.EDITOR]: EDITOR,
    [ROLE_SLUGS.EDITORIAL_DIRECTOR]: EDITORIAL_DIRECTOR,
    [ROLE_SLUGS.MEDIA_MANAGER]: MEDIA_MANAGER,
    [ROLE_SLUGS.COLLABORATOR]: COLLABORATOR,
    [ROLE_SLUGS.ADMIN]: ADMIN,
    [ROLE_SLUGS.SUPERADMIN]: ADMIN,
};
export const ROLE_META = {
    [ROLE_SLUGS.SUPERADMIN]: {
        name: 'Superadministrador',
        description: 'Acesso total, incluindo gestão de funções.',
    },
    [ROLE_SLUGS.ADMIN]: {
        name: 'Administrador',
        description: 'Gestão completa do painel editorial.',
    },
    [ROLE_SLUGS.EDITORIAL_DIRECTOR]: {
        name: 'Director editorial',
        description: 'Publicação, agendamento e supervisão editorial.',
    },
    [ROLE_SLUGS.EDITOR]: {
        name: 'Editor',
        description: 'Revisão, aprovação e organização de conteúdos.',
    },
    [ROLE_SLUGS.JOURNALIST]: {
        name: 'Jornalista',
        description: 'Criação e edição de artigos próprios.',
    },
    [ROLE_SLUGS.MEDIA_MANAGER]: {
        name: 'Gestor de multimédia',
        description: 'Biblioteca de ficheiros e imagens.',
    },
    [ROLE_SLUGS.COLLABORATOR]: {
        name: 'Colaborador',
        description: 'Acesso limitado a consulta e multimédia.',
    },
};
