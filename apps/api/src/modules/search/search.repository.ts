import { sql, type SQL } from 'drizzle-orm';
import { normalizeGloss, normalizeReading } from '@kotoba/normalize';
import { isKotobaOwned, jmdictLanguageCodes } from '@kotoba/types';
import { db } from '@kotoba/database';

export type SearchMatch =
  | 'exactReading'
  | 'exactKanji'
  | 'exactRomaji'
  | 'exactGloss'
  | 'exactTranslation'
  | 'tokenReading'
  | 'tokenGloss'
  | 'tokenTranslation'
  | 'prefixReading'
  | 'prefixKanji'
  | 'prefixRomaji'
  | 'prefixGloss'
  | 'prefixTranslation'
  | 'tokenPrefixReading'
  | 'tokenPrefixGloss'
  | 'tokenPrefixTranslation'
  | 'fuzzyReading'
  | 'fuzzyKanji'
  | 'fuzzyRomaji'
  | 'fuzzyGloss'
  | 'fuzzyTranslation'
  | 'tokenFuzzyReading'
  | 'tokenFuzzyGloss'
  | 'tokenFuzzyTranslation';

export interface EntryMatch {
  entryId: string;
  match: SearchMatch;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
}

export interface SearchRepository {
  search(query: string, lang: string, options?: SearchOptions): Promise<EntryMatch[]>;
}

const SCORES: Record<SearchMatch, SQL> = {
  exactReading: sql.raw('4000'),
  exactKanji: sql.raw('3200'),
  exactRomaji: sql.raw('3000'),
  exactGloss: sql.raw('2000'),
  exactTranslation: sql.raw('5000'),
  tokenReading: sql.raw('3800'),
  tokenGloss: sql.raw('1900'),
  tokenTranslation: sql.raw('4800'),
  prefixReading: sql.raw('1800'),
  prefixKanji: sql.raw('1600'),
  prefixRomaji: sql.raw('1400'),
  prefixGloss: sql.raw('1000'),
  prefixTranslation: sql.raw('2500'),
  tokenPrefixReading: sql.raw('1700'),
  tokenPrefixGloss: sql.raw('950'),
  tokenPrefixTranslation: sql.raw('2400'),
  fuzzyReading: sql.raw('900'),
  fuzzyKanji: sql.raw('800'),
  fuzzyRomaji: sql.raw('700'),
  fuzzyGloss: sql.raw('500'),
  fuzzyTranslation: sql.raw('1100'),
  tokenFuzzyReading: sql.raw('850'),
  tokenFuzzyGloss: sql.raw('480'),
  tokenFuzzyTranslation: sql.raw('1050'),
};

const PRIORITY_TAGS = ['news1', 'ichi1'];

const DEFAULT_LIMIT = 10000;

function arrayLiteral(values: string[]): string {
  return `ARRAY[${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(',')}]`;
}

export interface RankedCandidateRow {
  entry_id: string;
  match: string;
  [key: string]: unknown;
}

async function hasKotobaTranslations(lang: string): Promise<boolean> {
  const rows = await db.execute(sql`SELECT 1 FROM translations WHERE language = ${lang} LIMIT 1`);
  return rows.length > 0;
}

interface Matcher {
  match: SearchMatch;
  sql: SQL;
}

