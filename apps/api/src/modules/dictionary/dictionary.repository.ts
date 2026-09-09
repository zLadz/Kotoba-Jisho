import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@kotoba/database';
import type { Gloss, KanjiForm, Reading, Sense } from '@kotoba/types';

export interface RepositoryEntry {
  id: string;
  jmdictSeq: number;
  createdAt: Date;
  updatedAt: Date;
  kanji: KanjiForm[];
  readings: Reading[];
  senses: Sense[];
}

export interface DictionaryRepository {
  getEntryById(id: string): Promise<RepositoryEntry | undefined>;
  getEntryBySequence(sequence: number): Promise<RepositoryEntry | undefined>;
  getEntriesByIds(ids: string[]): Promise<RepositoryEntry[]>;
}

interface EntryRow {
  id: string;
  jmdictSeq: number;
  createdAt: Date;
  updatedAt: Date;
}

function toKanjiForms(
  rows: Array<{ text: string; infos: string[] | null; priorities: string[] | null }>,
): KanjiForm[] {
  return rows.map((row) => ({
    text: row.text,
    infos: row.infos ?? [],
    priorities: row.priorities ?? [],
  }));
}

function toReadings(
  rows: Array<{
    text: string;
    noKanji: boolean;
    restrictions: string[] | null;
    infos: string[] | null;
    priorities: string[] | null;
  }>,
): Reading[] {
  return rows.map((row) => ({
    text: row.text,
    noKanji: row.noKanji,
    restrictions: row.restrictions ?? [],
    infos: row.infos ?? [],
    priorities: row.priorities ?? [],
  }));
}

function toSenses(
  rows: Array<{
    id: string;
    partOfSpeech: string[] | null;
    fields: string[] | null;
    misc: string[] | null;
    dialects: string[] | null;
    kanjiRestrictions: string[] | null;
    readingRestrictions: string[] | null;
  }>,
  glossesBySense: Map<string, Gloss[]>,
): Sense[] {
  return rows.map((row) => ({
    partOfSpeech: row.partOfSpeech ?? [],
    fields: row.fields ?? [],
    misc: row.misc ?? [],
    dialects: row.dialects ?? [],
    kanjiRestrictions: row.kanjiRestrictions ?? [],
    readingRestrictions: row.readingRestrictions ?? [],
    glosses: glossesBySense.get(row.id) ?? [],
  }));
}

async function hydrate(entry: EntryRow): Promise<RepositoryEntry> {
  const [kanjiRows, readingRows, senseRows] = await Promise.all([
    db
      .select()
      .from(schema.kanjiForms)
      .where(eq(schema.kanjiForms.entryId, entry.id))
      .orderBy(schema.kanjiForms.position),
    db
      .select()
      .from(schema.readings)
      .where(eq(schema.readings.entryId, entry.id))
      .orderBy(schema.readings.position),
    db
      .select()
      .from(schema.senses)
      .where(eq(schema.senses.entryId, entry.id))
      .orderBy(schema.senses.position),
  ]);

  const senseIds = senseRows.map((sense) => sense.id);
  const glossRows =
    senseIds.length > 0
      ? await db
          .select()
          .from(schema.glosses)
          .where(inArray(schema.glosses.senseId, senseIds))
          .orderBy(schema.glosses.position)
      : [];

  const glossesBySense = new Map<string, Gloss[]>();
  for (const gloss of glossRows) {
    const list = glossesBySense.get(gloss.senseId) ?? [];
    list.push({ language: gloss.language, text: gloss.text });
    glossesBySense.set(gloss.senseId, list);
  }

  return {
    id: entry.id,
    jmdictSeq: entry.jmdictSeq,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    kanji: toKanjiForms(kanjiRows),
    readings: toReadings(readingRows),
    senses: toSenses(senseRows, glossesBySense),
  };
}

export async function getEntryById(id: string): Promise<RepositoryEntry | undefined> {
  const rows = await db.select().from(schema.entries).where(eq(schema.entries.id, id)).limit(1);
  const entry = rows[0];
  return entry ? hydrate(entry) : undefined;
}

export async function getEntryBySequence(sequence: number): Promise<RepositoryEntry | undefined> {
  const rows = await db
    .select()
    .from(schema.entries)
    .where(eq(schema.entries.jmdictSeq, sequence))
    .limit(1);
  const entry = rows[0];
  return entry ? hydrate(entry) : undefined;
}

export async function getEntriesByIds(ids: string[]): Promise<RepositoryEntry[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db.select().from(schema.entries).where(inArray(schema.entries.id, ids));
  return Promise.all(rows.map((entry) => hydrate(entry)));
}

export const dictionaryRepository: DictionaryRepository = {
  getEntryById,
  getEntryBySequence,
  getEntriesByIds,
};
