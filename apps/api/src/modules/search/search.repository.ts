import { eq, ilike } from 'drizzle-orm';
import { db, schema } from '@kotoba/database';

export type SearchMatch =
  | 'exactReading'
  | 'exactKanji'
  | 'exactRomaji'
  | 'exactGloss'
  | 'prefixReading'
  | 'prefixKanji'
  | 'prefixRomaji'
  | 'prefixGloss';

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

  const [
    exactReadingRows,
    exactKanjiRows,
    exactRomajiRows,
    exactGlossRows,
    prefixReadingRows,
    prefixKanjiRows,
    prefixRomajiRows,
    prefixGlossRows,
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
  ]);

  const matches: EntryMatch[] = [
    ...exactReadingRows.map((row) => ({ entryId: row.entryId, match: 'exactReading' as const })),
    ...exactKanjiRows.map((row) => ({ entryId: row.entryId, match: 'exactKanji' as const })),
    ...exactRomajiRows.map((row) => ({ entryId: row.entryId, match: 'exactRomaji' as const })),
    ...exactGlossRows.map((row) => ({ entryId: row.entryId, match: 'exactGloss' as const })),
    ...prefixReadingRows.map((row) => ({ entryId: row.entryId, match: 'prefixReading' as const })),
    ...prefixKanjiRows.map((row) => ({ entryId: row.entryId, match: 'prefixKanji' as const })),
    ...prefixRomajiRows.map((row) => ({ entryId: row.entryId, match: 'prefixRomaji' as const })),
    ...prefixGlossRows.map((row) => ({ entryId: row.entryId, match: 'prefixGloss' as const })),
  ];
  return matches;
}

export const searchRepository: SearchRepository = {
  search: searchEntries,
};
