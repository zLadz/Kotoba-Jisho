import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: connectionString,
  },
});
