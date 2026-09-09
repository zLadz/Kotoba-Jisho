import { eq } from 'drizzle-orm';
import { db, schema } from '@kotoba/database';
import { kanaToRomaji } from '@kotoba/romaji';
import type { JmdictEntry } from './types.js';

export async function importEntry(entry: JmdictEntry): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.entries).where(eq(schema.entries.jmdictSeq, entry.sequence));

    const created = await tx
      .insert(schema.entries)
      .values({ jmdictSeq: entry.sequence })
      .returning({ id: schema.entries.id });

    const entryId = created[0]?.id;
    if (!entryId) {
      throw new Error(`Falha ao inserir entrada ${entry.sequence}`);
    }

    for (const form of entry.kanji) {
      await tx.insert(schema.kanjiForms).values({
        entryId,
        position: form.position,
        text: form.text,
        infos: form.infos,
        priorities: form.priorities,
      });
    }

    for (const reading of entry.readings) {
      await tx.insert(schema.readings).values({
        entryId,
        position: reading.position,
        text: reading.text,
        noKanji: reading.noKanji,
        restrictions: reading.restrictions,
        infos: reading.infos,
        priorities: reading.priorities,
        romaji: kanaToRomaji(reading.text),
      });
    }

    for (const sense of entry.senses) {
      const createdSense = await tx
        .insert(schema.senses)
        .values({
          entryId,
          position: sense.position,
          partOfSpeech: sense.partOfSpeech,
          fields: sense.fields,
          misc: sense.misc,
          dialects: sense.dialects,
          kanjiRestrictions: sense.kanjiRestrictions,
          readingRestrictions: sense.readingRestrictions,
        })
        .returning({ id: schema.senses.id });

      const senseId = createdSense[0]?.id;
      if (!senseId) {
        throw new Error(`Falha ao inserir acepção da entrada ${entry.sequence}`);
      }

      for (const [position, gloss] of sense.glosses.entries()) {
        await tx.insert(schema.glosses).values({
          senseId,
          position,
          language: gloss.language,
          text: gloss.text,
        });
      }
    }
  });
}

export interface SourceImportInput {
  source: string;
  version: string;
  checksum: string;
}

export async function registerSourceImport(input: SourceImportInput): Promise<boolean> {
  const rows = await db
    .insert(schema.sourceImports)
    .values(input)
    .onConflictDoNothing()
    .returning({ id: schema.sourceImports.id });
  return rows.length > 0;
}
