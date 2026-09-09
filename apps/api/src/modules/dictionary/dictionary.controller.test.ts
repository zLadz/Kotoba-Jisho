import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '@kotoba/types';
import { entryResponseSchema } from '@kotoba/validation';
import { toEntryResponse } from './dictionary.controller.js';

const fixture: DictionaryEntry = {
  id: '2cd78c0c-b628-4961-b88b-33d2857c27b2',
  jmdictSeq: 1410460,
  createdAt: new Date('2026-09-08T00:00:00Z'),
  updatedAt: new Date('2026-09-08T00:00:00Z'),
  kanji: [
    { text: '食べる', infos: [], priorities: ['ichi1'] },
    { text: '喰べる', infos: ['ateji'], priorities: [] },
  ],
  readings: [
    {
      text: 'たべる',
      noKanji: false,
      restrictions: [],
      infos: [],
      priorities: ['ichi1'],
      romaji: 'taberu',
    },
    {
      text: 'はむ',
      noKanji: false,
      restrictions: ['喰べる'],
      infos: ['uk'],
      priorities: [],
      romaji: 'hamu',
    },
  ],
  senses: [
    {
      partOfSpeech: ['adj-i'],
      fields: [],
      misc: [],
      dialects: [],
      kanjiRestrictions: [],
      readingRestrictions: [],
      glosses: [
        { language: 'pt', text: 'comestível', source: 'jmdict' },
        { language: 'en', text: 'edible', source: 'jmdict' },
      ],
      translations: [
        {
          language: 'pt-BR',
          text: 'comestível',
          source: 'manual',
          sourceVersion: 'dev-1',
        },
      ],
    },
  ],
};

describe('toEntryResponse', () => {
  it('projeta o domínio para o DTO de resposta', () => {
    const dto = toEntryResponse(fixture, 'pt-BR');
    expect(dto.id).toBe(fixture.id);
    expect(dto.jmdictSeq).toBe(1410460);
    expect(dto.kanji[1]?.infos).toEqual(['ateji']);
    expect(dto.readings[1]?.restrictions).toEqual(['喰べる']);
    expect(dto.senses[0]?.translations).toContainEqual({
      language: 'pt-BR',
      text: 'comestível',
      source: 'manual',
      sourceVersion: 'dev-1',
    });
  });

  it('pt-BR usa somente a camada Kotoba e não cai para glosses (§13)', () => {
    const dto = toEntryResponse(fixture, 'pt-BR');
    expect(dto.senses[0]?.translations).toHaveLength(1);
    expect(dto.senses[0]?.translations[0]?.source).toBe('manual');
  });

  it('idioma não-Kotoba resolve para glosses JMdict com source jmdict', () => {
    const dto = toEntryResponse(fixture, 'en');
    expect(dto.senses[0]?.translations).toContainEqual({
      language: 'en',
      text: 'edible',
      source: 'jmdict',
      sourceVersion: '',
    });
  });

  it('idioma sem dado algum retorna traduções vazias', () => {
    const dto = toEntryResponse(fixture, 'fr');
    expect(dto.senses[0]?.translations).toEqual([]);
  });

  it('não expõe createdAt/updatedAt', () => {
    const dto = toEntryResponse(fixture, 'pt-BR');
    expect('createdAt' in dto).toBe(false);
    expect('updatedAt' in dto).toBe(false);
  });

  it('produz contrato válido pelo schema zod', () => {
    const dto = toEntryResponse(fixture, 'pt-BR');
    expect(entryResponseSchema.safeParse(dto).success).toBe(true);
  });
});
