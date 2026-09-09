import type { FastifyReply, FastifyRequest } from 'fastify';
import { searchQuerySchema, searchResponseSchema } from '@kotoba/validation';
import { searchService } from './search.service.js';
import { errorBody } from '../../shared/errors.js';

export async function searchEntries(
  request: FastifyRequest<{ Querystring: Record<string, string> }>,
  reply: FastifyReply,
): Promise<void> {
  const parsed = searchQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send(errorBody('VALIDATION_ERROR', 'Invalid search query'));
    return;
  }

  const results = await searchService.search(parsed.data.q, parsed.data.limit);
  reply.send(searchResponseSchema.parse({ query: parsed.data.q, results }));
}
