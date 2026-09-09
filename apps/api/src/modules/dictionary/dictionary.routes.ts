import type { FastifyInstance } from 'fastify';
import { getEntry } from './dictionary.controller.js';

export function registerDictionaryRoutes(app: FastifyInstance): void {
  app.get('/api/v1/entries/:id', getEntry);
}
