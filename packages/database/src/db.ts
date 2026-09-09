import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(rootEnvPath) && !process.env.DATABASE_URL) {
  process.loadEnvFile(rootEnvPath);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env.');
}

export const db = drizzle(postgres(connectionString), { schema });
