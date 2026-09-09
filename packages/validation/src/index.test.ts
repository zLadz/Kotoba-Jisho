import { describe, expect, it } from 'vitest';
import {
  entryParamsSchema,
  entryResponseSchema,
  errorResponseSchema,
  healthResponseSchema,
  searchQuerySchema,
  searchResponseSchema,
} from './index.js';

describe('searchQuerySchema', () => {
  it('aceita query e aplica limite padrão', () => {
    const parsed = searchQuerySchema.safeParse({ q: 'taberu' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ q: 'taberu', limit: 20 });
    }
  });

  it('converte limit string e aplica trim na query', () => {
    const parsed = searchQuerySchema.safeParse({ q: '  comer  ', limit: '5' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ q: 'comer', limit: 5 });
    }
  });

  it('rejeita query vazia ou só espaços', () => {
    expect(searchQuerySchema.safeParse({ q: '' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
  });

  it('rejeita limit inválido', () => {
    expect(searchQuerySchema.safeParse({ q: 'a', limit: 0 }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'a', limit: 51 }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'a', limit: 'abc' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'a', limit: 1.5 }).success).toBe(false);
  });
});

describe('entryParamsSchema', () => {
  it('aceita um UUID', () => {
    expect(
      entryParamsSchema.safeParse({ id: '2cd78c0c-b628-4961-b88b-33d2857c27b2' }).success,
    ).toBe(true);
  });

  it('rejeita ids que não são UUID', () => {
    expect(entryParamsSchema.safeParse({ id: 'abc' }).success).toBe(false);
    expect(entryParamsSchema.safeParse({ id: 123 }).success).toBe(false);
  });
});

describe('response schemas', () => {
  it('valida health response', () => {
    const parsed = healthResponseSchema.safeParse({ status: 'ok' });
    expect(parsed.success).toBe(true);
    expect(healthResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
  });

  it('valida search response', () => {
    const payload = {
      query: 'taberu',
      results: [
        {
          id: '2cd78c0c-b628-4961-b88b-33d2857c27b2',
          kanji: ['食べる'],
          readings: ['たべる'],
          romaji: ['taberu'],
          glosses: [{ language: 'pt-BR', text: 'comer' }],
        },
      ],
    };
    expect(searchResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('valida entry response', () => {
    const payload = {
      id: '2cd78c0c-b628-4961-b88b-33d2857c27b2',
      jmdictSeq: 1410460,
      kanji: [{ text: '食べる', infos: [], priorities: ['ichi1'] }],
      readings: [
        {
          text: 'たべる',
          noKanji: false,
          restrictions: [],
          infos: [],
          priorities: ['ichi1'],
          romaji: 'taberu',
        },
      ],
      senses: [
        {
          partOfSpeech: ['v1', 'vt'],
          fields: ['food'],
          misc: [],
          dialects: [],
          kanjiRestrictions: [],
          readingRestrictions: [],
          glosses: [{ language: 'pt-BR', text: 'comer' }],
        },
      ],
    };
    expect(entryResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('valida error response', () => {
    const parsed = errorResponseSchema.safeParse({
      error: { code: 'ENTRY_NOT_FOUND', message: 'Entry not found' },
    });
    expect(parsed.success).toBe(true);
  });
});
