import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { normalizeGloss } from '@kotoba/normalize';
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
  let seedSourceImportId: string;

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
    seedSourceImportId = sourceImportId;
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

    const senseBySeq = new Map<number, string>();
    for (const seq of [1358280, 1582710, 1206900, 1049180, 1410460]) {
      const rows = await db.execute(
        sql`select s.id from senses s join entries e on e.id = s.entry_id where e.jmdict_seq = ${seq} order by s.position limit 1`,
      );
      senseBySeq.set(seq, rows[0]!.id as string);
    }
    const kotobaTranslations: Array<{ senseId: string; text: string }> = [
      { senseId: senseBySeq.get(1358280)!, text: 'comer' },
      { senseId: senseBySeq.get(1358280)!, text: 'comestível' },
      { senseId: senseBySeq.get(1358280)!, text: 'sobreviver' },
      { senseId: senseBySeq.get(1582710)!, text: 'Japão' },
      { senseId: senseBySeq.get(1206900)!, text: 'estudante' },
      { senseId: senseBySeq.get(1206900)!, text: 'aluno' },
      { senseId: senseBySeq.get(1049180)!, text: 'café' },
    ];
    for (let position = 0; position < kotobaTranslations.length; position += 1) {
      const item = kotobaTranslations[position]!;
      await db.execute(
        sql`insert into translations (sense_id, position, language, text, normalized_text, source, source_version)
            values (${item.senseId}, ${position}, 'pt-BR', ${item.text}, ${normalizeGloss(item.text)}, 'manual', 'dev-1')`,
      );
    }

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
    expect(total[0]?.total).toBe(5);

    const readings = await db.execute(sql`
      select r.text, r.romaji
      from readings r
      join entries e on e.id = r.entry_id
      where e.jmdict_seq = 1358280
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
        translations: Array<{ text: string; source: string; language: string }>;
      }>;
    }>();
    expect(body?.query).toBe('taberu');
    expect(body?.results[0]?.kanji).toContain('食べる');
    expect(body?.results[0]?.romaji).toContain('taberu');
    expect(body?.results[0]?.translations).toContainEqual({
      language: 'pt-BR',
      text: 'comer',
      source: 'manual',
      sourceVersion: 'dev-1',
    });
    // Teste 1: o idioma padrão/resultante é pt-BR, nunca en.
    expect(body?.results[0]?.translations.every((t) => t.language === 'pt-BR')).toBe(true);
    expect(body?.results[0]?.translations.some((t) => t.language === 'en')).toBe(false);
  });

  it('busca por romaji e por português (padrão pt-BR usa a camada Kotoba)', async () => {
    const byRomaji = await app?.inject({ method: 'GET', url: '/api/v1/search?q=nippon' });
    const romajiBody = byRomaji?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(romajiBody?.results[0]?.kanji).toContain('日本');

    const byPortuguese = await app?.inject({ method: 'GET', url: '/api/v1/search?q=estudante' });
    const portugueseBody = byPortuguese?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(portugueseBody?.results[0]?.kanji).toContain('学生');
  });

  it('busca em pt-BR não cai para glosses JMdict fora da camada Kotoba (§14)', async () => {
    const response = await app?.inject({ method: 'GET', url: '/api/v1/search?q=proprio' });
    expect(response?.statusCode).toBe(200);
    const body = response?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(body?.results).toEqual([]);
  });

  it('busca em idioma não-Kotoba usa apenas glosses JMdict daquele idioma', async () => {
    const en = await app?.inject({ method: 'GET', url: '/api/v1/search?q=estudante&lang=en' });
    const enBody = en?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(enBody?.results).toEqual([]);

    const ptJmdict = await app?.inject({ method: 'GET', url: '/api/v1/search?q=proprio&lang=pt' });
    const ptBody = ptJmdict?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(ptBody?.results[0]?.kanji).toContain('食べる');
  });

  it('busca fuzzy tolera erros de digitação (§12)', async () => {
    const byRomaji = await app?.inject({ method: 'GET', url: '/api/v1/search?q=taberru' });
    const byRomajiBody = byRomaji?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(byRomajiBody?.results[0]?.kanji).toContain('食べる');

    const byGloss = await app?.inject({ method: 'GET', url: '/api/v1/search?q=comrr&lang=pt' });
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

  it('busca tradução sem acento pelo tier token', async () => {
    const response = await app?.inject({ method: 'GET', url: '/api/v1/search?q=comestivel' });
    expect(response?.statusCode).toBe(200);
    const body = response?.json<{ results: Array<{ kanji: string[] }> }>();
    expect(body?.results[0]?.kanji).toContain('食べる');
  });

  it('pagina resultados com offset e valida offset inválido', async () => {
    const all = await app?.inject({ method: 'GET', url: '/api/v1/search?q=c&limit=50&offset=0' });
    const allBody = all?.json<{ results: Array<{ id: string }> }>();
    expect(allBody?.results.length ?? 0).toBeGreaterThanOrEqual(2);

    const page1 = await app?.inject({ method: 'GET', url: '/api/v1/search?q=c&limit=1&offset=0' });
    const page2 = await app?.inject({ method: 'GET', url: '/api/v1/search?q=c&limit=1&offset=1' });
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
      senses: Array<{
        translations: Array<{ text: string; source: string; sourceVersion: string }>;
      }>;
      createdAt?: unknown;
    }>();
    expect(body?.id).toBe(id);
    expect(body?.jmdictSeq).toBe(1358280);
    expect(body?.kanji[0]?.text).toBe('食べる');
    expect(body?.readings[0]?.romaji).toBe('taberu');
    expect(
      body?.senses.some((sense) =>
        sense.translations.some((t) => t.text === 'comer' && t.source === 'manual'),
      ),
    ).toBe(true);
    expect(body).not.toHaveProperty('createdAt');
  });

  it('retorna traduções por idioma, sem misturar glosses (§24)', async () => {
    const search = await app?.inject({ method: 'GET', url: '/api/v1/search?q=taberu' });
    const id = search?.json<{ results: Array<{ id: string }> }>().results[0]?.id;

    const ptBr = await app?.inject({ method: 'GET', url: `/api/v1/entries/${id}?lang=pt-BR` });
    const ptBrBody = ptBr?.json<{
      senses: Array<{
        translations: Array<{ text: string; source: string; language: string }>;
        sourceGlosses: Array<{ text: string; source: string; language: string }>;
      }>;
    }>();
    expect(ptBrBody?.senses[0]?.translations.length ?? 0).toBeGreaterThan(0);
    expect(ptBrBody?.senses[0]?.translations.every((t) => t.source === 'manual')).toBe(true);
    expect(ptBrBody?.senses[0]?.translations.every((t) => t.language === 'pt-BR')).toBe(true);
    // Teste 5: glosses en não viram fallback PT-BR.
    expect(
      ptBrBody?.senses[0]?.sourceGlosses.every((g) => g.language === 'pt' || g.language === 'por'),
    ).toBe(true);
    expect(
      ptBrBody?.senses[0]?.translations.some((t) => t.text === 'to live on (e.g. a salary)'),
    ).toBe(false);

    const ptJmdict = await app?.inject({ method: 'GET', url: `/api/v1/entries/${id}?lang=pt` });
    const ptBody = ptJmdict?.json<{
      senses: Array<{
        translations: unknown[];
        sourceGlosses: Array<{ text: string; source: string; language: string }>;
      }>;
    }>();
    expect(ptBody?.senses[0]?.translations).toEqual([]);
    expect(ptBody?.senses[0]?.sourceGlosses).toContainEqual({
      language: 'pt',
      text: 'comestível',
      source: 'jmdict',
    });

    const fr = await app?.inject({ method: 'GET', url: `/api/v1/entries/${id}?lang=fr` });
    const frBody = fr?.json<{
      senses: Array<{ translations: unknown[]; sourceGlosses: unknown[] }>;
    }>();
    expect(frBody?.senses[0]?.translations).toEqual([]);
    expect(frBody?.senses[0]?.sourceGlosses).toEqual([]);
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

  describe('regressão §7b/§8: 食べる e 帯同 não se contaminam', () => {
    let taberuId: string;
    let taidoId: string;

    beforeAll(async () => {
      const rows = await db.execute(sql`
        select e.id, e.jmdict_seq from entries e
        where e.jmdict_seq in (1358280, 1410460)
      `);
      const bySeq = new Map<number, string>();
      for (const row of rows) {
        bySeq.set(row.jmdict_seq as number, row.id as string);
      }
      taberuId = bySeq.get(1358280)!;
      taidoId = bySeq.get(1410460)!;
    });

    it('busca "comer" em pt-BR retorna 食べる e nunca 帯同', async () => {
      const response = await app?.inject({
        method: 'GET',
        url: '/api/v1/search?q=comer&lang=pt-BR',
      });
      expect(response?.statusCode).toBe(200);
      const body = response?.json<{ results: Array<{ id: string }> }>();
      const ids = body?.results.map((result) => result.id) ?? [];
      expect(ids).toContain(taberuId);
      expect(ids).not.toContain(taidoId);
    });

    it('entrada 帯同 não tem traduções de 食べる e glosses são disjuntos (§8)', async () => {
      const taidoDetail = await app?.inject({
        method: 'GET',
        url: `/api/v1/entries/${taidoId}?lang=pt-BR`,
      });
      expect(taidoDetail?.statusCode).toBe(200);
      const taidoBody = taidoDetail?.json<{
        kanji: Array<{ text: string }>;
        senses: Array<{ translations: Array<{ text: string }> }>;
      }>();
      expect(taidoBody?.kanji[0]?.text).toBe('帯同');
      const taidoTranslations =
        taidoBody?.senses.flatMap((s) => s.translations.map((t) => t.text)) ?? [];
      expect(taidoTranslations).toEqual([]);

      const taidoEn = await app?.inject({
        method: 'GET',
        url: `/api/v1/entries/${taidoId}?lang=en`,
      });
      const taidoEnBody = taidoEn?.json<{
        senses: Array<{ sourceGlosses: Array<{ text: string }> }>;
      }>();
      const taidoGlosses =
        taidoEnBody?.senses.flatMap((s) => s.sourceGlosses.map((g) => g.text)) ?? [];
      expect(taidoGlosses).toContain('taking (someone) along');

      const taberuEn = await app?.inject({
        method: 'GET',
        url: `/api/v1/entries/${taberuId}?lang=en`,
      });
      const taberuEnBody = taberuEn?.json<{
        senses: Array<{ sourceGlosses: Array<{ text: string }> }>;
      }>();
      const taberuGlosses =
        taberuEnBody?.senses.flatMap((s) => s.sourceGlosses.map((g) => g.text)) ?? [];
      const intersection = taberuGlosses.filter((gloss) => taidoGlosses.includes(gloss));
      expect(intersection).toEqual([]);
    });
  });

  describe('regressão: "ver" não vaza para 食べる via substring (§7e)', () => {
    let miruId: string;
    let taberuId: string;

    beforeAll(async () => {
      const { parseEntry } = await import('@kotoba/importer/parser');
      const { flushEntryBatch } = await import('@kotoba/importer/storage');

      const miruXml = `<entry>
        <ent_seq>1259290</ent_seq>
        <k_ele><keb>見る</keb></k_ele>
        <r_ele><reb>みる</reb></r_ele>
        <sense>
          <gloss>to see</gloss>
        </sense>
      </entry>`;
      const miru = extractEntries(miruXml).map((raw) => parseEntry(raw))[0];
      if (miru === undefined) {
        throw new Error('Fixture 見る sem entrada');
      }
      await flushEntryBatch([miru], seedSourceImportId);

      const senseRows = await db.execute(sql`
        select s.id from senses s
        join entries e on e.id = s.entry_id
        where e.jmdict_seq = 1259290 order by s.position limit 1
      `);
      const senseId = String(senseRows[0]?.id);
      await db.execute(sql`
        insert into translations (sense_id, position, language, text, normalized_text, source, source_version)
        values (${senseId}, 0, 'pt-BR', 'ver', 'ver', 'manual', 'manual-curated-1')
      `);

      const rows = await db.execute(sql`
        select e.id, e.jmdict_seq from entries e
        where e.jmdict_seq in (1259290, 1358280)
      `);
      const bySeq = new Map<number, string>();
      for (const row of rows) {
        bySeq.set(row.jmdict_seq as number, row.id as string);
      }
      miruId = bySeq.get(1259290)!;
      taberuId = bySeq.get(1358280)!;
    }, 30_000);

    it('busca "ver" em pt-BR retorna 見る no topo e nunca 食べる', async () => {
      const response = await app?.inject({
        method: 'GET',
        url: '/api/v1/search?q=ver&lang=pt-BR',
      });
      expect(response?.statusCode).toBe(200);
      const body = response?.json<{ results: Array<{ id: string; kanji: string[] }> }>();
      const ids = body?.results.map((result) => result.id) ?? [];
      expect(ids[0]).toBe(miruId);
      expect(body?.results[0]?.kanji).toContain('見る');
      expect(ids).not.toContain(taberuId);
    });
  });

  describe('aceitação: entrada com múltiplas acepções e camada pt-BR (§26)', () => {
    let vehicleId: string;

    beforeAll(async () => {
      const { parseEntry } = await import('@kotoba/importer/parser');
      const { flushEntryBatch } = await import('@kotoba/importer/storage');

      const kurumaXml = `<entry>
        <ent_seq>1323080</ent_seq>
        <k_ele><keb>車</keb><ke_pri>ichi1</ke_pri></k_ele>
        <r_ele><reb>くるま</reb><re_pri>ichi1</re_pri></r_ele>
        <sense>
          <pos>&n;</pos>
          <gloss xml:lang="pt">carro</gloss>
          <gloss xml:lang="pt">veículo</gloss>
          <gloss>car</gloss>
          <gloss>vehicle</gloss>
        </sense>
        <sense>
          <pos>&n;</pos>
          <gloss xml:lang="pt">roda</gloss>
          <gloss>wheel</gloss>
        </sense>
      </entry>`;

      const kuruma = extractEntries(kurumaXml).map((raw) => parseEntry(raw))[0];
      if (kuruma === undefined) {
        throw new Error('Fixture 車 sem entrada');
      }
      await flushEntryBatch([kuruma], seedSourceImportId);

      const senseRows = await db.execute(sql`
        select s.id, s.position from senses s
        join entries e on e.id = s.entry_id
        where e.jmdict_seq = 1323080 order by s.position
      `);
      const byPosition = new Map<string, string>();
      for (const row of senseRows) {
        byPosition.set(String(row.position), row.id as string);
      }
      const vehicleSense = byPosition.get('0')!;
      const wheelSense = byPosition.get('1')!;

      const insert = async (senseId: string, text: string, position: number): Promise<void> => {
        await db.execute(sql`
          insert into translations (sense_id, position, language, text, normalized_text, source, source_version)
          values (${senseId}, ${position}, 'pt-BR', ${text}, ${normalizeGloss(text)}, 'manual', 'manual-curated-1')
        `);
      };
      await insert(vehicleSense, 'carro', 0);
      await insert(vehicleSense, 'veículo', 1);
      await insert(wheelSense, 'roda', 0);

      const rows = await db.execute(sql`
        select e.id from entries e where e.jmdict_seq = 1323080
      `);
      vehicleId = rows[0]!.id as string;
    }, 30_000);

    it('busca por "carro" em pt-BR retorna a entrada 車 no topo', async () => {
      const response = await app?.inject({
        method: 'GET',
        url: '/api/v1/search?q=carro&lang=pt-BR',
      });
      expect(response?.statusCode).toBe(200);
      const body = response?.json<{ results: Array<{ id: string; kanji: string[] }> }>();
      expect(body?.results[0]?.id).toBe(vehicleId);
      expect(body?.results[0]?.kanji).toContain('車');
    });

    it('entrada expõe traduções por acepção sem misturar e com POS (§26)', async () => {
      const response = await app?.inject({
        method: 'GET',
        url: `/api/v1/entries/${vehicleId}?lang=pt-BR`,
      });
      expect(response?.statusCode).toBe(200);
      const body = response?.json<{
        senses: Array<{
          partOfSpeech: string[];
          translations: Array<{ text: string; source: string; sourceVersion: string }>;
        }>;
      }>();
      expect(body?.senses[0]?.partOfSpeech).toContain('n');
      expect(body?.senses[0]?.translations.map((t) => t.text)).toEqual(['carro', 'veículo']);
      expect(body?.senses[0]?.translations.every((t) => t.source === 'manual')).toBe(true);
      expect(body?.senses[1]?.translations.map((t) => t.text)).toEqual(['roda']);
      // Teste 4: traduções de um sense não vazam para outro.
      expect(body?.senses[0]?.translations.map((t) => t.text)).not.toContain('roda');
      expect(body?.senses[1]?.translations.map((t) => t.text)).not.toContain('carro');
      // Teste 6: POS é metadado gramatical, não texto de tradução.
      const posTexts = body?.senses.flatMap((s) => s.partOfSpeech) ?? [];
      const translationText =
        body?.senses.flatMap((s) => s.translations.map((t) => t.text)).join(' ') ?? '';
      expect(posTexts).toContain('n');
      expect(translationText).not.toContain('n');
      expect(translationText).not.toContain('v1');
    });

    it('lang=en expõe glosses JMdict em sourceGlosses, sem misturar em translations (§9)', async () => {
      const response = await app?.inject({
        method: 'GET',
        url: `/api/v1/entries/${vehicleId}?lang=en`,
      });
      expect(response?.statusCode).toBe(200);
      const body = response?.json<{
        senses: Array<{
          translations: unknown[];
          sourceGlosses: Array<{ text: string; language: string; source: string }>;
        }>;
      }>();
      expect(body?.senses[0]?.translations).toEqual([]);
      expect(body?.senses[0]?.sourceGlosses.map((g) => g.text)).toEqual(['car', 'vehicle']);
      expect(body?.senses[0]?.sourceGlosses.every((g) => g.source === 'jmdict')).toBe(true);
    });
  });
});
