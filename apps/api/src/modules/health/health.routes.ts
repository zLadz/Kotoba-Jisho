import type { FastifyInstance } from 'fastify';
import { checkHealth } from './health.controller.js';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/api/v1/health', checkHealth);
}
