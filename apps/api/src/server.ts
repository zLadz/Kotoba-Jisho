import { buildApp } from './app.js';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

const app = buildApp();

async function start(): Promise<void> {
  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error({ err: error }, 'falha ao iniciar servidor');
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'encerrando servidor');
  await app.close();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

void start();