function japaneseMatchers(
  query: string,
  prefix: string,
  tokenReading: string,
  tokenReadingPrefix: string,
): Matcher[] {
  return [
    {
      match: 'exactReading',
      sql: sql`SELECT r.entry_id, ${'exactReading'} AS match, ${SCORES.exactReading} AS score FROM readings r WHERE r.text = ${query}`,
    },
    {
      match: 'exactKanji',
      sql: sql`SELECT k.entry_id, ${'exactKanji'} AS match, ${SCORES.exactKanji} AS score FROM kanji_forms k WHERE k.text = ${query}`,
    },
    {
      match: 'exactRomaji',
      sql: sql`SELECT r.entry_id, ${'exactRomaji'} AS match, ${SCORES.exactRomaji} AS score FROM readings r WHERE r.romaji = ${query}`,
    },
    {
      match: 'tokenReading',
      sql: sql`SELECT r.entry_id, ${'tokenReading'} AS match, ${SCORES.tokenReading} AS score FROM readings r WHERE r.normalized_text = ${tokenReading}`,
    },
    {
      match: 'prefixReading',
      sql: sql`SELECT r.entry_id, ${'prefixReading'} AS match, ${SCORES.prefixReading} AS score FROM readings r WHERE r.text ILIKE ${prefix}`,
    },
    {
      match: 'prefixKanji',
      sql: sql`SELECT k.entry_id, ${'prefixKanji'} AS match, ${SCORES.prefixKanji} AS score FROM kanji_forms k WHERE k.text ILIKE ${prefix}`,
    },
    {
      match: 'prefixRomaji',
      sql: sql`SELECT r.entry_id, ${'prefixRomaji'} AS match, ${SCORES.prefixRomaji} AS score FROM readings r WHERE r.romaji ILIKE ${prefix}`,
    },
    {
      match: 'tokenPrefixReading',
      sql: sql`SELECT r.entry_id, ${'tokenPrefixReading'} AS match, ${SCORES.tokenPrefixReading} AS score FROM readings r WHERE r.normalized_text ILIKE ${tokenReadingPrefix}`,
    },
    {
      match: 'fuzzyReading',
      sql: sql`SELECT r.entry_id, ${'fuzzyReading'} AS match, ${SCORES.fuzzyReading} AS score FROM readings r WHERE r.text % ${query}`,
    },
    {
      match: 'fuzzyKanji',
      sql: sql`SELECT k.entry_id, ${'fuzzyKanji'} AS match, ${SCORES.fuzzyKanji} AS score FROM kanji_forms k WHERE k.text % ${query}`,
    },
    {
      match: 'fuzzyRomaji',
      sql: sql`SELECT r.entry_id, ${'fuzzyRomaji'} AS match, ${SCORES.fuzzyRomaji} AS score FROM readings r WHERE r.romaji % ${query}`,
    },
    {
      match: 'tokenFuzzyReading',
      sql: sql`SELECT r.entry_id, ${'tokenFuzzyReading'} AS match, ${SCORES.tokenFuzzyReading} AS score FROM readings r WHERE r.normalized_text % ${tokenReading}`,
    },
  ];
}

function translationMatchers(
  lang: string,
  query: string,
  contains: string,
  tokenGloss: string,
  tokenGlossPrefix: string,
): Matcher[] {
  return [
    {
      match: 'exactTranslation',
      sql: sql`SELECT s.entry_id, ${'exactTranslation'} AS match, ${SCORES.exactTranslation} AS score FROM translations tr JOIN senses s ON s.id = tr.sense_id WHERE tr.language = ${lang} AND tr.text ILIKE ${query}`,
    },
    {
      match: 'tokenTranslation',
      sql: sql`SELECT s.entry_id, ${'tokenTranslation'} AS match, ${SCORES.tokenTranslation} AS score FROM translations tr JOIN senses s ON s.id = tr.sense_id WHERE tr.language = ${lang} AND tr.normalized_text = ${tokenGloss}`,
    },
    {
      match: 'prefixTranslation',
      sql: sql`SELECT s.entry_id, ${'prefixTranslation'} AS match, ${SCORES.prefixTranslation} AS score FROM translations tr JOIN senses s ON s.id = tr.sense_id WHERE tr.language = ${lang} AND tr.text ILIKE ${contains}`,
    },
    {
      match: 'tokenPrefixTranslation',
      sql: sql`SELECT s.entry_id, ${'tokenPrefixTranslation'} AS match, ${SCORES.tokenPrefixTranslation} AS score FROM translations tr JOIN senses s ON s.id = tr.sense_id WHERE tr.language = ${lang} AND tr.normalized_text ILIKE ${tokenGlossPrefix}`,
    },
    {
      match: 'fuzzyTranslation',
      sql: sql`SELECT s.entry_id, ${'fuzzyTranslation'} AS match, ${SCORES.fuzzyTranslation} AS score FROM translations tr JOIN senses s ON s.id = tr.sense_id WHERE tr.language = ${lang} AND tr.text % ${query}`,
    },
    {
      match: 'tokenFuzzyTranslation',
      sql: sql`SELECT s.entry_id, ${'tokenFuzzyTranslation'} AS match, ${SCORES.tokenFuzzyTranslation} AS score FROM translations tr JOIN senses s ON s.id = tr.sense_id WHERE tr.language = ${lang} AND tr.normalized_text % ${tokenGloss}`,
    },
  ];
}

