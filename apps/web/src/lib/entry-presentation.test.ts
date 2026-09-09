import { describe, expect, it } from 'vitest';
import type { EntryResponse } from '@kotoba/validation';
import { presentEntry } from './entry-presentation';

function makeSense(
  overrides: Partial<EntryResponse['senses'][number]>,
): EntryResponse['senses'][number] {
  return {
    partOfSpeech: [],
    fields: [],
    misc: [],
    dialects: [],
    kanjiRestrictions: [],
    readingRestrictions: [],
    translations: [],
    sourceGlosses: [],
    ...overrides,
  };
}

function makeEntry(senses: Array<Partial<EntryResponse['senses'][number]>>): EntryResponse {
  return {
    id: '2cd78c0c-b628-4961-b88b-33d2857c27b2',
    jmdictSeq: 1410460,
    kanji: [],
    readings: [],
    senses: senses.map(makeSense),
  };
}

describe('presentEntry', () => {
  it('Teste 2: entrada sem PT-BR gera uma única indicação, não uma por sense', () => {
    const entry = makeEntry([
      { partOfSpeech: ['v1'] },
      { partOfSpeech: ['v1'] },
      { partOfSpeech: ['v1'] },
    ]);
    const presented = presentEntry(entry, 'pt-BR');
    expect(presented.senses).toHaveLength(0);
    expect(presented.message).toBe('Tradução em português ainda não disponível.');
  });

  it('Teste 3: tradução PT-BR em um único sense exibe somente esse sense', () => {
    const entry = makeEntry([
      { partOfSpeech: ['v1'] },
      {
        partOfSpeech: ['v1', 'vt'],
        translations: [
          { language: 'pt-BR', text: 'comer', source: 'manual', sourceVersion: 'dev-1' },
        ],
      },
      { partOfSpeech: ['v1'] },
    ]);
    const presented = presentEntry(entry, 'pt-BR');
    expect(presented.message).toBeNull();
    expect(presented.senses).toHaveLength(1);
    expect(presented.senses[0]?.number).toBe(1);
    expect(presented.senses[0]?.partOfSpeech).toEqual(['v1', 'vt']);
    expect(presented.senses[0]?.translations.map((t) => t.text)).toEqual(['comer']);
  });

  it('Teste 4: traduções de um sense não vazam para outro', () => {
    const entry = makeEntry([
      {
        translations: [
          { language: 'pt-BR', text: 'comer', source: 'manual', sourceVersion: 'dev-1' },
        ],
      },
      {
        translations: [
          { language: 'pt-BR', text: 'viver de', source: 'manual', sourceVersion: 'dev-1' },
        ],
      },
    ]);
    const presented = presentEntry(entry, 'pt-BR');
    expect(presented.senses).toHaveLength(2);
    expect(presented.senses[0]?.translations.map((t) => t.text)).toEqual(['comer']);
    expect(presented.senses[1]?.translations.map((t) => t.text)).toEqual(['viver de']);
  });

  it('Teste 5: glosses en existentes não viram fallback PT-BR', () => {
    const entry = makeEntry([
      {
        sourceGlosses: [
          { language: 'en', text: 'to live on (e.g. a salary)', source: 'jmdict' },
          { language: 'en', text: 'to live off', source: 'jmdict' },
        ],
      },
    ]);
    const ptBr = presentEntry(entry, 'pt-BR');
    expect(ptBr.senses).toHaveLength(0);
    expect(ptBr.message).toBe('Tradução em português ainda não disponível.');

    const en = presentEntry(entry, 'en');
    expect(en.message).toBeNull();
    expect(en.senses[0]?.translations).toEqual([]);
    expect(en.senses[0]?.glosses.map((g) => g.text)).toEqual([
      'to live on (e.g. a salary)',
      'to live off',
    ]);
  });

  it('Teste 6: POS é metadado separado, não parte da tradução', () => {
    const entry = makeEntry([
      {
        partOfSpeech: ['v1', 'vt'],
        translations: [
          { language: 'pt-BR', text: 'comer', source: 'manual', sourceVersion: 'dev-1' },
        ],
      },
    ]);
    const presented = presentEntry(entry, 'pt-BR');
    expect(presented.senses[0]?.partOfSpeech).toEqual(['v1', 'vt']);
    expect(presented.senses[0]?.translations.map((t) => t.text)).toEqual(['comer']);
    const allText = presented.senses[0]?.translations.map((t) => t.text).join(' ') ?? '';
    expect(allText).not.toContain('v1');
    expect(allText).not.toContain('vt');
  });
});
