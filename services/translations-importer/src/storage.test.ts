import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DEFAULT_DATABASE_URL = 'postgresql://kotoba:kotoba_dev_password@localhost:5432/kotoba';

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const adminUrl = databaseUrl.replace(/\/[^/]*$/, '/postgres');
const testDatabaseUrl = databaseUrl.replace(/\/[^/]*$/, '/kotoba_test');

process.env.DATABASE_URL = testDatabaseUrl;

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../packages/database/migrations', import.meta.url),
);
const FIXTURE_FILE = fileURLToPath(
  new URL('../../../services/importer/fixtures/jmdict-fixture.xml', import.meta.url),
);

function extractEntries(xml: string): string[] {
  const blocks: string[] = [];
  const pattern = /<entry>[\s\S]*?<\/entry>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}

describe('traduções Kotoba (storage)', () => {
  let db: typeof import('@kotoba/database').db;
  let flushTranslationBatch: typeof import('./storage.js').flushTranslationBatch;
  let replaceTranslationRows: typeof import('./storage.js').replaceTranslationRows;
  let startTranslationImport: typeof import('./storage.js').startTranslationImport;

  beforeAll(async () => {
    const { default: postgres } = await import('postgres');
    const admin = postgres(adminUrl);
    await admin.unsafe('DROP DATABASE IF EXISTS kotoba_test WITH (FORCE)');
    await admin.unsafe('CREATE DATABASE kotoba_test');
    await admin.end();

    const database = await import('@kotoba/database');
    db = database.db;

    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    const { parseEntry } = await import('@kotoba/importer/parser');
    const { completeSourceImport, flushEntryBatch, markRunning, startSourceImport } =
      await import('@kotoba/importer/storage');

    const xml = await readFile(FIXTURE_FILE, 'utf8');
    const entries = extractEntries(xml).map((raw) => parseEntry(raw));
    const sourceImportId = await startSourceImport({
      source: 'jmdict',
      version: 'translations-storage-test',
      checksum: 'fixture',
    });
    await markRunning(sourceImportId);
    await flushEntryBatch(entries, sourceImportId);
    await completeSourceImport(
      sourceImportId,
      { processed: 5, inserted: 5, updated: 0, skipped: 0, errors: 0 },
      Date.now(),
    );

    const storage = await import('./storage.js');
    flushTranslationBatch = storage.flushTranslationBatch;
    replaceTranslationRows = storage.replaceTranslationRows;
    startTranslationImport = storage.startTranslationImport;
  }, 60_000);

  afterAll(async () => {
    try {
      await db.$client.end();
    } catch {
      // conexão já encerrada
    }
  });

  it('mapeia jmdict_seq + position da acepção e insere proveniência', async () => {
    const result = await flushTranslationBatch([
      {
        jmdictSeq: 1206900,
        sensePosition: 0,
        language: 'pt-BR',
        text: 'estudante',
        source: 'manual',
        sourceVersion: 'manual-curated-1',
        kanji: ['学生'],
        reading: ['がくせい'],
      },
    ]);
    expect(result).toEqual({ inserted: 1, skipped: 0, errors: 0 });

    const rows = await db.execute(
      sql`select t.language, t.text, t.source, t.source_version from translations t
          join senses s on s.id = t.sense_id
          join entries e on e.id = s.entry_id
          where e.jmdict_seq = 1206900`,
    );
    expect(rows).toEqual([
      {
        language: 'pt-BR',
        text: 'estudante',
        source: 'manual',
        source_version: 'manual-curated-1',
      },
    ]);
  });

  it('ignora acepções inexistentes (jmdict_seq/sense_position desconhecidos)', async () => {
    const result = await flushTranslationBatch([
      {
        jmdictSeq: 1,
        sensePosition: 0,
        language: 'pt-BR',
        text: 'fantasma',
        source: 'manual',
        sourceVersion: 'x',
      },
    ]);
    expect(result).toEqual({ inserted: 0, skipped: 1, errors: 0 });

    const count = await db.execute(sql`select count(*)::int as total from translations`);
    expect(count[0]?.total).toBe(1);
  });

  it('é idempotente: reaplicar o mesmo lote não duplica', async () => {
    const rows = [
      {
        jmdictSeq: 1206900,
        sensePosition: 0,
        language: 'pt-BR',
        text: 'estudante',
        source: 'manual',
        sourceVersion: 'manual-curated-1',
        kanji: ['学生'],
        reading: ['がくせい'],
      },
      {
        jmdictSeq: 1358280,
        sensePosition: 1,
        language: 'pt-BR',
        text: 'comer',
        source: 'manual',
        sourceVersion: 'manual-curated-1',
        kanji: ['食べる'],
        reading: ['たべる'],
      },
    ];
    const first = await flushTranslationBatch(rows);
    expect(first.inserted).toBe(1);
    expect(first.errors).toBe(0);

    const second = await flushTranslationBatch(rows);
    expect(second.inserted).toBe(0);
    expect(second.errors).toBe(0);

    const count = await db.execute(sql`select count(*)::int as total from translations`);
    expect(count[0]?.total).toBe(2);
  });

  it('rejeita identidade declarada que não pertence ao jmdict_seq (regressão §7b)', async () => {
    const before = await db.execute(sql`select count(*)::int as total from translations`);
    const result = await flushTranslationBatch([
      {
        jmdictSeq: 1358280,
        sensePosition: 1,
        language: 'pt-BR',
        text: 'comer',
        source: 'manual',
        sourceVersion: 'manual-curated-1',
        kanji: ['帯同'],
        reading: ['たいどう'],
      },
    ]);
    expect(result).toEqual({ inserted: 0, skipped: 0, errors: 1 });

    const after = await db.execute(sql`select count(*)::int as total from translations`);
    expect(after[0]?.total).toBe(before[0]?.total);
  });

  it('rejeita linha sem identidade declarada (kanji/reading)', async () => {
    const result = await flushTranslationBatch([
      {
        jmdictSeq: 1206900,
        sensePosition: 0,
        language: 'pt-BR',
        text: 'estudante',
        source: 'manual',
        sourceVersion: 'manual-curated-1',
      },
    ]);
    expect(result).toEqual({ inserted: 0, skipped: 0, errors: 1 });
  });

  it('substitui linhas por (source, sourceVersion) ao reaplicar', async () => {
    const row = {
      jmdictSeq: 1206900,
      sensePosition: 0,
      language: 'pt-BR',
      text: 'colega',
      source: 'manual',
      sourceVersion: 'manual-curated-1',
      kanji: ['学生'],
      reading: ['がくせい'],
    };
    const first = await flushTranslationBatch([row]);
    expect(first.inserted).toBe(1);

    await replaceTranslationRows([{ source: 'manual', sourceVersion: 'manual-curated-1' }]);
    const afterReplace = await db.execute(sql`select count(*)::int as total from translations`);
    expect(afterReplace[0]?.total).toBe(0);

    const second = await flushTranslationBatch([row]);
    expect(second.inserted).toBe(1);
  });

  it('registra source_imports próprio para a camada Kotoba', async () => {
    const handle = await startTranslationImport({
      source: 'kotoba-translations',
      version: 'test-1',
      checksum: 'abc',
    });
    expect(handle.id).toBeTruthy();
    expect(handle.status).toBe('pending');

    const same = await startTranslationImport({
      source: 'kotoba-translations',
      version: 'test-1',
      checksum: 'abc',
    });
    expect(same.id).toBe(handle.id);
  });
});
