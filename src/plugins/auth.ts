import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { env } from '../config.js'
import { forbidden, unauthorized } from '../lib/errors.js'
import type { PermissionSlug } from '../lib/permissions.js'
import { resolveSession, type AuthUser } from '../services/auth.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null
  }

  interface FastifyInstance {
    authenticate: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => Promise<void>
    requirePermission: (
      ...permissions: PermissionSlug[]
    ) => (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => Promise<void>
  }
}

const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('user', null)

  app.addHook('preHandler', async (request) => {
    const token = request.cookies[env.SESSION_COOKIE_NAME]
    request.user = await resolveSession(token)
  })

  app.decorate('authenticate', async (request) => {
    if (!request.user) {
      throw unauthorized()
    }
  })

  app.decorate('requirePermission', (...needed: PermissionSlug[]) => {
    return async (request) => {
      if (!request.user) {
        throw unauthorized()
      }
      const hasAll = needed.every((permission) =>
        request.user!.permissions.includes(permission),
      )
      if (!hasAll) {
        throw forbidden()
      }
    }
  })
}

export default fp(authPlugin, {
  name: 'auth-plugin',
  dependencies: ['@fastify/cookie'],
})
