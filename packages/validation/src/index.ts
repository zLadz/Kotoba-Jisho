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

const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export const translationDatasetRowSchema = z.object({
  jmdictSeq: z.number().int().positive('jmdictSeq deve ser um número inteiro positivo'),
  sensePosition: z
    .number()
    .int()
    .nonnegative('sensePosition deve ser um número inteiro não negativo'),
  language: z
    .string()
    .trim()
    .min(2, 'language deve ter pelo menos 2 caracteres')
    .regex(LANGUAGE_PATTERN, 'language em formato de código de idioma inválido'),
  text: z.string().trim().min(1, 'text não pode ser vazio'),
  source: z.string().trim().min(1, 'source não pode ser vazio'),
  sourceVersion: z.string().trim().min(1, 'sourceVersion não pode ser vazio'),
  kanji: z.array(z.string().trim().min(1)).optional(),
  reading: z.array(z.string().trim().min(1)).optional(),
  confidence: z.number().min(0).max(1).optional(),
  position: z.number().int().nonnegative().optional(),
});

export type TranslationDatasetRow = z.infer<typeof translationDatasetRowSchema>;

export const translationDatasetSchema = z.object({
  source: z.string().trim().min(1).optional(),
  version: z.string().trim().min(1).optional(),
  translations: z.array(translationDatasetRowSchema).default([]),
});

export type TranslationDataset = z.infer<typeof translationDatasetSchema>;

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
