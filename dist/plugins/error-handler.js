import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { isProd } from '../config.js';
import { AppError } from '../lib/errors.js';
const errorHandlerPlugin = async (app) => {
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof AppError) {
            return reply.status(error.statusCode).send({
                error: {
                    code: error.code,
                    message: error.expose ? error.message : 'Pedido inválido.',
                    ...(error.details !== undefined ? { details: error.details } : {}),
                },
            });
        }
        if (error instanceof ZodError) {
            return reply.status(400).send({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Dados inválidos.',
                    details: error.issues.map((issue) => ({
                        path: issue.path.join('.'),
                        message: issue.message,
                    })),
                },
            });
        }
        const statusCode = typeof error === 'object' &&
            error !== null &&
            'statusCode' in error &&
            typeof error.statusCode === 'number'
            ? error.statusCode
            : 500;
        if (statusCode >= 500) {
            request.log.error({ err: error }, 'Erro não tratado');
        }
        return reply.status(statusCode).send({
            error: {
                code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
                message: statusCode >= 500
                    ? 'Ocorreu um erro interno.'
                    : isProd
                        ? 'Pedido inválido.'
                        : error instanceof Error
                            ? error.message
                            : 'Pedido inválido.',
            },
        });
    });
};
export default fp(errorHandlerPlugin, { name: 'error-handler' });
