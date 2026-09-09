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
  new URL('../../../../../packages/database/migrations', import.meta.url),
);
const FIXTURE_FILE = fileURLToPath(
  new URL('../../../../../services/importer/fixtures/jmdict-fixture.xml', import.meta.url),
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

const ALL_MATCH_TYPES = [
  'exactGloss',
  'exactKanji',
  'exactReading',
  'exactRomaji',
  'fuzzyGloss',
  'fuzzyKanji',
  'fuzzyReading',
  'fuzzyRomaji',
  'prefixGloss',
  'prefixKanji',
  'prefixReading',
  'prefixRomaji',
  'tokenFuzzyGloss',
  'tokenFuzzyReading',
  'tokenGloss',
  'tokenPrefixGloss',
  'tokenPrefixReading',
  'tokenReading',
].sort();

describe('repository de busca (tiers)', () => {
  let db: typeof import('@kotoba/database').db;
  let searchEntries: typeof import('./search.repository.js').searchEntries;
  let eatId: string;

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
    const { markRunning, startSourceImport, flushEntryBatch, completeSourceImport } =
      await import('@kotoba/importer/storage');

    const xml = await readFile(FIXTURE_FILE, 'utf8');
    const entries = extractEntries(xml).map((raw) => parseEntry(raw));
    const sourceImportId = await startSourceImport({
      source: 'jmdict',
      version: 'search-modes',
      checksum: 'fixture-modes',
    });
    await markRunning(sourceImportId);
    await flushEntryBatch(entries, sourceImportId);
    await completeSourceImport(
      sourceImportId,
      { processed: 4, inserted: 4, updated: 0, skipped: 0, errors: 0 },
      Date.now(),
    );

    const ids = await db.execute(
      sql`select jmdict_seq, id from entries where jmdict_seq in (1410460, 1742690)`,
    );
    eatId = ids.find((row) => row.jmdict_seq === 1410460)!.id as string;

    ({ searchEntries } = await import('./search.repository.js'));
  }, 60_000);

  afterAll(async () => {
    try {
      await db.$client.end();
    } catch {
      // conexão já encerrada
    }
  });

  it('cobre todos os 18 tiers de busca', async () => {
    const queries = ['たべる', '食べる', 'taberu', 'comer', 'comestivel'];
    const seen = new Set<string>();
    for (const query of queries) {
      const matches = await searchEntries(query);
      for (const match of matches) {
        seen.add(match.match);
      }
    }
    expect([...seen].sort()).toEqual(ALL_MATCH_TYPES);
  });

  it('katakana e half-width casam pelo tier token normalizado', async () => {
    for (const query of ['タベル', 'ﾀﾍﾞﾙ']) {
      const matches = await searchEntries(query);
      expect(
        matches.some((match) => match.entryId === eatId && match.match === 'tokenReading'),
      ).toBe(true);
      expect(
        matches.some((match) => match.entryId === eatId && match.match === 'exactReading'),
      ).toBe(false);
    }
  });

  it('busca por gloss sem acento usa normalized_text', async () => {
    const matches = await searchEntries('comestivel');
    expect(matches.some((match) => match.entryId === eatId && match.match === 'tokenGloss')).toBe(
      true,
    );
    expect(matches.some((match) => match.entryId === eatId && match.match === 'exactGloss')).toBe(
      false,
    );
  });

  it('cada tier retorna a entrada esperada', async () => {
    const pairs: Array<[string, string]> = [
      ['たべる', 'exactReading'],
      ['食べる', 'exactKanji'],
      ['taberu', 'exactRomaji'],
      ['comer', 'exactGloss'],
      ['たべる', 'prefixReading'],
      ['食', 'prefixKanji'],
      ['tabe', 'prefixRomaji'],
      ['com', 'prefixGloss'],
      ['たべるん', 'fuzzyReading'],
      ['食べれ', 'fuzzyKanji'],
      ['comestivel', 'tokenGloss'],
      ['タベル', 'tokenReading'],
    ];
    for (const [query, match] of pairs) {
      const matches = await searchEntries(query);
      expect(
        matches.some((entry) => entry.match === match && entry.entryId === eatId),
        `${query} deve retornar ${match} para a entrada esperada`,
      ).toBe(true);
    }
  });
});
