import { forbidden } from './errors.js'
import { PERMISSIONS, type PermissionSlug } from './permissions.js'

type WithPermissions = { permissions: string[] }

/** Exige TODAS as permissões indicadas. */
export function requireAll(user: WithPermissions, ...needed: PermissionSlug[]) {
  if (!needed.every((permission) => user.permissions.includes(permission))) throw forbidden()
}

/** Exige pelo menos UMA das permissões indicadas. */
export function requireAny(user: WithPermissions, ...needed: PermissionSlug[]) {
  if (!needed.some((permission) => user.permissions.includes(permission))) throw forbidden()
}

/**
 * Publicar, alterar conteúdo já público, ou apagar galerias e vídeos.
 * Quem só tem `media.upload` (colaborador) fica de fora.
 */
export function requireEditorialWrite(user: WithPermissions) {
  requireAny(
    user,
    PERMISSIONS.ARTICLES_CREATE,
    PERMISSIONS.ARTICLES_PUBLISH,
    PERMISSIONS.MEDIA_DELETE,
  )
}
