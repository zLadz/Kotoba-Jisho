import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JmdictEntry } from './types.js';

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

async function importFixture(
  storage: typeof import('@kotoba/importer/storage'),
  parser: typeof import('@kotoba/importer/parser'),
  entriesCount: number,
  sourceImportId: string,
): Promise<void> {
  const xml = await readFile(FIXTURE_FILE, 'utf8');
  const entries = extractEntries(xml)
    .slice(0, entriesCount)
    .map((raw) => parser.parseEntry(raw));
  await storage.flushEntryBatch(entries, sourceImportId);
}

describe('armazenamento em lote (importer)', () => {
  let db: typeof import('@kotoba/database').db;
  let storage: typeof import('@kotoba/importer/storage');
  let parser: typeof import('@kotoba/importer/parser');
  let sourceImportId: string;

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

    parser = await import('@kotoba/importer/parser');
    storage = await import('@kotoba/importer/storage');

    sourceImportId = await storage.startSourceImport({
      source: 'jmdict',
      version: 'fixture-1',
      checksum: 'abc123',
    });
    await storage.markRunning(sourceImportId);
  }, 60_000);

  afterAll(async () => {
    try {
      await db.$client.end();
    } catch {
      // conexão já encerrada
    }
  });

  it('insere um lote e grava provenance e campos normalizados', async () => {
    await importFixture(storage, parser, 4, sourceImportId);

    const entries = await db.execute(
      sql`select count(*)::int as total from entries where source_import_id = ${sourceImportId}`,
    );
    expect(entries[0]?.total).toBe(4);

    const readings = await db.execute(
      sql`
        select r.normalized_text
        from readings r
        join entries e on e.id = r.entry_id
        where e.jmdict_seq = 1410460
      `,
    );
    expect(readings.map((row) => row.normalized_text)).toEqual(['たべる', 'はむ']);

    const glosses = await db.execute(
      sql`
        select g.normalized_text, g.language, g.source
        from glosses g
        where g.normalized_text like '%comer%'
      `,
    );
    expect(glosses.length).toBeGreaterThan(0);
    expect(glosses[0]?.source).toBe('jmdict');
  });

  it('reimporta o mesmo lote sem duplicar e conta como atualização', async () => {
    await importFixture(storage, parser, 4, sourceImportId);

    const entries = await db.execute(sql`select count(*)::int as total from entries`);
    expect(entries[0]?.total).toBe(4);

    const glossCount = await db.execute(sql`select count(*)::int as total from glosses`);
    const prevGlossCount = glossCount[0]?.total ?? 0;

    const result = await storage.flushEntryBatch(await parseAll(), sourceImportId);
    expect(result).toEqual({ inserted: 0, updated: 4 });

    const after = await db.execute(sql`select count(*)::int as total from glosses`);
    expect(after[0]?.total).toBe(prevGlossCount);
  });

  it('substitui crianças ao reimportar (sem sobras)', async () => {
    const xml = await readFile(FIXTURE_FILE, 'utf8');
    const original = extractEntries(xml)
      .slice(0, 1)
      .map((raw) => parser.parseEntry(raw));

    const entryWithExtraReading: (typeof original)[0] = {
      ...original[0]!,
      readings: [
        ...original[0]!.readings,
        {
          position: original[0]!.readings.length,
          text: 'たべりる',
          noKanji: false,
          restrictions: [],
          infos: [],
          priorities: [],
        },
      ],
    };

    await storage.flushEntryBatch(original, sourceImportId);
    const readingsBefore = await db.execute(
      sql`select count(*)::int as total from readings where entry_id = (select id from entries where jmdict_seq = ${original[0]!.sequence})`,
    );
    expect(readingsBefore[0]?.total).toBe(original[0]!.readings.length);

    await storage.flushEntryBatch([entryWithExtraReading], sourceImportId);

    const readingsAfter = await db.execute(
      sql`select count(*)::int as total from readings where entry_id = (select id from entries where jmdict_seq = ${original[0]!.sequence})`,
    );
    expect(readingsAfter[0]?.total).toBe(original[0]!.readings.length + 1);

    const texts = await db.execute(
      sql`select string_agg(text, ',' order by position) as texts from readings where entry_id = (select id from entries where jmdict_seq = ${original[0]!.sequence})`,
    );
    expect(texts[0]?.texts).toContain('たべりる');
  });

  it('rejeita lote inválido e faz rollback atômico', async () => {
    const xml = await readFile(FIXTURE_FILE, 'utf8');
    const entries = extractEntries(xml)
      .slice(0, 2)
      .map((raw) => parser.parseEntry(raw));

    const before = await db.execute(sql`select count(*)::int as total from entries`);
    const duplicate = { ...entries[1]!, sequence: entries[0]!.sequence };
    await expect(
      storage.flushEntryBatch([entries[0]!, duplicate], sourceImportId),
    ).rejects.toThrow();

    const after = await db.execute(sql`select count(*)::int as total from entries`);
    expect(after[0]?.total).toBe(before[0]?.total);
  });

  it('gerencia o ciclo de vida de source_import (idempotente por source+version)', async () => {
    const first = await storage.startSourceImport({
      source: 'jmdict',
      version: 'fixture-2',
      checksum: 'def456',
    });
    const second = await storage.startSourceImport({
      source: 'jmdict',
      version: 'fixture-2',
      checksum: 'def456',
    });
    expect(second).toBe(first);

    await storage.markRunning(first);
    const running = await db.execute(sql`select status from source_imports where id = ${first}`);
    expect(running[0]?.status).toBe('running');

    const startedAt = Date.now();
    await storage.completeSourceImport(
      first,
      { processed: 10, inserted: 8, updated: 2, skipped: 0, errors: 0 },
      startedAt,
    );
    const completed = await db.execute(
      sql`
        select status, entries_inserted as "entriesInserted",
               entries_updated as "entriesUpdated", duration_ms as "durationMs"
        from source_imports where id = ${first}
      `,
    );
    expect(completed[0]?.status).toBe('completed');
    expect(completed[0]?.entriesInserted).toBe(8);
    expect(completed[0]?.entriesUpdated).toBe(2);
    expect(completed[0]?.durationMs).toBeGreaterThanOrEqual(0);

    await storage.failSourceImport(
      first,
      'boom',
      { processed: 5, inserted: 3, updated: 1, skipped: 1, errors: 0 },
      startedAt,
    );
    const failed = await db.execute(
      sql`select status, error_message as "errorMessage" from source_imports where id = ${first}`,
    );
    expect(failed[0]?.status).toBe('failed');
    expect(failed[0]?.errorMessage).toBe('boom');
  });

  it('permite reexecução após falha na mesma source+version', async () => {
    const id = await storage.startSourceImport({
      source: 'jmdict',
      version: 'fixture-3',
      checksum: 'ghi789',
    });
    await storage.markRunning(id);
    await storage.failSourceImport(
      id,
      'timeout de rede',
      { processed: 2, inserted: 1, updated: 1, skipped: 0, errors: 0 },
      Date.now(),
    );

    const retriedId = await storage.startSourceImport({
      source: 'jmdict',
      version: 'fixture-3',
      checksum: 'ghi789',
    });
    expect(retriedId).toBe(id);
    await storage.markRunning(retriedId);
    const before = await db.execute(
      sql`select status, entries_inserted as "inserted" from source_imports where id = ${id}`,
    );
    expect(before[0]?.status).toBe('running');
    expect(before[0]?.inserted).toBe(0);

    await storage.completeSourceImport(
      id,
      { processed: 4, inserted: 4, updated: 0, skipped: 0, errors: 0 },
      Date.now(),
    );
    const after = await db.execute(
      sql`select status, entries_inserted as "inserted", error_message as "errorMessage" from source_imports where id = ${id}`,
    );
    expect(after[0]?.status).toBe('completed');
    expect(after[0]?.inserted).toBe(4);
    expect(after[0]?.errorMessage).toBeNull();
  });

  it('lote vazio não toca o banco', async () => {
    const before = await db.execute(sql`select count(*)::int as total from entries`);
    const result = await storage.flushEntryBatch([], sourceImportId);
    expect(result).toEqual({ inserted: 0, updated: 0 });
    const after = await db.execute(sql`select count(*)::int as total from entries`);
    expect(after[0]?.total).toBe(before[0]?.total);
  });

  describe('constraints do banco (§15)', () => {
    it('enforce a unicidade de source+version em source_imports', async () => {
      await db.execute(
        sql`
          insert into source_imports (source, version, checksum)
          values ('constraint-src', 'constraint-version', 'aaa')
        `,
      );
      await expect(
        db.execute(
          sql`
            insert into source_imports (source, version, checksum)
            values ('constraint-src', 'constraint-version', 'bbb')
          `,
        ),
      ).rejects.toThrow();
    });

    it('enforce a unicidade de jmdict_seq em entries', async () => {
      await expect(
        db.execute(
          sql`
            insert into entries (jmdict_seq, source_import_id)
            values (1410460, ${sourceImportId})
          `,
        ),
      ).rejects.toThrow();
    });

    it('rejeita filhos órfãos (cascata de FKs)', async () => {
      const ghostId = '00000000-0000-0000-0000-000000000000';
      await expect(
        db.execute(sql`insert into readings (entry_id, text) values (${ghostId}, 'x')`),
      ).rejects.toThrow();
      await expect(
        db.execute(sql`insert into senses (entry_id) values (${ghostId})`),
      ).rejects.toThrow();
      await expect(
        db.execute(sql`insert into glosses (sense_id, text) values (${ghostId}, 'x')`),
      ).rejects.toThrow();
    });

    it('aplica NOT NULL com default em colunas normalizadas', async () => {
      const found = await db.execute(sql`select id from entries where jmdict_seq = 1410460`);
      const entryId = found[0]?.id as string;
      const readingId = await db.execute(
        sql`insert into readings (entry_id, position, text) values (${entryId}, 99, 'hoge') returning id`,
      );
      const row = await db.execute(
        sql`select text, normalized_text as normalized, romaji from readings where id = ${readingId[0]?.id}`,
      );
      expect(row[0]?.normalized).toBe('');
      expect(row[0]?.romaji).toBe('');
      expect(row[0]?.text).toBe('hoge');
    });

    it('cria todos os índices de pesquisa esperados', async () => {
      const indexes = await db.execute(
        sql`
          select indexname
          from pg_indexes
          where schemaname = 'public'
            and indexname in (
              'readings_text_trgm_idx',
              'readings_romaji_trgm_idx',
              'readings_normalized_text_idx',
              'readings_normalized_text_trgm_idx',
              'kanji_forms_text_trgm_idx',
              'glosses_text_trgm_idx',
              'glosses_normalized_text_idx',
              'glosses_normalized_text_trgm_idx',
              'source_imports_source_version_unique',
              'entries_jmdict_seq_unique'
            )
        `,
      );
      expect(indexes.map((row) => row.indexname).sort()).toEqual(
        [
          'readings_text_trgm_idx',
          'readings_romaji_trgm_idx',
          'readings_normalized_text_idx',
          'readings_normalized_text_trgm_idx',
          'kanji_forms_text_trgm_idx',
          'glosses_text_trgm_idx',
          'glosses_normalized_text_idx',
          'glosses_normalized_text_trgm_idx',
          'source_imports_source_version_unique',
          'entries_jmdict_seq_unique',
        ].sort(),
      );
    });
  });

  function parseAll(): Promise<JmdictEntry[]> {
    return readFile(FIXTURE_FILE, 'utf8').then((xml) =>
      extractEntries(xml).map((raw) => parser.parseEntry(raw)),
    );
  }
});

export {};
