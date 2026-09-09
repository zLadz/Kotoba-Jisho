import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const entries = pgTable(
  'entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jmdictSeq: integer('jmdict_seq').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('entries_jmdict_seq_unique').on(table.jmdictSeq)],
);

export const kanjiForms = pgTable(
  'kanji_forms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    text: text('text').notNull(),
    infos: text('infos').array(),
    priorities: text('priorities').array(),
  },
  (table) => [
    index('kanji_forms_entry_id_idx').on(table.entryId),
    index('kanji_forms_text_trgm_idx').using('gin', sql`${table.text} gin_trgm_ops`),
  ],
);

export const readings = pgTable(
  'readings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    text: text('text').notNull(),
    noKanji: boolean('no_kanji').notNull().default(false),
    restrictions: text('restrictions').array(),
    infos: text('infos').array(),
    priorities: text('priorities').array(),
    romaji: text('romaji').notNull().default(''),
  },
  (table) => [
    index('readings_entry_id_idx').on(table.entryId),
    index('readings_text_trgm_idx').using('gin', sql`${table.text} gin_trgm_ops`),
    index('readings_romaji_trgm_idx').using('gin', sql`${table.romaji} gin_trgm_ops`),
  ],
);

export const senses = pgTable(
  'senses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    partOfSpeech: text('part_of_speech').array(),
    fields: text('fields').array(),
    misc: text('misc').array(),
    dialects: text('dialects').array(),
    kanjiRestrictions: text('kanji_restrictions').array(),
    readingRestrictions: text('reading_restrictions').array(),
  },
  (table) => [index('senses_entry_id_idx').on(table.entryId)],
);

export const glosses = pgTable(
  'glosses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    senseId: uuid('sense_id')
      .notNull()
      .references(() => senses.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    language: text('language').notNull().default('en'),
    text: text('text').notNull(),
  },
  (table) => [
    index('glosses_sense_id_idx').on(table.senseId),
    index('glosses_text_trgm_idx').using('gin', sql`${table.text} gin_trgm_ops`),
  ],
);

export const sourceImports = pgTable(
  'source_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source: text('source').notNull(),
    version: text('version').notNull(),
    checksum: text('checksum').notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('source_imports_source_version_unique').on(table.source, table.version)],
);
