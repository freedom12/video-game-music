import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { getDatabase, loadConfig, searchCatalog } from '@vgm/core';
import type { AppError } from '@vgm/shared';
import Fastify from 'fastify';

import { albumRoutes, collectionRoutes, seriesRoutes, similarityRoutes, trackRoutes } from './routes/index.js';

const ERROR_CODE_TO_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  STORAGE_ERROR: 502,
};

function isAppError(error: unknown): error is AppError {
  return (
    error != null
    && typeof error === 'object'
    && '__appError' in error
    && (error as any).__appError === true
  );
}

export async function createApp() {
  const config = loadConfig(process.env, process.cwd());
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: true,
  });

  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  // --- Global error handler ---
  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      const statusCode = ERROR_CODE_TO_STATUS[error.code] ?? 500;
      return reply.code(statusCode).send({
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      });
    }

    // Zod validation errors (thrown by schema.parse())
    if (error && typeof error === 'object' && 'flatten' in error && typeof (error as any).flatten === 'function') {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: (error as any).flatten(),
      });
    }

    // Fastify built-in validation errors
    const err = error as Record<string, unknown>;
    if (err.validation) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: String(err.message ?? 'Validation error'),
      });
    }

    _request.log.error(error);
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  // --- System routes ---
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/media-source', async () => ({ source: config.mediaSource }));
  app.get('/api/search', async (request) => {
    const context = await getDatabase(config);
    const { q = '' } = request.query as { q?: string };
    return searchCatalog(context, q);
  });

  // --- Domain routes ---
  const routeContext = { config };
  await albumRoutes(app, routeContext);
  await trackRoutes(app, routeContext);
  await collectionRoutes(app, routeContext);
  await seriesRoutes(app, routeContext);
  await similarityRoutes(app, routeContext);

  return app;
}
