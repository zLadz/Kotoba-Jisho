import type { FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '@kotoba/database';
import { healthResponseSchema } from '@kotoba/validation';
import { errorBody } from '../../shared/errors.js';

export async function checkHealth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await db.execute(sql`select 1`);
    reply.send(healthResponseSchema.parse({ status: 'ok' }));
  } catch (error) {
    request.log.error({ err: error }, 'health check falhou');
    reply.status(503).send(errorBody('DATABASE_UNAVAILABLE', 'Database unavailable'));
  }
}
