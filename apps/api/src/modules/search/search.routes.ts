import type { FastifyInstance } from 'fastify';
import { searchEntries } from './search.controller.js';

export function registerSearchRoutes(app: FastifyInstance): void {
  app.get('/api/v1/search', searchEntries);
}
