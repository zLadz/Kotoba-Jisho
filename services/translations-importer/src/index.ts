import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { logger } from './logger.js';
import {
  completeTranslationImport,
  failTranslationImport,
  flushTranslationBatch,
  markRunning,
  replaceTranslationRows,
  startTranslationImport,
  updateTranslationProgress,
  type TranslationImportProgress,
  type TranslationRow,
  type TranslationSourceKey,
} from './storage.js';

const DEFAULT_BATCH_SIZE = 2500;

interface TranslationArguments {
  filePath: string;
  source?: string;
  version?: string;
  batchSize: number;
}

function readArgs(argv: string[]): TranslationArguments {
  let batchSize = DEFAULT_BATCH_SIZE;

  const fileIndex = argv.indexOf('--file');
  const filePath = argv[fileIndex + 1];
  if (fileIndex < 0 || !filePath || filePath.startsWith('--')) {
    throw new Error('--file é obrigatório (caminho para o JSON de traduções)');
  }

  const sourceIndex = argv.indexOf('--source');
  const source = sourceIndex >= 0 ? argv[sourceIndex + 1] : undefined;

  const versionIndex = argv.indexOf('--version');
  const version = versionIndex >= 0 ? argv[versionIndex + 1] : undefined;

  const batchIndex = argv.indexOf('--batch-size');
  if (batchIndex >= 0) {
    const raw = argv[batchIndex + 1];
    if (!raw || raw.startsWith('--')) {
      throw new Error('--batch-size requer um número inteiro positivo');
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error('--batch-size deve ser um número inteiro positivo');
    }
    batchSize = parsed;
  }

  return { filePath, source, version, batchSize };
}

function checksumOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function main(): Promise<void> {
  const {
    filePath,
    source: rawSource,
    version: rawVersion,
    batchSize,
  } = readArgs(process.argv.slice(2));

  const content = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(content) as {
    source?: string;
    version?: string;
    translations: TranslationRow[];
  };

  const source = parsed.source ?? rawSource;
  const version = parsed.version ?? rawVersion;
  if (!source || !version) {
    throw new Error('source e version são obrigatórios (no JSON ou via --source/--version)');
  }

  const startedAtMs = Date.now();
  const progress: TranslationImportProgress = { processed: 0, inserted: 0, skipped: 0, errors: 0 };
  let sourceImportId: string | undefined;

  try {
    const checksum = checksumOf(content);
    const handle = await startTranslationImport({ source, version, checksum });
    sourceImportId = handle.id;

    const rerunWithReplace = handle.status === 'completed' && handle.checksum !== checksum;
    if (handle.status === 'completed') {
      if (!rerunWithReplace) {
        logger.info('importação já concluída com o mesmo checksum; nada a fazer', {
          source,
          version,
        });
        process.exit(0);
      }
      logger.info('checksum alterado desde a importação anterior; substituindo dados', {
        source,
        version,
      });
      const pairs: TranslationSourceKey[] = [
        ...new Map(
          parsed.translations.map((row) => [
            `${row.source}|${row.sourceVersion}`,
            { source: row.source, sourceVersion: row.sourceVersion },
          ]),
        ).values(),
      ];
      await replaceTranslationRows(pairs);
    }

    await markRunning(sourceImportId);

    let buffer: TranslationRow[] = [];
    const flush = async (): Promise<void> => {
      if (buffer.length === 0) {
        return;
      }
      const result = await flushTranslationBatch(buffer);
      progress.inserted += result.inserted;
      progress.skipped += result.skipped;
      progress.errors += result.errors;
      buffer = [];
      await updateTranslationProgress(sourceImportId!, {
        processed: progress.processed,
        inserted: progress.inserted,
        skipped: progress.skipped,
        errors: progress.errors,
      });
      logger.info('lote aplicado', {
        batch: progress.processed,
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
        elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
      });
    };

    for (const row of parsed.translations) {
      progress.processed += 1;
      buffer.push(row);
      if (buffer.length >= batchSize) {
        await flush();
      }
    }
    await flush();

    await completeTranslationImport(sourceImportId, progress, startedAtMs);

    const elapsedMs = Date.now() - startedAtMs;
    logger.info('importação de traduções concluída', {
      source,
      version,
      filePath,
      translations: progress.processed,
      inserted: progress.inserted,
      skipped: progress.skipped,
      errors: progress.errors,
      elapsedSeconds: Math.round(elapsedMs / 1000),
    });
  } catch (error) {
    if (sourceImportId) {
      try {
        await failTranslationImport(
          sourceImportId,
          error instanceof Error ? error.message : String(error),
          progress,
          startedAtMs,
        );
      } catch {
        // ignora falha secundária ao registrar o erro
      }
    }
    throw error;
  }

  process.exit(0);
}

void main().catch((error: unknown) => {
  logger.error('importação de traduções falhou', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
