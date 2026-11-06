export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly expose: boolean
  readonly details?: unknown

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: { expose?: boolean; cause?: unknown; details?: unknown },
  ) {
    super(message, { cause: options?.cause })
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.expose = options?.expose ?? statusCode < 500
    this.details = options?.details
  }
}

export function unauthorized(message = 'Autenticação necessária.'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message)
}

export function forbidden(message = 'Sem permissão para esta operação.'): AppError {
  return new AppError(403, 'FORBIDDEN', message)
}

export function badRequest(code: string, message: string): AppError {
  return new AppError(400, code, message)
}

export function conflict(code: string, message: string, details?: unknown): AppError {
  return new AppError(409, code, message, { details })
}

export function tooManyRequests(message: string): AppError {
  return new AppError(429, 'RATE_LIMITED', message)
}

export function notFound(message = 'Recurso não encontrado.'): AppError {
  return new AppError(404, 'NOT_FOUND', message)
}