function glossMatchers(
  langs: string[],
  query: string,
  contains: string,
  tokenGloss: string,
  tokenGlossPrefix: string,
): Matcher[] {
  const languageClause = sql.raw(arrayLiteral(langs));
  return [
    {
      match: 'exactGloss',
      sql: sql`SELECT s.entry_id, ${'exactGloss'} AS match, ${SCORES.exactGloss} AS score FROM glosses g JOIN senses s ON s.id = g.sense_id WHERE g.language = ANY(${languageClause}) AND g.text ILIKE ${query}`,
    },
    {
      match: 'tokenGloss',
      sql: sql`SELECT s.entry_id, ${'tokenGloss'} AS match, ${SCORES.tokenGloss} AS score FROM glosses g JOIN senses s ON s.id = g.sense_id WHERE g.language = ANY(${languageClause}) AND g.normalized_text = ${tokenGloss}`,
    },
    {
      match: 'prefixGloss',
      sql: sql`SELECT s.entry_id, ${'prefixGloss'} AS match, ${SCORES.prefixGloss} AS score FROM glosses g JOIN senses s ON s.id = g.sense_id WHERE g.language = ANY(${languageClause}) AND g.text ILIKE ${contains}`,
    },
    {
      match: 'tokenPrefixGloss',
      sql: sql`SELECT s.entry_id, ${'tokenPrefixGloss'} AS match, ${SCORES.tokenPrefixGloss} AS score FROM glosses g JOIN senses s ON s.id = g.sense_id WHERE g.language = ANY(${languageClause}) AND g.normalized_text ILIKE ${tokenGlossPrefix}`,
    },
    {
      match: 'fuzzyGloss',
      sql: sql`SELECT s.entry_id, ${'fuzzyGloss'} AS match, ${SCORES.fuzzyGloss} AS score FROM glosses g JOIN senses s ON s.id = g.sense_id WHERE g.language = ANY(${languageClause}) AND g.text % ${query}`,
    },
    {
      match: 'tokenFuzzyGloss',
      sql: sql`SELECT s.entry_id, ${'tokenFuzzyGloss'} AS match, ${SCORES.tokenFuzzyGloss} AS score FROM glosses g JOIN senses s ON s.id = g.sense_id WHERE g.language = ANY(${languageClause}) AND g.normalized_text % ${tokenGloss}`,
    },
  ];
}

export async function searchEntries(
  query: string,
  lang: string,
  options: SearchOptions = {},
): Promise<EntryMatch[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  const prefix = `${query}%`;
  const contains = `%${query}%`;
  const tokenReading = normalizeReading(query);
  const tokenGloss = normalizeGloss(query);
  const tokenReadingPrefix = `${tokenReading}%`;
  const tokenGlossPrefix = `${tokenGloss}%`;

  const matchers =
    isKotobaOwned(lang) || (await hasKotobaTranslations(lang))
      ? translationMatchers(lang, query, contains, tokenGloss, tokenGlossPrefix)
      : glossMatchers(jmdictLanguageCodes(lang), query, contains, tokenGloss, tokenGlossPrefix);
  matchers.push(...japaneseMatchers(query, prefix, tokenReading, tokenReadingPrefix));

  const candidates = sql.join(
    matchers.map((matcher) => matcher.sql),
    sql.raw(' UNION ALL '),
  );

  const ranked = sql<RankedCandidateRow>`
    WITH candidates AS (${candidates})
    SELECT scored.entry_id AS entry_id, scored.match AS match
    FROM (
      SELECT DISTINCT ON (c.entry_id)
        c.entry_id,
        c.match,
        c.score,
        e.jmdict_seq,
        (
          EXISTS (
            SELECT 1 FROM kanji_forms kf
            WHERE kf.entry_id = c.entry_id AND kf.priorities && ${sql.raw(arrayLiteral(PRIORITY_TAGS))}
          )
          OR EXISTS (
            SELECT 1 FROM readings rd
            WHERE rd.entry_id = c.entry_id AND rd.priorities && ${sql.raw(arrayLiteral(PRIORITY_TAGS))}
          )
        ) AS has_priority
      FROM candidates c
      JOIN entries e ON e.id = c.entry_id
      ORDER BY c.entry_id, c.score DESC
    ) scored
    ORDER BY scored.score DESC, scored.has_priority DESC, scored.jmdict_seq ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const rows = await db.execute<RankedCandidateRow>(ranked);
  return rows.map((row) => ({ entryId: row.entry_id, match: row.match as SearchMatch }));
}

export const searchRepository: SearchRepository = {
  search: searchEntries,
};
