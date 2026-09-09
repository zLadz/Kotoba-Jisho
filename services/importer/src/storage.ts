import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@kotoba/database';
import { normalizeGloss, normalizeReading } from '@kotoba/normalize';
import { kanaToRomaji } from '@kotoba/romaji';
import type { JmdictEntry } from './types.js';

export interface SourceImportInput {
  source: string;
  version: string;
  checksum: string;
}

export interface ImportProgress {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface BatchResult {
  inserted: number;
  updated: number;
}

export async function startSourceImport(input: SourceImportInput): Promise<string> {
  const created = await db
    .insert(schema.sourceImports)
    .values(input)
    .onConflictDoNothing()
    .returning({ id: schema.sourceImports.id });

  if (created[0]) {
    return created[0].id;
  }

  const existing = await db
    .select({ id: schema.sourceImports.id })
    .from(schema.sourceImports)
    .where(
      and(
        eq(schema.sourceImports.source, input.source),
        eq(schema.sourceImports.version, input.version),
      ),
    )
    .limit(1);

  const id = existing[0]?.id;
  if (!id) {
    throw new Error(`source_import não encontrado para ${input.source}@${input.version}`);
  }
  return id;
}

export async function markRunning(id: string): Promise<void> {
  await db
    .update(schema.sourceImports)
    .set({
      status: 'running',
      startedAt: new Date(),
      finishedAt: null,
      entriesProcessed: 0,
      entriesInserted: 0,
      entriesUpdated: 0,
      entriesSkipped: 0,
      errors: 0,
      errorMessage: null,
      durationMs: 0,
    })
    .where(eq(schema.sourceImports.id, id));
}

export async function updateImportProgress(id: string, progress: ImportProgress): Promise<void> {
  await db
    .update(schema.sourceImports)
    .set({
      entriesProcessed: progress.processed,
      entriesInserted: progress.inserted,
      entriesUpdated: progress.updated,
      entriesSkipped: progress.skipped,
      errors: progress.errors,
    })
    .where(eq(schema.sourceImports.id, id));
}

export async function completeSourceImport(
  id: string,
  progress: ImportProgress,
  startedAtMs: number,
): Promise<void> {
  await db
    .update(schema.sourceImports)
    .set({
      status: 'completed',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAtMs,
      entriesProcessed: progress.processed,
      entriesInserted: progress.inserted,
      entriesUpdated: progress.updated,
      entriesSkipped: progress.skipped,
      errors: progress.errors,
      errorMessage: null,
    })
    .where(eq(schema.sourceImports.id, id));
}

export async function failSourceImport(
  id: string,
  errorMessage: string,
  progress: ImportProgress,
  startedAtMs: number,
): Promise<void> {
  await db
    .update(schema.sourceImports)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAtMs,
      entriesProcessed: progress.processed,
      entriesInserted: progress.inserted,
      entriesUpdated: progress.updated,
      entriesSkipped: progress.skipped,
      errors: progress.errors,
      errorMessage,
    })
    .where(eq(schema.sourceImports.id, id));
}

const CHUNK_SIZE = 2000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertChunked<T extends object>(
  tx: Tx,
  table: Parameters<Tx['insert']>[0],
  rows: T[],
): Promise<void> {
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    await tx.insert(table).values(rows.slice(index, index + CHUNK_SIZE));
  }
}

export async function flushEntryBatch(
  entries: JmdictEntry[],
  sourceImportId: string,
): Promise<BatchResult> {
  if (entries.length === 0) {
    return { inserted: 0, updated: 0 };
  }
  const sequences = entries.map((entry) => entry.sequence);
  const existingSeqs = [...new Set(sequences)];

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ jmdictSeq: schema.entries.jmdictSeq, id: schema.entries.id })
      .from(schema.entries)
      .where(inArray(schema.entries.jmdictSeq, existingSeqs));

    const existingSet = new Set(existing.map((row) => row.jmdictSeq));
    if (existing.length > 0) {
      await tx.delete(schema.entries).where(inArray(schema.entries.jmdictSeq, [...existingSet]));
    }

    const insertedChunks = [];
    const entryRows = entries.map((entry) => ({ jmdictSeq: entry.sequence, sourceImportId }));
    for (let index = 0; index < entryRows.length; index += CHUNK_SIZE) {
      insertedChunks.push(
        await tx
          .insert(schema.entries)
          .values(entryRows.slice(index, index + CHUNK_SIZE))
          .returning({ id: schema.entries.id, jmdictSeq: schema.entries.jmdictSeq }),
      );
    }

    const entryIdBySeq = new Map<number, string>();
    for (const chunk of insertedChunks) {
      for (const row of chunk) {
        entryIdBySeq.set(row.jmdictSeq, row.id);
      }
    }
    const entryId = (sequence: number): string => {
      const id = entryIdBySeq.get(sequence);
      if (!id) {
        throw new Error(`entrada sem id de banco para sequência ${sequence}`);
      }
      return id;
    };

    const kanjiRows = [];
    for (const entry of entries) {
      const id = entryId(entry.sequence);
      for (const form of entry.kanji) {
        kanjiRows.push({
          entryId: id,
          position: form.position,
          text: form.text,
          infos: form.infos,
          priorities: form.priorities,
        });
      }
    }
    if (kanjiRows.length > 0) {
      await insertChunked(tx, schema.kanjiForms, kanjiRows);
    }

    const readingRows = [];
    for (const entry of entries) {
      const id = entryId(entry.sequence);
      for (const reading of entry.readings) {
        readingRows.push({
          entryId: id,
          position: reading.position,
          text: reading.text,
          noKanji: reading.noKanji,
          restrictions: reading.restrictions,
          infos: reading.infos,
          priorities: reading.priorities,
          romaji: kanaToRomaji(reading.text),
          normalizedText: normalizeReading(reading.text),
        });
      }
    }
    if (readingRows.length > 0) {
      await insertChunked(tx, schema.readings, readingRows);
    }

    const senseRows = [];
    for (const entry of entries) {
      const id = entryId(entry.sequence);
      for (const sense of entry.senses) {
        senseRows.push({
          entryId: id,
          position: sense.position,
          partOfSpeech: sense.partOfSpeech,
          fields: sense.fields,
          misc: sense.misc,
          dialects: sense.dialects,
          kanjiRestrictions: sense.kanjiRestrictions,
          readingRestrictions: sense.readingRestrictions,
        });
      }
    }

    let senseIds: string[] = [];
    if (senseRows.length > 0) {
      const senseChunks = [];
      for (let index = 0; index < senseRows.length; index += CHUNK_SIZE) {
        senseChunks.push(
          await tx
            .insert(schema.senses)
            .values(senseRows.slice(index, index + CHUNK_SIZE))
            .returning({ id: schema.senses.id }),
        );
      }
      senseIds = senseChunks.flat().map((row) => row.id);
    }

    let senseCursor = 0;
    const glossRows = [];
    for (const entry of entries) {
      for (const sense of entry.senses) {
        const senseId = senseIds[senseCursor];
        senseCursor += 1;
        if (!senseId) {
          throw new Error(`acepção sem id de banco para a entrada ${entry.sequence}`);
        }
        for (const [position, gloss] of sense.glosses.entries()) {
          glossRows.push({
            senseId,
            position,
            language: gloss.language,
            text: gloss.text,
            normalizedText: normalizeGloss(gloss.text),
          });
        }
      }
    }
    if (glossRows.length > 0) {
      await insertChunked(tx, schema.glosses, glossRows);
    }

    return { inserted: entries.length - existingSet.size, updated: existingSet.size };
  });
}
