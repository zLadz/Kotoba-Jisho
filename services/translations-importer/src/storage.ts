import { and, eq, inArray, or } from 'drizzle-orm';
import { db, schema } from '@kotoba/database';
import { normalizeGloss } from '@kotoba/normalize';

export interface TranslationRow {
  jmdictSeq: number;
  sensePosition: number;
  language: string;
  text: string;
  source: string;
  sourceVersion: string;
  kanji?: string[];
  reading?: string[];
  confidence?: number;
  position?: number;
}

export interface TranslationSourceKey {
  source: string;
  sourceVersion: string;
}

export interface TranslationImportInput {
  source: string;
  version: string;
  checksum: string;
}

export interface TranslationImportProgress {
  processed: number;
  inserted: number;
  skipped: number;
  errors: number;
}

export interface TranslationBatchResult {
  inserted: number;
  skipped: number;
  errors: number;
}

export interface TranslationImportHandle {
  id: string;
  status: string;
  checksum: string | null;
}

export async function startTranslationImport(
  input: TranslationImportInput,
): Promise<TranslationImportHandle> {
  const created = await db
    .insert(schema.sourceImports)
    .values(input)
    .onConflictDoNothing()
    .returning({
      id: schema.sourceImports.id,
      status: schema.sourceImports.status,
      checksum: schema.sourceImports.checksum,
    });

  if (created[0]) {
    return created[0];
  }

  const existing = await db
    .select({
      id: schema.sourceImports.id,
      status: schema.sourceImports.status,
      checksum: schema.sourceImports.checksum,
    })
    .from(schema.sourceImports)
    .where(eq(schema.sourceImports.source, input.source))
    .limit(1);

  if (!existing[0]) {
    throw new Error(`source_import não encontrado para ${input.source}@${input.version}`);
  }
  return existing[0];
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

export async function updateTranslationProgress(
  id: string,
  progress: TranslationImportProgress,
): Promise<void> {
  await db
    .update(schema.sourceImports)
    .set({
      entriesProcessed: progress.processed,
      entriesInserted: progress.inserted,
      entriesSkipped: progress.skipped,
      errors: progress.errors,
    })
    .where(eq(schema.sourceImports.id, id));
}

export async function completeTranslationImport(
  id: string,
  progress: TranslationImportProgress,
  startedAtMs: number,
  checksum?: string,
): Promise<void> {
  await db
    .update(schema.sourceImports)
    .set({
      status: 'completed',
      checksum,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAtMs,
      entriesProcessed: progress.processed,
      entriesInserted: progress.inserted,
      entriesSkipped: progress.skipped,
      errors: progress.errors,
      errorMessage: null,
    })
    .where(eq(schema.sourceImports.id, id));
}

export async function failTranslationImport(
  id: string,
  errorMessage: string,
  progress: TranslationImportProgress,
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
      entriesSkipped: progress.skipped,
      errors: progress.errors,
      errorMessage,
    })
    .where(eq(schema.sourceImports.id, id));
}

const CHUNK_SIZE = 2000;

type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertChunked<T extends object>(
  tx: Tx,
  table: Parameters<Tx['insert']>[0],
  rows: T[],
): Promise<void> {
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    await tx.insert(table).values(rows.slice(index, index + CHUNK_SIZE));
  }
}

export async function replaceTranslationRows(
  pairs: TranslationSourceKey[],
  tx: Tx = db,
): Promise<void> {
  const conditions = pairs.map((pair) =>
    and(
      eq(schema.translations.source, pair.source),
      eq(schema.translations.sourceVersion, pair.sourceVersion),
    ),
  );
  if (conditions.length === 0) {
    return;
  }
  await tx.delete(schema.translations).where(or(...conditions));
}

