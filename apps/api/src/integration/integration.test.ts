import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DEFAULT_DATABASE_URL = 'postgresql://kotoba:kotoba_dev_password@localhost:5432/kotoba';

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const adminUrl = databaseUrl.replace(/\/[^/]*$/, '/postgres');
const testDatabaseUrl = databaseUrl.replace(/\/[^/]*$/, '/kotoba_test');

process.env.DATABASE_URL = testDatabaseUrl;

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../packages/database/migrations', import.meta.url),
);
const FIXTURE_FILE = fileURLToPath(
  new URL('../../../../services/importer/fixtures/jmdict-fixture.xml', import.meta.url),
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

describe('integração', () => {
  let app: FastifyInstance | undefined;
  let db: typeof import('@kotoba/database').db;

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
      source: 'JMdict',
      version: '2026-09-08',
      checksum: 'fixture-de-teste',
    });
    await markRunning(sourceImportId);
    await flushEntryBatch(entries, sourceImportId);
    await completeSourceImport(
      sourceImportId,
      {
        processed: entries.length,
        inserted: entries.length,
        updated: 0,
        skipped: 0,
        errors: 0,
      },
      Date.now(),
    );

    const { buildApp } = await import('../app.js');
    app = buildApp({ loggerLevel: 'silent' });
  }, 60_000);

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    try {
      await db.$client.end();
    } catch {
      // conexão já encerrada
    }
  });

  it('conecta ao PostgreSQL', async () => {
    const rows = await db.execute(sql`select 1 as ok`);
    expect(rows[0]?.ok).toBe(1);
  });

  it('importa entradas do JMdict', async () => {
    const total = await db.execute(sql`select count(*)::int as total from entries`);
    expect(total[0]?.total).toBe(4);

    const readings = await db.execute(sql`
      select r.text, r.romaji
      from readings r
      join entries e on e.id = r.entry_id
      where e.jmdict_seq = 1410460
      order by r.position
    `);
    expect(readings).toEqual([
      { text: 'たべる', romaji: 'taberu' },
      { text: 'はむ', romaji: 'hamu' },
    ]);

    const sourceImports = await db.execute(sql`select count(*)::int as total from source_imports`);
    expect(sourceImports[0]?.total).toBe(1);
  });

  it('expõe endpoint de busca', async () => {
    const response = await app?.inject({ method: 'GET', url: '/api/v1/search?q=taberu' });
    expect(response?.statusCode).toBe(200);

    const body = response?.json<{
      query: string;
      results: Array<{
        kanji: string[];
        romaji: string[];
        glosses: Array<{ language: string; text: string }>;
      }>;
    }>();
    expect(body?.query).toBe('taberu');
    expect(body?.results[0]?.kanji).toContain('食べる');
    expect(body?.results[0]?.romaji).toContain('taberu');
    expect(body?.results[0]?.glosses).toContainEqual({ language: 'pt', text: 'comer' });
  });

  it('busca por romaji e por português', async () => {
    const byRomaji = await app?.inject({ method: 'GET', url: '/api/v1/search?q=nippon' });
    const romajiBody = byRomaji?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(romajiBody?.results[0]?.kanji).toContain('日本');

    const byPortuguese = await app?.inject({ method: 'GET', url: '/api/v1/search?q=estudante' });
    const portugueseBody = byPortuguese?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(portugueseBody?.results[0]?.kanji).toContain('学生');
  });

  it('busca fuzzy tolera erros de digitação (§12)', async () => {
    const byRomaji = await app?.inject({ method: 'GET', url: '/api/v1/search?q=taberru' });
    const byRomajiBody = byRomaji?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(byRomajiBody?.results[0]?.kanji).toContain('食べる');

    const byGloss = await app?.inject({ method: 'GET', url: '/api/v1/search?q=comrr' });
    const byGlossBody = byGloss?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(byGlossBody?.results[0]?.kanji).toContain('食べる');
  });

  it('busca por variantes kana via tier token (katakana/half-width)', async () => {
    for (const q of ['タベル', 'ﾀﾍﾞﾙ']) {
      const response = await app?.inject({
        method: 'GET',
        url: `/api/v1/search?q=${encodeURIComponent(q)}`,
      });
      expect(response?.statusCode).toBe(200);
      const body = response?.json<{ results: Array<{ kanji: string[] }> }>();
      expect(body?.results[0]?.kanji).toContain('食べる');
    }
  });

  it('busca gloss sem acento pelo tier token', async () => {
    const response = await app?.inject({ method: 'GET', url: '/api/v1/search?q=comestivel' });
    expect(response?.statusCode).toBe(200);
    const body = response?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(body?.results[0]?.kanji).toContain('食べる');
  });

  it('pagina resultados com offset e valida offset inválido', async () => {
    const all = await app?.inject({ method: 'GET', url: '/api/v1/search?q=a&limit=50&offset=0' });
    const allBody = all?.json<{ results: Array<{ id: string }> }>();
    expect(allBody?.results.length ?? 0).toBeGreaterThanOrEqual(2);

    const page1 = await app?.inject({ method: 'GET', url: '/api/v1/search?q=a&limit=1&offset=0' });
    const page2 = await app?.inject({ method: 'GET', url: '/api/v1/search?q=a&limit=1&offset=1' });
    expect(page1?.statusCode).toBe(200);
    expect(page2?.statusCode).toBe(200);
    const first = page1?.json<{ results: Array<{ id: string }> }>();
    const second = page2?.json<{ results: Array<{ id: string }> }>();
    expect(first?.results).toHaveLength(1);
    expect(second?.results).toHaveLength(1);
    expect(first?.results[0]?.id).not.toBe(second?.results[0]?.id);

    const invalid = await app?.inject({ method: 'GET', url: '/api/v1/search?q=taberu&offset=-1' });
    expect(invalid?.statusCode).toBe(400);
  });

  it('expõe endpoint de entrada', async () => {
    const search = await app?.inject({ method: 'GET', url: '/api/v1/search?q=taberu' });
    const id = search?.json<{ results: Array<{ id: string }> }>().results[0]?.id;
    expect(id).toBeTruthy();

    const response = await app?.inject({ method: 'GET', url: `/api/v1/entries/${id}` });
    expect(response?.statusCode).toBe(200);

    const body = response?.json<{
      id: string;
      jmdictSeq: number;
      kanji: Array<{ text: string }>;
      readings: Array<{ text: string; romaji: string }>;
      senses: Array<{ glosses: Array<{ language: string; text: string }> }>;
      createdAt?: unknown;
    }>();
    expect(body?.id).toBe(id);
    expect(body?.jmdictSeq).toBe(1410460);
    expect(body?.kanji[0]?.text).toBe('食べる');
    expect(body?.readings[0]?.romaji).toBe('taberu');
    expect(
      body?.senses.some((sense) => sense.glosses.some((gloss) => gloss.language === 'pt')),
    ).toBe(true);
    expect(body).not.toHaveProperty('createdAt');
  });

  it('executa o fluxo end-to-end: seed → banco → API → busca → resultado', async () => {
    const search = await app?.inject({ method: 'GET', url: '/api/v1/search?q=gakusei' });
    const result = search?.json<{
      results: Array<{ id: string; kanji: string[]; readings: string[]; romaji: string[] }>;
    }>();
    expect(result?.results[0]?.kanji).toContain('学生');
    expect(result?.results[0]?.readings).toContain('がくせい');
    expect(result?.results[0]?.romaji).toContain('gakusei');

    const detail = await app?.inject({
      method: 'GET',
      url: `/api/v1/entries/${result?.results[0]?.id}`,
    });
    expect(detail?.statusCode).toBe(200);
    const detailBody = detail?.json<{ readings: Array<{ text: string; romaji: string }> }>();
    expect(detailBody?.readings[0]?.romaji).toBe('gakusei');
  });
});
