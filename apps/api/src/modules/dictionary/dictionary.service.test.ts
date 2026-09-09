import { describe, expect, it } from 'vitest';
import { DictionaryService, toDomainEntry } from './dictionary.service.js';
import type { DictionaryRepository, RepositoryEntry } from './dictionary.repository.js';

const fixtureEntry: RepositoryEntry = {
  id: '00000000-0000-0000-0000-000000000001',
  jmdictSeq: 1410460,
  createdAt: new Date('2026-09-08T00:00:00Z'),
  updatedAt: new Date('2026-09-08T00:00:00Z'),
  kanji: [
    { text: '食べる', infos: [], priorities: ['ichi1'] },
    { text: '喰べる', infos: ['ateji'], priorities: [] },
  ],
  readings: [
    { text: 'たべる', noKanji: false, restrictions: [], infos: [], priorities: ['ichi1'] },
    { text: 'はむ', noKanji: false, restrictions: ['喰べる'], infos: ['uk'], priorities: [] },
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
        { language: 'pt', text: 'comestível' },
        { language: 'en', text: 'edible' },
      ],
    },
    {
      partOfSpeech: ['v1', 'vt'],
      fields: ['food'],
      misc: ['col'],
      dialects: [],
      kanjiRestrictions: ['食べる'],
      readingRestrictions: ['たべる'],
      glosses: [
        { language: 'pt', text: 'comer' },
        { language: 'en', text: 'to eat' },
      ],
    },
  ],
};

describe('toDomainEntry', () => {
  it('mapeia a entrada preservando ordem e metadados', () => {
    const domain = toDomainEntry(fixtureEntry);
    expect(domain.id).toBe(fixtureEntry.id);
    expect(domain.jmdictSeq).toBe(1410460);
    expect(domain.kanji[1]?.infos).toEqual(['ateji']);
    expect(domain.senses).toHaveLength(2);
    expect(domain.senses[0]?.partOfSpeech).toEqual(['adj-i']);
    expect(domain.senses[1]?.glosses.map((gloss) => gloss.text)).toEqual(['comer', 'to eat']);
  });

  it('deriva romaji das leituras', () => {
    const domain = toDomainEntry(fixtureEntry);
    expect(domain.readings.map((reading) => reading.romaji)).toEqual(['taberu', 'hamu']);
  });

  it('não muta os arrays do repositório', () => {
    const domain = toDomainEntry(fixtureEntry);
    domain.readings[0]?.infos.push('marcado');
    expect(fixtureEntry.readings[0]?.infos).toEqual([]);
  });
});

describe('DictionaryService', () => {
  const repository: DictionaryRepository = {
    async getEntryById(id: string) {
      return id === fixtureEntry.id ? fixtureEntry : undefined;
    },
    async getEntryBySequence(sequence: number) {
      return sequence === fixtureEntry.jmdictSeq ? fixtureEntry : undefined;
    },
    async getEntriesByIds(ids: string[]) {
      return ids.includes(fixtureEntry.id) ? [fixtureEntry] : [];
    },
  };

  it('recupera entrada por id', async () => {
    const service = new DictionaryService(repository);
    const entry = await service.getEntryById(fixtureEntry.id);
    expect(entry?.readings[0]?.romaji).toBe('taberu');
  });

  it('recupera entrada por jmdict_seq', async () => {
    const service = new DictionaryService(repository);
    const entry = await service.getEntryBySequence(1410460);
    expect(entry?.kanji[0]?.text).toBe('食べる');
  });

  it('retorna null quando a entrada não existe', async () => {
    const service = new DictionaryService(repository);
    expect(await service.getEntryById('não-existe')).toBeNull();
    expect(await service.getEntryBySequence(999999)).toBeNull();
  });
});