export async function flushTranslationBatch(
  rows: TranslationRow[],
  tx: Tx = db,
): Promise<TranslationBatchResult> {
  if (rows.length === 0) {
    return { inserted: 0, skipped: 0, errors: 0 };
  }

  const jmdictSeqs = [...new Set(rows.map((row) => row.jmdictSeq))];
  const entryRows = await tx
    .select({ id: schema.entries.id, jmdictSeq: schema.entries.jmdictSeq })
    .from(schema.entries)
    .where(inArray(schema.entries.jmdictSeq, jmdictSeqs));

  const entryIdBySeq = new Map<number, string>();
  for (const row of entryRows) {
    entryIdBySeq.set(row.jmdictSeq, row.id);
  }

  const entryIds = entryRows.map((entry) => entry.id);
  const [kanjiSurfaceRows, readingSurfaceRows] =
    entryIds.length > 0
      ? await Promise.all([
          tx
            .select({ entryId: schema.kanjiForms.entryId, text: schema.kanjiForms.text })
            .from(schema.kanjiForms)
            .where(inArray(schema.kanjiForms.entryId, entryIds)),
          tx
            .select({ entryId: schema.readings.entryId, text: schema.readings.text })
            .from(schema.readings)
            .where(inArray(schema.readings.entryId, entryIds)),
        ])
      : [[], []];

  const entrySurfaces = new Map<string, Set<string>>();
  for (const row of kanjiSurfaceRows) {
    if (!entrySurfaces.has(row.entryId)) {
      entrySurfaces.set(row.entryId, new Set());
    }
    entrySurfaces.get(row.entryId)?.add(row.text);
  }
  for (const row of readingSurfaceRows) {
    if (!entrySurfaces.has(row.entryId)) {
      entrySurfaces.set(row.entryId, new Set());
    }
    entrySurfaces.get(row.entryId)?.add(row.text);
  }

  const senseRows = await tx
    .select({
      id: schema.senses.id,
      entryId: schema.senses.entryId,
      position: schema.senses.position,
    })
    .from(schema.senses)
    .where(inArray(schema.senses.entryId, entryIds));

  const senseIdByEntryAndPosition = new Map<string, string>();
  for (const row of senseRows) {
    senseIdByEntryAndPosition.set(`${row.entryId}:${row.position}`, row.id);
  }

  const senseId = (jmdictSeq: number, position: number): string | undefined => {
    const entryId = entryIdBySeq.get(jmdictSeq);
    if (!entryId) return undefined;
    return senseIdByEntryAndPosition.get(`${entryId}:${position}`);
  };

  let skipped = 0;
  let errors = 0;
  const resolvedRows: Array<{ row: TranslationRow; index: number; senseId: string }> = [];

  for (const [index, row] of rows.entries()) {
    const entryId = entryIdBySeq.get(row.jmdictSeq);
    if (!entryId) {
      skipped += 1;
      continue;
    }
    const resolvedSenseId = senseId(row.jmdictSeq, row.sensePosition);
    if (!resolvedSenseId) {
      skipped += 1;
      continue;
    }
    const declared = [...(row.kanji ?? []), ...(row.reading ?? [])];
    const surfaces = entrySurfaces.get(entryId) ?? new Set<string>();
    if (declared.length === 0 || !declared.some((surface) => surfaces.has(surface))) {
      errors += 1;
      continue;
    }
    resolvedRows.push({ row, index, senseId: resolvedSenseId });
  }

  const translationRows = resolvedRows.map(({ row, index, senseId: resolvedSenseId }) => ({
    senseId: resolvedSenseId,
    position: row.position ?? index,
    language: row.language,
    text: row.text,
    normalizedText: normalizeGloss(row.text),
    source: row.source,
    sourceVersion: row.sourceVersion,
    confidence: row.confidence ?? null,
  }));

  if (translationRows.length === 0) {
    return { inserted: 0, skipped, errors };
  }

  const senseIds = [...new Set(translationRows.map((row) => row.senseId))];
  const languages = [...new Set(translationRows.map((row) => row.language))];
  const existingRows = await tx
    .select({
      senseId: schema.translations.senseId,
      language: schema.translations.language,
      text: schema.translations.text,
      source: schema.translations.source,
      sourceVersion: schema.translations.sourceVersion,
    })
    .from(schema.translations)
    .where(
      and(
        inArray(schema.translations.senseId, senseIds),
        inArray(schema.translations.language, languages),
      ),
    );

  const existingKeys = new Set(
    existingRows.map(
      (row) => `${row.senseId}|${row.language}|${row.text}|${row.source}|${row.sourceVersion}`,
    ),
  );
  const pending = translationRows.filter(
    (row) =>
      !existingKeys.has(
        `${row.senseId}|${row.language}|${row.text}|${row.source}|${row.sourceVersion}`,
      ),
  );

  if (pending.length > 0) {
    await insertChunked(tx, schema.translations, pending);
  }

  return { inserted: pending.length, skipped, errors };
}

export async function importTranslationsAtomically(
  rows: TranslationRow[],
  pairs: TranslationSourceKey[],
): Promise<TranslationBatchResult> {
  return await db.transaction(async (tx) => {
    await replaceTranslationRows(pairs, tx);
    const result: TranslationBatchResult = { inserted: 0, skipped: 0, errors: 0 };
    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const batch = await flushTranslationBatch(rows.slice(index, index + CHUNK_SIZE), tx);
      result.inserted += batch.inserted;
      result.skipped += batch.skipped;
      result.errors += batch.errors;
    }
    return result;
  });
}
