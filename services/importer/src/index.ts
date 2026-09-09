import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import {
  downloadJmdict,
  JMDICT_DEFAULT_CACHE,
  JMDICT_SOURCE_NAME,
  sha256File,
} from './download.js';
import { logger } from './logger.js';
import { parseEntry, parseHeaderBlock } from './parser.js';
import {
  completeSourceImport,
  failSourceImport,
  flushEntryBatch,
  markRunning,
  startSourceImport,
  updateImportProgress,
} from './storage.js';
import { validateEntry } from './validate.js';
import type { JmdictEntry, JmdictHeader } from './types.js';

const DEFAULT_BATCH_SIZE = 1000;

interface ImportStats {
  rawEntries: number;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  kanji: number;
  readings: number;
  senses: number;
  glosses: number;
  warnings: number;
  invalid: number;
}

interface ImportArguments {
  filePath?: string;
  batchSize: number;
}

function readArgs(argv: string[]): ImportArguments {
  let batchSize = DEFAULT_BATCH_SIZE;

  const fileIndex = argv.indexOf('--file');
  const filePath = fileIndex < 0 ? undefined : argv[fileIndex + 1];

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

  if (fileIndex >= 0 && (!filePath || filePath.startsWith('--'))) {
    throw new Error('--file requer um caminho de arquivo XML');
  }

  return { filePath, batchSize };
}

function newStats(): ImportStats {
  return {
    rawEntries: 0,
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    kanji: 0,
    readings: 0,
    senses: 0,
    glosses: 0,
    warnings: 0,
    invalid: 0,
  };
}

function processRaw(raw: string, stats: ImportStats): JmdictEntry | null {
  let entry: JmdictEntry;
  try {
    entry = parseEntry(raw);
  } catch (error) {
    stats.invalid += 1;
    stats.skipped += 1;
    logger.warn('entrada ignorada: falha no parse', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const { valid, warnings } = validateEntry(entry);
  if (!valid) {
    stats.invalid += 1;
    stats.skipped += 1;
    stats.warnings += warnings.length;
    logger.warn('entrada ignorada: validação', { sequence: entry.sequence, warnings });
    return null;
  }

  stats.processed += 1;
  stats.kanji += entry.kanji.length;
  stats.readings += entry.readings.length;
  stats.senses += entry.senses.length;
  stats.glosses += entry.senses.reduce((sum, sense) => sum + sense.glosses.length, 0);
  stats.warnings += warnings.length;
  return entry;
}

async function main(): Promise<void> {
  const { filePath, batchSize } = readArgs(process.argv.slice(2));

  let xmlPath: string;
  let checksum: string;
  if (filePath) {
    if (!existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }
    xmlPath = filePath;
    checksum = await sha256File(filePath);
    logger.info('importando arquivo local', { filePath });
  } else {
    const downloaded = await downloadJmdict(process.env.JMDICT_CACHE_DIR ?? JMDICT_DEFAULT_CACHE);
    xmlPath = downloaded.xmlPath;
    checksum = downloaded.checksum;
    logger.info('download concluído', {
      xmlPath,
      checksum,
      bytes: downloaded.bytes,
    });
  }

  const startedAtMs = Date.now();
  const stats = newStats();
  let sourceImportId: string | undefined;
  let header: JmdictHeader | undefined;
  let headerBlock: string[] = [];
  let entryLines: string[] = [];
  let inEntry = false;
  let buffer: JmdictEntry[] = [];

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) {
      return;
    }
    if (!sourceImportId) {
      throw new Error('source_import ainda não registrado');
    }
    const result = await flushEntryBatch(buffer, sourceImportId);
    stats.inserted += result.inserted;
    stats.updated += result.updated;
    buffer = [];
    await updateImportProgress(sourceImportId, {
      processed: stats.processed,
      inserted: stats.inserted,
      updated: stats.updated,
      skipped: stats.skipped,
      errors: stats.invalid,
    });
    logger.info('lote importado', {
      batch: stats.processed,
      inserted: result.inserted,
      updated: result.updated,
      elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  };

  const source = createReadStream(xmlPath);
  const isGzip = xmlPath.toLowerCase().endsWith('.gz');
  const input = isGzip ? source.pipe(createGunzip()) : source;
  const readline = createInterface({ input, crlfDelay: Infinity });

  const finalizeHeader = async (raw: string): Promise<JmdictHeader> => {
    const parsed = parseHeaderBlock(raw);
    sourceImportId = await startSourceImport({
      source: JMDICT_SOURCE_NAME,
      version: parsed.version,
      checksum,
    });
    await markRunning(sourceImportId);
    logger.info('header', {
      version: parsed.version,
      revision: parsed.revision,
      fileVersion: parsed.fileVersion,
      comments: parsed.comments,
    });
    return parsed;
  };

  try {
    for await (const line of readline) {
      if (!header) {
        headerBlock.push(line);
        const closesHeader = line.includes('</header>');
        const opensDocument = line.includes('<JMdict');
        if (closesHeader || opensDocument) {
          header = await finalizeHeader(headerBlock.join('\n'));
          headerBlock = [];
        }
        continue;
      }

      if (line.includes('<entry>')) {
        entryLines = [line];
        inEntry = true;
        continue;
      }

      if (inEntry) {
        entryLines.push(line);
        if (line.includes('</entry>')) {
          inEntry = false;
          stats.rawEntries += 1;
          const entry = processRaw(entryLines.join('\n'), stats);
          if (entry) {
            buffer.push(entry);
            if (buffer.length >= batchSize) {
              await flush();
            }
          }
          entryLines = [];
        }
      }
    }

    if (inEntry) {
      logger.warn('arquivo termina com uma entrada incompleta');
    }

    if (!header) {
      header = await finalizeHeader(headerBlock.join('\n'));
      logger.warn('documento sem raiz JMdict; versão derivada dos comentários', {
        version: header.version,
      });
    }

    await flush();

    if (!sourceImportId) {
      throw new Error('source_import não registrado');
    }
    const finalProgress = {
      processed: stats.processed,
      inserted: stats.inserted,
      updated: stats.updated,
      skipped: stats.skipped,
      errors: stats.invalid,
    };
    await completeSourceImport(sourceImportId, finalProgress, startedAtMs);
  } catch (error) {
    if (sourceImportId) {
      try {
        await failSourceImport(
          sourceImportId,
          error instanceof Error ? error.message : String(error),
          {
            processed: stats.processed,
            inserted: stats.inserted,
            updated: stats.updated,
            skipped: stats.skipped,
            errors: stats.invalid,
          },
          startedAtMs,
        );
      } catch {
        // ignora falha secundária ao registrar o erro
      }
    }
    throw error;
  }

  const elapsedMs = Date.now() - startedAtMs;
  logger.info('importação concluída', {
    source: JMDICT_SOURCE_NAME,
    version: header.version,
    checksum,
    rawEntries: stats.rawEntries,
    entries: stats.processed,
    inserted: stats.inserted,
    updated: stats.updated,
    skipped: stats.skipped,
    invalid: stats.invalid,
    kanji: stats.kanji,
    readings: stats.readings,
    senses: stats.senses,
    glosses: stats.glosses,
    warnings: stats.warnings,
    elapsedSeconds: Math.round(elapsedMs / 1000),
    entriesPerSecond: elapsedMs > 0 ? Math.round((stats.processed * 1000) / elapsedMs) : 0,
    rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    batchSize,
  });

  process.exit(0);
}

void main().catch((error: unknown) => {
  logger.error('importação falhou', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
