import { and, eq, ilike, inArray, sql } from 'drizzle-orm';
import { normalizeGloss, normalizeReading } from '@kotoba/normalize';
import { isKotobaOwned, jmdictLanguageCodes } from '@kotoba/types';
import { db, schema } from '@kotoba/database';

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

export interface SearchRepository {
  search(query: string, lang: string): Promise<EntryMatch[]>;
}

async function hasKotobaTranslations(lang: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.translations.id })
    .from(schema.translations)
    .where(eq(schema.translations.language, lang))
    .limit(1);
  return rows.length > 0;
}

export async function searchEntries(query: string, lang: string): Promise<EntryMatch[]> {
  const prefix = `${query}%`;
  const contains = `%${query}%`;
  const tokenReading = normalizeReading(query);
  const tokenGloss = normalizeGloss(query);
  const tokenReadingPrefix = `${tokenReading}%`;
  const tokenGlossPrefix = `${tokenGloss}%`;

  const usesKotobaLayer = isKotobaOwned(lang) || (await hasKotobaTranslations(lang));

  let semanticMatches: EntryMatch[] = [];
  if (usesKotobaLayer) {
    const [
      exactTranslationRows,
      tokenTranslationRows,
      prefixTranslationRows,
      tokenPrefixTranslationRows,
      fuzzyTranslationRows,
      tokenFuzzyTranslationRows,
    ] = await Promise.all([
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.translations)
        .innerJoin(schema.senses, eq(schema.translations.senseId, schema.senses.id))
        .where(and(eq(schema.translations.language, lang), ilike(schema.translations.text, query))),
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.translations)
        .innerJoin(schema.senses, eq(schema.translations.senseId, schema.senses.id))
        .where(
          and(
            eq(schema.translations.language, lang),
            eq(schema.translations.normalizedText, tokenGloss),
          ),
        ),
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.translations)
        .innerJoin(schema.senses, eq(schema.translations.senseId, schema.senses.id))
        .where(
          and(eq(schema.translations.language, lang), ilike(schema.translations.text, contains)),
        ),
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.translations)
        .innerJoin(schema.senses, eq(schema.translations.senseId, schema.senses.id))
        .where(
          and(
            eq(schema.translations.language, lang),
            ilike(schema.translations.normalizedText, tokenGlossPrefix),
          ),
        ),
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.translations)
        .innerJoin(schema.senses, eq(schema.translations.senseId, schema.senses.id))
        .where(
          and(eq(schema.translations.language, lang), sql`${schema.translations.text} % ${query}`),
        ),
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.translations)
        .innerJoin(schema.senses, eq(schema.translations.senseId, schema.senses.id))
        .where(
          and(
            eq(schema.translations.language, lang),
            sql`${schema.translations.normalizedText} % ${tokenGloss}`,
          ),
        ),
    ]);

    semanticMatches = [
      ...exactTranslationRows.map((row) => ({
        entryId: row.entryId,
        match: 'exactTranslation' as const,
      })),
      ...tokenTranslationRows.map((row) => ({
        entryId: row.entryId,
        match: 'tokenTranslation' as const,
      })),
      ...prefixTranslationRows.map((row) => ({
        entryId: row.entryId,
        match: 'prefixTranslation' as const,
      })),
      ...tokenPrefixTranslationRows.map((row) => ({
        entryId: row.entryId,
        match: 'tokenPrefixTranslation' as const,
      })),
      ...fuzzyTranslationRows.map((row) => ({
        entryId: row.entryId,
        match: 'fuzzyTranslation' as const,
      })),
      ...tokenFuzzyTranslationRows.map((row) => ({
        entryId: row.entryId,
        match: 'tokenFuzzyTranslation' as const,
      })),
    ];
  } else {
    const jmdictLangs = jmdictLanguageCodes(lang);
    const [
      exactGlossRows,
      tokenGlossRows,
      prefixGlossRows,
      tokenPrefixGlossRows,
      fuzzyGlossRows,
      tokenFuzzyGlossRows,
    ] = await Promise.all([
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.glosses)
        .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
        .where(
          and(inArray(schema.glosses.language, jmdictLangs), ilike(schema.glosses.text, query)),
        ),
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.glosses)
        .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
        .where(
          and(
            inArray(schema.glosses.language, jmdictLangs),
            eq(schema.glosses.normalizedText, tokenGloss),
          ),
        ),
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.glosses)
        .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
        .where(
          and(inArray(schema.glosses.language, jmdictLangs), ilike(schema.glosses.text, contains)),
        ),
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.glosses)
        .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
        .where(
          and(
            inArray(schema.glosses.language, jmdictLangs),
            ilike(schema.glosses.normalizedText, tokenGlossPrefix),
          ),
        ),
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.glosses)
        .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
        .where(
          and(
            inArray(schema.glosses.language, jmdictLangs),
            sql`${schema.glosses.text} % ${query}`,
          ),
        ),
      db
        .select({ entryId: schema.senses.entryId })
        .from(schema.glosses)
        .innerJoin(schema.senses, eq(schema.glosses.senseId, schema.senses.id))
        .where(
          and(
            inArray(schema.glosses.language, jmdictLangs),
            sql`${schema.glosses.normalizedText} % ${tokenGloss}`,
          ),
        ),
    ]);

    semanticMatches = [
      ...exactGlossRows.map((row) => ({ entryId: row.entryId, match: 'exactGloss' as const })),
      ...tokenGlossRows.map((row) => ({ entryId: row.entryId, match: 'tokenGloss' as const })),
      ...prefixGlossRows.map((row) => ({ entryId: row.entryId, match: 'prefixGloss' as const })),
      ...tokenPrefixGlossRows.map((row) => ({
        entryId: row.entryId,
        match: 'tokenPrefixGloss' as const,
      })),
      ...fuzzyGlossRows.map((row) => ({ entryId: row.entryId, match: 'fuzzyGloss' as const })),
      ...tokenFuzzyGlossRows.map((row) => ({
        entryId: row.entryId,
        match: 'tokenFuzzyGloss' as const,
      })),
    ];
  }

  const [
    exactReadingRows,
    exactKanjiRows,
    exactRomajiRows,
    tokenReadingRows,
    prefixReadingRows,
    prefixKanjiRows,
    prefixRomajiRows,
    tokenPrefixReadingRows,
    fuzzyReadingRows,
    fuzzyKanjiRows,
    fuzzyRomajiRows,
    tokenFuzzyReadingRows,
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
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(eq(schema.readings.normalizedText, tokenReading)),
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
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(ilike(schema.readings.normalizedText, tokenReadingPrefix)),
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
      .select({ entryId: schema.readings.entryId })
      .from(schema.readings)
      .where(sql`${schema.readings.normalizedText} % ${tokenReading}`),
  ]);

  const matches: EntryMatch[] = [
    ...semanticMatches,
    ...exactReadingRows.map((row) => ({ entryId: row.entryId, match: 'exactReading' as const })),
    ...exactKanjiRows.map((row) => ({ entryId: row.entryId, match: 'exactKanji' as const })),
    ...exactRomajiRows.map((row) => ({ entryId: row.entryId, match: 'exactRomaji' as const })),
    ...tokenReadingRows.map((row) => ({ entryId: row.entryId, match: 'tokenReading' as const })),
    ...prefixReadingRows.map((row) => ({ entryId: row.entryId, match: 'prefixReading' as const })),
    ...prefixKanjiRows.map((row) => ({ entryId: row.entryId, match: 'prefixKanji' as const })),
    ...prefixRomajiRows.map((row) => ({ entryId: row.entryId, match: 'prefixRomaji' as const })),
    ...tokenPrefixReadingRows.map((row) => ({
      entryId: row.entryId,
      match: 'tokenPrefixReading' as const,
    })),
    ...fuzzyReadingRows.map((row) => ({ entryId: row.entryId, match: 'fuzzyReading' as const })),
    ...fuzzyKanjiRows.map((row) => ({ entryId: row.entryId, match: 'fuzzyKanji' as const })),
    ...fuzzyRomajiRows.map((row) => ({ entryId: row.entryId, match: 'fuzzyRomaji' as const })),
    ...tokenFuzzyReadingRows.map((row) => ({
      entryId: row.entryId,
      match: 'tokenFuzzyReading' as const,
    })),
  ];
  return matches;
}

export const searchRepository: SearchRepository = {
  search: searchEntries,
};
