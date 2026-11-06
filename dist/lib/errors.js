export class AppError extends Error {
    statusCode;
    code;
    expose;
    details;
    constructor(statusCode, code, message, options) {
        super(message, { cause: options?.cause });
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.expose = options?.expose ?? statusCode < 500;
        this.details = options?.details;
    }
}
export function unauthorized(message = 'Autenticação necessária.') {
    return new AppError(401, 'UNAUTHORIZED', message);
}
export function forbidden(message = 'Sem permissão para esta operação.') {
    return new AppError(403, 'FORBIDDEN', message);
}
export function badRequest(code, message) {
    return new AppError(400, code, message);
}
export function conflict(code, message, details) {
    return new AppError(409, code, message, { details });
}
export function tooManyRequests(message) {
    return new AppError(429, 'RATE_LIMITED', message);
}
export function notFound(message = 'Recurso não encontrado.') {
    return new AppError(404, 'NOT_FOUND', message);
}
