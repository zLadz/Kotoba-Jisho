import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { translationDatasetSchema, type TranslationDatasetRow } from '@kotoba/validation';
import { logger } from './logger.js';
import {
  completeTranslationImport,
  failTranslationImport,
  importTranslationsAtomically,
  markRunning,
  startTranslationImport,
  type TranslationImportProgress,
  type TranslationSourceKey,
} from './storage.js';

function readArgs(argv: string[]): { filePath: string; source?: string; version?: string } {
  const fileIndex = argv.indexOf('--file');
  const filePath = argv[fileIndex + 1];
  if (fileIndex < 0 || !filePath || filePath.startsWith('--')) {
    throw new Error('--file é obrigatório (caminho para o JSON de traduções)');
  }

  const sourceIndex = argv.indexOf('--source');
  const source = sourceIndex >= 0 ? argv[sourceIndex + 1] : undefined;

  const versionIndex = argv.indexOf('--version');
  const version = versionIndex >= 0 ? argv[versionIndex + 1] : undefined;

  return { filePath, source, version };
}

function checksumOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function deduplicateRows(rows: TranslationDatasetRow[]): {
  unique: TranslationDatasetRow[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const unique: TranslationDatasetRow[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const key = [
      row.jmdictSeq,
      row.sensePosition,
      row.language,
      row.text,
      row.source,
      row.sourceVersion,
    ].join('|');
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(row);
  }
  return { unique, duplicates };
}

function distinctPairs(rows: TranslationDatasetRow[]): TranslationSourceKey[] {
  return [
    ...new Map(
      rows.map((row) => [
        `${row.source}|${row.sourceVersion}`,
        { source: row.source, sourceVersion: row.sourceVersion },
      ]),
    ).values(),
  ];
}

function formatIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

async function main(): Promise<void> {
  const { filePath, source: rawSource, version: rawVersion } = readArgs(process.argv.slice(2));

  const content = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(content) as unknown;

  const dataset = translationDatasetSchema.safeParse(parsed);
  if (!dataset.success) {
    throw new Error(
      `dataset inválido (${dataset.error.issues.length} problema(s)): ${formatIssues(dataset.error.issues)}`,
    );
  }

  const source = dataset.data.source ?? rawSource;
  const version = dataset.data.version ?? rawVersion;
  if (!source || !version) {
    throw new Error('source e version são obrigatórios (no JSON ou via --source/--version)');
  }

  const { unique: rows, duplicates } = deduplicateRows(dataset.data.translations);
  if (duplicates > 0) {
    logger.warn('linhas duplicadas dentro do dataset (primeira vence)', {
      duplicates,
    });
  }

  const startedAtMs = Date.now();
  const progress: TranslationImportProgress = {
    processed: dataset.data.translations.length,
    inserted: 0,
    skipped: 0,
    errors: 0,
  };
  let sourceImportId: string | undefined;

  try {
    const checksum = checksumOf(content);
    const handle = await startTranslationImport({ source, version, checksum });
    sourceImportId = handle.id;

    if (handle.status === 'completed' && handle.checksum === checksum) {
      logger.info('importação já concluída com o mesmo checksum; nada a fazer', {
        source,
        version,
      });
      process.exit(0);
    }
    logger.info(
      handle.status === 'completed'
        ? 'checksum alterado desde a importação anterior; substituindo dados de forma atômica'
        : 'importação em lote único e atômico',
      { source, version },
    );

    await markRunning(sourceImportId);

    const pairs = distinctPairs(rows);
    const result = await importTranslationsAtomically(rows, pairs);
    progress.inserted = result.inserted;
    progress.skipped = result.skipped + duplicates;
    progress.errors = result.errors;

    await completeTranslationImport(sourceImportId, progress, startedAtMs, checksum);

    const elapsedMs = Date.now() - startedAtMs;
    logger.info('importação de traduções concluída', {
      source,
      version,
      filePath,
      translations: progress.processed,
      inserted: progress.inserted,
      skipped: progress.skipped,
      errors: progress.errors,
      duplicates,
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
