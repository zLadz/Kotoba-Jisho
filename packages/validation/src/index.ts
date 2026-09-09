import { z } from 'zod';
import { DEFAULT_LANGUAGE } from '@kotoba/types';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'query deve ter pelo menos 1 caractere'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  lang: z.string().trim().min(2).max(20).optional().default(DEFAULT_LANGUAGE),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const entryParamsSchema = z.object({
  id: z.string().uuid(),
  lang: z.string().trim().min(2).max(20).optional().default(DEFAULT_LANGUAGE),
});

export type EntryParams = z.infer<typeof entryParamsSchema>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const glossSchema = z.object({
  language: z.string(),
  text: z.string(),
  source: z.string(),
});

export type GlossContract = z.infer<typeof glossSchema>;

export const kotobaTranslationSchema = z.object({
  language: z.string(),
  text: z.string(),
  source: z.string(),
  sourceVersion: z.string(),
  confidence: z.number().optional(),
});

export type KotobaTranslationContract = z.infer<typeof kotobaTranslationSchema>;

export const searchResultSchema = z.object({
  id: z.string().uuid(),
  kanji: z.array(z.string()),
  readings: z.array(z.string()),
  romaji: z.array(z.string()),
  translations: z.array(kotobaTranslationSchema),
});

export type SearchResultContract = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  query: z.string(),
  results: z.array(searchResultSchema),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;

const kanjiFormSchema = z.object({
  text: z.string(),
  infos: z.array(z.string()),
  priorities: z.array(z.string()),
});

const readingSchema = z.object({
  text: z.string(),
  noKanji: z.boolean(),
  restrictions: z.array(z.string()),
  infos: z.array(z.string()),
  priorities: z.array(z.string()),
  romaji: z.string(),
});

const senseSchema = z.object({
  partOfSpeech: z.array(z.string()),
  fields: z.array(z.string()),
  misc: z.array(z.string()),
  dialects: z.array(z.string()),
  kanjiRestrictions: z.array(z.string()),
  readingRestrictions: z.array(z.string()),
  translations: z.array(kotobaTranslationSchema),
  sourceGlosses: z.array(glossSchema),
});

export const entryResponseSchema = z.object({
  id: z.string().uuid(),
  jmdictSeq: z.number().int(),
  kanji: z.array(kanjiFormSchema),
  readings: z.array(readingSchema),
  senses: z.array(senseSchema),
});

export type EntryResponse = z.infer<typeof entryResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
