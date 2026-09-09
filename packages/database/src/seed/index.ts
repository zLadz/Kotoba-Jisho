import { eq } from 'drizzle-orm';
import { kanaToRomaji } from '@kotoba/romaji';
import { db } from '../db.js';
import { entries, glosses, kanjiForms, readings, senses } from '../schema.js';
import { seedEntries, type SeedEntry } from './data.js';

async function seedEntry(entry: SeedEntry): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(entries).where(eq(entries.jmdictSeq, entry.jmdictSeq));

    const [createdEntry] = await tx
      .insert(entries)
      .values({ jmdictSeq: entry.jmdictSeq })
      .returning();

    if (!createdEntry) {
      throw new Error(`Failed to insert entry ${entry.jmdictSeq}`);
    }

    for (const [position, text] of entry.kanji.entries()) {
      await tx.insert(kanjiForms).values({ entryId: createdEntry.id, position, text });
    }

    for (const [position, text] of entry.readings.entries()) {
      await tx
        .insert(readings)
        .values({ entryId: createdEntry.id, position, text, romaji: kanaToRomaji(text) });
    }

    for (const [position, sense] of entry.senses.entries()) {
      const [createdSense] = await tx
        .insert(senses)
        .values({ entryId: createdEntry.id, position, partOfSpeech: sense.partOfSpeech })
        .returning();

      if (!createdSense) {
        throw new Error(`Failed to insert sense for ${entry.jmdictSeq}`);
      }

      for (const [glossPosition, text] of sense.glosses.entries()) {
        await tx.insert(glosses).values({
          senseId: createdSense.id,
          position: glossPosition,
          language: 'pt-BR',
          text,
        });
      }
    }
  });
}

async function main(): Promise<void> {
  for (const entry of seedEntries) {
    await seedEntry(entry);
    console.log(
      `Seeded #${entry.jmdictSeq} ${entry.kanji.join(', ') || entry.readings.join(', ')}`,
    );
  }
  console.log(`Seed complete: ${seedEntries.length} entries`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
