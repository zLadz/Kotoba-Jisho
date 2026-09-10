import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { normalizeGloss } from '@kotoba/normalize';
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
const SMOKE_FILE = fileURLToPath(
  new URL('../../../services/translations-importer/fixtures/pt-br-smoke.json', import.meta.url),
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
  let importTranslationsAtomically: typeof import('./storage.js').importTranslationsAtomically;

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
    importTranslationsAtomically = storage.importTranslationsAtomically;
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

  describe('importação atômica, validação e índices (hardening)', () => {
    const clearTranslations = async (): Promise<void> => {
      await db.execute(sql`delete from translations`);
    };

    const countTranslations = async (): Promise<number> => {
      const rows = await db.execute(sql`select count(*)::int as total from translations`);
      return Number(rows[0]?.total ?? 0);
    };

    const distinctPairs = (
      rows: Array<{ source: string; sourceVersion: string }>,
    ): Array<{ source: string; sourceVersion: string }> => [
      ...new Map(
        rows.map((row) => [
          `${row.source}|${row.sourceVersion}`,
          { source: row.source, sourceVersion: row.sourceVersion },
        ]),
      ).values(),
    ];

    it('persiste o checksum ao concluir para permitir early-exit idempotente', async () => {
      const { completeTranslationImport, markRunning, startTranslationImport } =
        await import('./storage.js');

      const first = await startTranslationImport({
        source: 'manual',
        version: 'checksum-test-1',
        checksum: 'abc',
      });
      await markRunning(first.id);
      await completeTranslationImport(
        first.id,
        { processed: 1, inserted: 0, skipped: 0, errors: 0 },
        Date.now(),
        'abc',
      );

      const rerun = await startTranslationImport({
        source: 'manual',
        version: 'checksum-test-1',
        checksum: 'abc',
      });
      expect(rerun.status).toBe('completed');
      expect(rerun.checksum).toBe('abc');

      const changed = await startTranslationImport({
        source: 'manual',
        version: 'checksum-test-1',
        checksum: 'def',
      });
      expect(changed.checksum).toBe('abc');

      await db.execute(sql`delete from source_imports where id = ${first.id}`);
    });

    it('substitui e insere (source, sourceVersion) em uma única transação atômica', async () => {
      await clearTranslations();

      const seeded = await flushTranslationBatch([
        {
          jmdictSeq: 1206900,
          sensePosition: 0,
          language: 'pt-BR',
          text: 'colega',
          source: 'manual',
          sourceVersion: 'manual-curated-1',
          kanji: ['学生'],
          reading: ['がくせい'],
        },
      ]);
      expect(seeded).toEqual({ inserted: 1, skipped: 0, errors: 0 });

      const result = await importTranslationsAtomically(
        [
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
            jmdictSeq: 1206900,
            sensePosition: 0,
            language: 'pt-BR',
            text: 'aluno',
            source: 'manual',
            sourceVersion: 'manual-curated-1',
            kanji: ['学生'],
            reading: ['がくせい'],
          },
        ],
        [{ source: 'manual', sourceVersion: 'manual-curated-1' }],
      );
      expect(result).toEqual({ inserted: 2, skipped: 0, errors: 0 });

      const rows = await db.execute(
        sql`select t.text from translations t
            join senses s on s.id = t.sense_id
            join entries e on e.id = s.entry_id
            where e.jmdict_seq = 1206900 order by t.position`,
      );
      expect(rows.map((row) => row.text)).toEqual(['estudante', 'aluno']);
    });

    it('faz rollback e preserva o estado anterior quando a transação falha', async () => {
      await clearTranslations();

      await importTranslationsAtomically(
        [
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
        ],
        [{ source: 'manual', sourceVersion: 'manual-curated-1' }],
      );
      const before = await countTranslations();
      expect(before).toBe(1);

      await expect(
        importTranslationsAtomically(
          [
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
              jmdictSeq: 1206900,
              sensePosition: 0,
              language: 'pt-BR',
              text: 'estudante',
              source: 'manual',
              sourceVersion: 'manual-curated-1',
              kanji: ['学生'],
              reading: ['がくせい'],
            },
          ],
          [{ source: 'manual', sourceVersion: 'manual-curated-1' }],
        ),
      ).rejects.toThrow();

      const after = await countTranslations();
      expect(after).toBe(before);
      const comerRows = await db.execute(
        sql`select t.text from translations t
            join senses s on s.id = t.sense_id
            join entries e on e.id = s.entry_id
            where e.jmdict_seq = 1358280`,
      );
      expect(comerRows.map((row) => row.text)).toEqual(['comer']);
    });

    it('cria os índices do hardening na tabela translations', async () => {
      const rows = await db.execute(
        sql`select indexname from pg_indexes where tablename = 'translations'`,
      );
      const names = rows.map((row) => row.indexname);
      expect(names).toContain('translations_text_trgm_idx');
      expect(names).toContain('translations_language_idx');
      expect(names).toContain('translations_source_source_version_idx');
      expect(names).toContain('translations_normalized_text_trgm_idx');
      expect(names).toContain('translations_sense_language_text_source_unique');
    });

    it('a unicidade é imposta pelo banco (constraint)', async () => {
      await clearTranslations();

      const senseRows = await db.execute(
        sql`select s.id from senses s join entries e on e.id = s.entry_id where e.jmdict_seq = 1358280 order by s.position limit 1`,
      );
      const senseId = String(senseRows[0]?.id);
      const insert = async (): Promise<void> => {
        await db.execute(
          sql`insert into translations (sense_id, position, language, text, normalized_text, source, source_version)
              values (${senseId}, 9, 'pt-BR', 'comer', ${normalizeGloss('comer')}, 'manual', 'unique-test-1')`,
        );
      };
      await insert();
      await expect(insert()).rejects.toThrow();
      expect(await countTranslations()).toBe(1);
    });

    it('importa o dataset de validação (smoke) de forma idempotente e atômica', async () => {
      await clearTranslations();

      const smoke = JSON.parse(await readFile(SMOKE_FILE, 'utf8')) as {
        translations: Array<{
          jmdictSeq: number;
          sensePosition: number;
          language: string;
          text: string;
          source: string;
          sourceVersion: string;
        }>;
      };
      const seen = new Set<string>();
      const unique = smoke.translations.filter((row) => {
        const key = [
          row.jmdictSeq,
          row.sensePosition,
          row.language,
          row.text,
          row.source,
          row.sourceVersion,
        ].join('|');
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      expect(smoke.translations.length).toBe(16);
      expect(unique.length).toBe(15);

      const first = await importTranslationsAtomically(unique, distinctPairs(unique));
      expect(first).toEqual({ inserted: 7, skipped: 8, errors: 0 });
      expect(await countTranslations()).toBe(7);

      const second = await importTranslationsAtomically(unique, distinctPairs(unique));
      expect(second).toEqual({ inserted: 7, skipped: 8, errors: 0 });
      expect(await countTranslations()).toBe(7);
    });
  });
});
