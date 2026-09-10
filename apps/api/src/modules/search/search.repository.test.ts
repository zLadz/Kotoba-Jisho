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

describe('repository de busca (ranking/LIMIT no banco)', () => {
  let db: typeof import('@kotoba/database').db;
  let searchEntries: typeof import('./search.repository.js').searchEntries;
  let eatId: string;
  let studentId: string;
  let coffeeId: string;
  let japanId: string;
  let miruId: string;
  let nomuId: string;
  let ikuId: string;

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
      version: 'search-repository',
      checksum: 'fixture-repository',
    });
    await markRunning(sourceImportId);
    await flushEntryBatch(entries, sourceImportId);
    await completeSourceImport(
      sourceImportId,
      { processed: 5, inserted: 5, updated: 0, skipped: 0, errors: 0 },
      Date.now(),
    );

    const ids = await db.execute(
      sql`select jmdict_seq, id from entries where jmdict_seq in (1358280, 1206900, 1049180, 1582710)`,
    );
    const bySeq = new Map<number, string>();
    for (const row of ids) {
      bySeq.set(Number(row.jmdict_seq), String(row.id));
    }
    eatId = bySeq.get(1358280)!;
    studentId = bySeq.get(1206900)!;
    coffeeId = bySeq.get(1049180)!;
    japanId = bySeq.get(1582710)!;

    const insert = async (seq: number, position: number, text: string): Promise<void> => {
      const senseRows = await db.execute(
        sql`select s.id from senses s join entries e on e.id = s.entry_id where e.jmdict_seq = ${seq} order by s.position limit 1`,
      );
      const senseId = String(senseRows[0]?.id);
      await db.execute(
        sql`insert into translations (sense_id, position, language, text, normalized_text, source, source_version)
            values (${senseId}, ${position}, 'pt-BR', ${text}, ${normalizeGloss(text)}, 'manual', 'dev-1')`,
      );
    };
    await insert(1358280, 0, 'comer');
    await insert(1358280, 1, 'comestível');
    await insert(1206900, 0, 'estudante');
    await insert(1206900, 1, 'aluno');
    await insert(1049180, 0, 'café');
    await insert(1582710, 0, 'Japão');
    await insert(1358280, 2, 'sobreviver');

    const insertEntry = async (seq: number, texts: string[]): Promise<string> => {
      const entryRows = await db.execute(
        sql`insert into entries (jmdict_seq) values (${seq}) returning id`,
      );
      const entryId = String(entryRows[0]?.id);
      const senseRows = await db.execute(
        sql`insert into senses (entry_id, position) values (${entryId}, 0) returning id`,
      );
      const senseId = String(senseRows[0]?.id);
      for (const [position, text] of texts.entries()) {
        await db.execute(
          sql`insert into translations (sense_id, position, language, text, normalized_text, source, source_version)
              values (${senseId}, ${position}, 'pt-BR', ${text}, ${normalizeGloss(text)}, 'manual', 'dev-1')`,
        );
      }
      return entryId;
    };
    miruId = await insertEntry(1259290, ['ver']);
    nomuId = await insertEntry(1350021, ['beber', 'consumir']);
    ikuId = await insertEntry(1109731, ['ir']);

    ({ searchEntries } = await import('./search.repository.js'));
  }, 60_000);

  afterAll(async () => {
    try {
      await db.$client.end();
    } catch {
      // conexão já encerrada
    }
  });

  const top = async (
    query: string,
    lang = 'pt-BR',
    options?: { limit?: number; offset?: number },
  ): Promise<{ entryId: string; match: string } | undefined> => {
    const matches = await searchEntries(query, lang, options);
    return matches[0];
  };

  it('rankeia e retorna a entrada esperada no topo por tier', async () => {
    const pairs: Array<[string, string, string, string]> = [
      ['たべる', 'pt-BR', eatId, 'exactReading'],
      ['食べる', 'pt-BR', eatId, 'exactKanji'],
      ['taberu', 'pt-BR', eatId, 'exactRomaji'],
      ['comer', 'pt-BR', eatId, 'exactTranslation'],
      ['comestivel', 'pt-BR', eatId, 'tokenTranslation'],
      ['gakusei', 'pt-BR', studentId, 'exactRomaji'],
      ['café', 'pt-BR', coffeeId, 'exactTranslation'],
      ['Japão', 'pt-BR', japanId, 'exactTranslation'],
    ];
    for (const [query, lang, entryId, match] of pairs) {
      const result = await top(query, lang);
      expect(result, `${query} deve retornar ${entryId} no topo`).toEqual({ entryId, match });
    }
  });

  it('dentro das traduções: exata > token > prefixo > fuzzy', async () => {
    expect(await top('comer', 'pt-BR')).toEqual({
      entryId: eatId,
      match: 'exactTranslation',
    });
    expect(await top('comestivel', 'pt-BR')).toEqual({
      entryId: eatId,
      match: 'tokenTranslation',
    });
    expect(await top('com', 'pt-BR')).toEqual({
      entryId: eatId,
      match: 'prefixTranslation',
    });
  });

  it('dentro dos glosses JMdict: token normalizado casa sem acento', async () => {
    expect(await top('comestivel', 'pt')).toEqual({ entryId: eatId, match: 'tokenGloss' });
    expect(await top('com', 'pt')).toEqual({ entryId: eatId, match: 'prefixGloss' });
  });

  it('busca fuzzy tolera erros de digitação', async () => {
    expect(await top('taberru', 'pt-BR')).toEqual({ entryId: eatId, match: 'fuzzyRomaji' });
    expect(await top('comrr', 'pt')).toEqual({ entryId: eatId, match: 'fuzzyGloss' });
  });

  it('katakana e half-width casam pelo tier token normalizado', async () => {
    for (const query of ['タベル', 'ﾀﾍﾞﾙ']) {
      expect(await top(query, 'pt-BR')).toEqual({ entryId: eatId, match: 'tokenReading' });
    }
  });

  it('pt-BR usa apenas a camada Kotoba e não cai para glosses (§14)', async () => {
    const matches = await searchEntries('proprio', 'pt-BR');
    expect(matches).toEqual([]);
  });

  it('idioma sem camada Kotoba nem gloss JMdict retorna só via superfície japonesa', async () => {
    expect(await top('たべる', 'fr')).toEqual({ entryId: eatId, match: 'exactReading' });
    const matches = await searchEntries('comer', 'fr');
    expect(matches).toEqual([]);
  });

  it('retorna uma entrada por vez (melhor tier), sem duplicar IDs', async () => {
    const matches = await searchEntries('c', 'pt-BR');
    const ids = matches.map((match) => match.entryId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([coffeeId, eatId, nomuId].sort());
  });

  it('aplica LIMIT e OFFSET no banco, com paginação estável', async () => {
    const all = await searchEntries('c', 'pt-BR');
    const allIds = all.map((match) => match.entryId);
    expect(allIds).toHaveLength(3);

    const page1 = await searchEntries('c', 'pt-BR', { limit: 2, offset: 0 });
    const page2 = await searchEntries('c', 'pt-BR', { limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
    const page1Ids = page1.map((match) => match.entryId);
    const page2Ids = page2.map((match) => match.entryId);
    expect(new Set([...page1Ids, ...page2Ids]).size).toBe(3);
    expect(page1Ids).toEqual(allIds.slice(0, 2));
    expect(page2Ids).toEqual(allIds.slice(2, 3));
  });

  it('desempate por prioridade (news1/ichi1) e depois jmdict_seq', async () => {
    const all = await searchEntries('c', 'pt-BR');
    const ids = all.map((match) => match.entryId);

    const rows = await db.execute(sql`
      select e.id, e.jmdict_seq,
        (
          exists (select 1 from kanji_forms kf where kf.entry_id = e.id and kf.priorities && ARRAY['news1','ichi1'])
          or exists (select 1 from readings rd where rd.entry_id = e.id and rd.priorities && ARRAY['news1','ichi1'])
        ) as has_priority
      from entries e
      where e.id in (${sql.raw(ids.map((id) => `'${id}'`).join(','))})
    `);
    const expectedIds = [...rows]
      .sort(
        (left, right) =>
          Number(right.has_priority) - Number(left.has_priority) ||
          Number((left as { jmdict_seq: number }).jmdict_seq) -
            Number((right as { jmdict_seq: number }).jmdict_seq),
      )
      .map((row) => row.id);

    expect(ids).toEqual(expectedIds);
    const again = await searchEntries('c', 'pt-BR');
    expect(again.map((match) => match.entryId)).toEqual(ids);
  });

  it('busca por "comer" em pt-BR retorna 食べる e nunca 帯同 (§7b)', async () => {
    const matches = await searchEntries('comer', 'pt-BR');
    expect(matches.map((match) => match.entryId)).toEqual([eatId]);
  });

  it('"ver" (PT-BR) retorna 見る e nunca 食べる via substring "sobreviver" (regressão)', async () => {
    const matches = await searchEntries('ver', 'pt-BR');
    expect(matches.map((match) => match.entryId)).toEqual([miruId]);
  });

  it('direção PT-BR → japonês: ver/beber/ir/comer retornam a entrada certa', async () => {
    const pairs: Array<[string, string]> = [
      ['comer', eatId],
      ['ver', miruId],
      ['beber', nomuId],
      ['ir', ikuId],
    ];
    for (const [query, entryId] of pairs) {
      const result = await top(query, 'pt-BR');
      expect(result, `${query} deve retornar ${entryId} no topo`).toEqual({
        entryId,
        match: 'exactTranslation',
      });
    }
  });
});
