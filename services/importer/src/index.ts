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
import { importEntry, registerSourceImport } from './storage.js';
import { validateEntry } from './validate.js';
import type { JmdictEntry, JmdictHeader } from './types.js';

interface ImportStats {
  startedAt: number;
  entries: number;
  kanji: number;
  readings: number;
  senses: number;
  glosses: number;
  warnings: number;
  invalid: number;
}

interface ImportArguments {
  filePath?: string;
}

function readArgs(argv: string[]): ImportArguments {
  const fileIndex = argv.indexOf('--file');
  if (fileIndex < 0) {
    return {};
  }
  const filePath = argv[fileIndex + 1];
  if (!filePath || filePath.startsWith('--')) {
    throw new Error('--file requer um caminho de arquivo XML');
  }
  return { filePath };
}

function newStats(): ImportStats {
  return {
    startedAt: Date.now(),
    entries: 0,
    kanji: 0,
    readings: 0,
    senses: 0,
    glosses: 0,
    warnings: 0,
    invalid: 0,
  };
}

async function processEntry(raw: string, stats: ImportStats): Promise<void> {
  let entry: JmdictEntry;
  try {
    entry = parseEntry(raw);
  } catch (error) {
    stats.invalid += 1;
    logger.warn('entrada ignorada: falha no parse', {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const { valid, warnings } = validateEntry(entry);
  if (!valid) {
    stats.invalid += 1;
    stats.warnings += warnings.length;
    logger.warn('entrada ignorada: validação', { sequence: entry.sequence, warnings });
    return;
  }

  await importEntry(entry);
  stats.entries += 1;
  stats.kanji += entry.kanji.length;
  stats.readings += entry.readings.length;
  stats.senses += entry.senses.length;
  stats.glosses += entry.senses.reduce((sum, sense) => sum + sense.glosses.length, 0);
  stats.warnings += warnings.length;

  if (stats.entries % 1000 === 0) {
    logger.info('progresso', {
      entries: stats.entries,
      readings: stats.readings,
      senses: stats.senses,
      glosses: stats.glosses,
      warnings: stats.warnings,
      elapsedSeconds: Math.round((Date.now() - stats.startedAt) / 1000),
    });
  }
}

async function main(): Promise<void> {
  const { filePath } = readArgs(process.argv.slice(2));

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

  const stats = newStats();
  let header: JmdictHeader | undefined;
  let headerBlock: string[] = [];
  let entryLines: string[] = [];
  let inEntry = false;

  const source = createReadStream(xmlPath);
  const isGzip = xmlPath.toLowerCase().endsWith('.gz');
  const input = isGzip ? source.pipe(createGunzip()) : source;
  const readline = createInterface({ input, crlfDelay: Infinity });

  for await (const line of readline) {
    if (!header) {
      headerBlock.push(line);
      if (line.includes('</header>')) {
        header = parseHeaderBlock(headerBlock.join('\n'));
        headerBlock = [];
        logger.info('header', {
          version: header.version,
          revision: header.revision,
          fileVersion: header.fileVersion,
          comments: header.comments,
        });
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
        await processEntry(entryLines.join('\n'), stats);
        entryLines = [];
      }
    }
  }

  if (inEntry) {
    logger.warn('arquivo termina com uma entrada incompleta');
  }

  if (!header) {
    header = parseHeaderBlock(headerBlock.join('\n'));
    logger.warn('header não encontrado; usando versão derivada', {
      version: header.version,
    });
  }

  const inserted = await registerSourceImport({
    source: JMDICT_SOURCE_NAME,
    version: header.version,
    checksum,
  });

  logger.info('importação concluída', {
    source: JMDICT_SOURCE_NAME,
    version: header.version,
    entries: stats.entries,
    kanji: stats.kanji,
    readings: stats.readings,
    senses: stats.senses,
    glosses: stats.glosses,
    warnings: stats.warnings,
    invalid: stats.invalid,
    inserted,
    elapsedSeconds: Math.round((Date.now() - stats.startedAt) / 1000),
  });

  process.exit(0);
}

void main().catch((error: unknown) => {
  logger.error('importação falhou', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
