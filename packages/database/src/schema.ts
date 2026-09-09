import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const sourceImports = pgTable(
  'source_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source: text('source').notNull(),
    version: text('version').notNull(),
    checksum: text('checksum').notNull(),
    status: text('status').notNull().default('pending'),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    entriesProcessed: integer('entries_processed').notNull().default(0),
    entriesInserted: integer('entries_inserted').notNull().default(0),
    entriesUpdated: integer('entries_updated').notNull().default(0),
    entriesSkipped: integer('entries_skipped').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms').notNull().default(0),
  },
  (table) => [uniqueIndex('source_imports_source_version_unique').on(table.source, table.version)],
);

export const entries = pgTable(
  'entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jmdictSeq: integer('jmdict_seq').notNull(),
    sourceImportId: uuid('source_import_id').references(() => sourceImports.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('entries_jmdict_seq_unique').on(table.jmdictSeq),
    index('entries_source_import_id_idx').on(table.sourceImportId),
  ],
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
    normalizedText: text('normalized_text').notNull().default(''),
  },
  (table) => [
    index('readings_entry_id_idx').on(table.entryId),
    index('readings_text_trgm_idx').using('gin', sql`${table.text} gin_trgm_ops`),
    index('readings_romaji_trgm_idx').using('gin', sql`${table.romaji} gin_trgm_ops`),
    index('readings_normalized_text_idx').on(table.normalizedText),
    index('readings_normalized_text_trgm_idx').using(
      'gin',
      sql`${table.normalizedText} gin_trgm_ops`,
    ),
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
    normalizedText: text('normalized_text').notNull().default(''),
    source: text('source').notNull().default('jmdict'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('glosses_sense_id_idx').on(table.senseId),
    index('glosses_text_trgm_idx').using('gin', sql`${table.text} gin_trgm_ops`),
    index('glosses_normalized_text_idx').on(table.normalizedText),
    index('glosses_normalized_text_trgm_idx').using(
      'gin',
      sql`${table.normalizedText} gin_trgm_ops`,
    ),
  ],
);

export const translations = pgTable(
  'translations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    senseId: uuid('sense_id')
      .notNull()
      .references(() => senses.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    language: text('language').notNull(),
    text: text('text').notNull(),
    normalizedText: text('normalized_text').notNull().default(''),
    source: text('source').notNull(),
    sourceVersion: text('source_version').notNull().default(''),
    confidence: real('confidence'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('translations_sense_id_idx').on(table.senseId),
    index('translations_normalized_text_idx').on(table.normalizedText),
    index('translations_normalized_text_trgm_idx').using(
      'gin',
      sql`${table.normalizedText} gin_trgm_ops`,
    ),
    uniqueIndex('translations_sense_language_text_source_unique').on(
      table.senseId,
      table.language,
      table.text,
      table.source,
      table.sourceVersion,
    ),
  ],
);
