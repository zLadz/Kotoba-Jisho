import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { registerDictionaryRoutes } from './modules/dictionary/dictionary.routes.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerSearchRoutes } from './modules/search/search.routes.js';
import { errorBody } from './shared/errors.js';

export interface BuildAppOptions {
  loggerLevel?: string;
  corsOrigin?: string | boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: options.loggerLevel ?? process.env.LOG_LEVEL ?? 'info',
    },
  });

  void app.register(cors, {
    origin: options.corsOrigin ?? process.env.CORS_ORIGIN ?? true,
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND', 'Route not found'));
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'erro não tratado');
    reply.status(500).send(errorBody('INTERNAL_ERROR', 'Internal server error'));
  });

  registerHealthRoutes(app);
  registerSearchRoutes(app);
  registerDictionaryRoutes(app);

  return app;
}
