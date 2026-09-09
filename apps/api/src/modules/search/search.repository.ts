import { eq, ilike, sql } from 'drizzle-orm';
import { normalizeGloss, normalizeReading } from '@kotoba/normalize';
import { db, schema } from '@kotoba/database';

export type SearchMatch =
  | 'exactReading'
  | 'exactKanji'
  | 'exactRomaji'
  | 'exactGloss'
  | 'tokenReading'
  | 'tokenGloss'
  | 'prefixReading'
  | 'prefixKanji'
  | 'prefixRomaji'
  | 'prefixGloss'
  | 'tokenPrefixReading'
  | 'tokenPrefixGloss'
  | 'fuzzyReading'
  | 'fuzzyKanji'
  | 'fuzzyRomaji'
  | 'fuzzyGloss'
  | 'tokenFuzzyReading'
  | 'tokenFuzzyGloss';

export interface EntryMatch {
  entryId: string;
  match: SearchMatch;
}

export interface SearchRepository {
  search(query: string): Promise<EntryMatch[]>;
}

export async function searchEntries(query: string): Promise<EntryMatch[]> {
  const prefix = `${query}%`;
  const contains = `%${query}%`;
  const tokenReading = normalizeReading(query);
  const tokenGloss = normalizeGloss(query);
  const tokenReadingPrefix = `${tokenReading}%`;
  const tokenGlossPrefix = `${tokenGloss}%`;

  const [
    exactReadingRows,
    exactKanjiRows,
    exactRomajiRows,
    exactGlossRows,
    tokenReadingRows,
    tokenGlossRows,
    prefixReadingRows,
    prefixKanjiRows,
    prefixRomajiRows,
    prefixGlossRows,
    tokenPrefixReadingRows,
    tokenPrefixGlossRows,
    fuzzyReadingRows,
    fuzzyKanjiRows,
    fuzzyRomajiRows,
    fuzzyGlossRows,
    tokenFuzzyReadingRows,
    tokenFuzzyGlossRows,
  ] = await Promise.all([
    db
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(eq(schema.readings.text, query)),
    db
      .select({ entryId: schema.kanjiForms.entryId })
      .from(schema.kanjiForms)
      .where(eq(schema.kanjiForms.text, query)),
    db
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(eq(schema.readings.romaji, query)),
    db
      .select({ entryId: schema.senses.entryId })
      .from(schema.glosses)
      .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
      .where(ilike(schema.glosses.text, query)),
    db
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(eq(schema.readings.normalizedText, tokenReading)),
    db
      .select({ entryId: schema.senses.entryId })
      .from(schema.glosses)
      .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
      .where(eq(schema.glosses.normalizedText, tokenGloss)),
    db
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(ilike(schema.readings.text, prefix)),
    db
      .select({ entryId: schema.kanjiForms.entryId })
      .from(schema.kanjiForms)
      .where(ilike(schema.kanjiForms.text, prefix)),
    db
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(ilike(schema.readings.romaji, prefix)),
    db
      .select({ entryId: schema.senses.entryId })
      .from(schema.glosses)
      .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
      .where(ilike(schema.glosses.text, contains)),
    db
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(ilike(schema.readings.normalizedText, tokenReadingPrefix)),
    db
      .select({ entryId: schema.senses.entryId })
      .from(schema.glosses)
      .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
      .where(ilike(schema.glosses.normalizedText, tokenGlossPrefix)),
    db
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(sql`${schema.readings.text} % ${query}`),
    db
      .select({ entryId: schema.kanjiForms.entryId })
      .from(schema.kanjiForms)
      .where(sql`${schema.kanjiForms.text} % ${query}`),
    db
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(sql`${schema.readings.romaji} % ${query}`),
    db
      .select({ entryId: schema.senses.entryId })
      .from(schema.glosses)
      .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
      .where(sql`${schema.glosses.text} % ${query}`),
    db
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(sql`${schema.readings.normalizedText} % ${tokenReading}`),
    db
      .select({ entryId: schema.senses.entryId })
      .from(schema.glosses)
      .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
      .where(sql`${schema.glosses.normalizedText} % ${tokenGloss}`),
  ]);

  const matches: EntryMatch[] = [
    ...exactReadingRows.map((row) => ({ entryId: row.entryId, match: 'exactReading' as const })),
    ...exactKanjiRows.map((row) => ({ entryId: row.entryId, match: 'exactKanji' as const })),
    ...exactRomajiRows.map((row) => ({ entryId: row.entryId, match: 'exactRomaji' as const })),
    ...exactGlossRows.map((row) => ({ entryId: row.entryId, match: 'exactGloss' as const })),
    ...tokenReadingRows.map((row) => ({ entryId: row.entryId, match: 'tokenReading' as const })),
    ...tokenGlossRows.map((row) => ({ entryId: row.entryId, match: 'tokenGloss' as const })),
    ...prefixReadingRows.map((row) => ({ entryId: row.entryId, match: 'prefixReading' as const })),
    ...prefixKanjiRows.map((row) => ({ entryId: row.entryId, match: 'prefixKanji' as const })),
    ...prefixRomajiRows.map((row) => ({ entryId: row.entryId, match: 'prefixRomaji' as const })),
    ...prefixGlossRows.map((row) => ({ entryId: row.entryId, match: 'prefixGloss' as const })),
    ...tokenPrefixReadingRows.map((row) => ({
      entryId: row.entryId,
      match: 'tokenPrefixReading' as const,
    })),
    ...tokenPrefixGlossRows.map((row) => ({
      entryId: row.entryId,
      match: 'tokenPrefixGloss' as const,
    })),
    ...fuzzyReadingRows.map((row) => ({ entryId: row.entryId, match: 'fuzzyReading' as const })),
    ...fuzzyKanjiRows.map((row) => ({ entryId: row.entryId, match: 'fuzzyKanji' as const })),
    ...fuzzyRomajiRows.map((row) => ({ entryId: row.entryId, match: 'fuzzyRomaji' as const })),
    ...fuzzyGlossRows.map((row) => ({ entryId: row.entryId, match: 'fuzzyGloss' as const })),
    ...tokenFuzzyReadingRows.map((row) => ({
      entryId: row.entryId,
      match: 'tokenFuzzyReading' as const,
    })),
    ...tokenFuzzyGlossRows.map((row) => ({
      entryId: row.entryId,
      match: 'tokenFuzzyGloss' as const,
    })),
  ];
  return matches;
}

export const searchRepository: SearchRepository = {
  search: searchEntries,
};
