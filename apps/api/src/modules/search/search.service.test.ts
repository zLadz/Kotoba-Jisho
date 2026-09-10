import { describe, expect, it } from 'vitest';
import type { DictionaryEntry, SearchResult } from '@kotoba/types';
import { SearchService, toSearchResult } from './search.service.js';
import type { SearchMatch } from './search.repository.js';

function makeEntry(id: string, jmdictSeq: number): DictionaryEntry {
  return {
    id,
    jmdictSeq,
    createdAt: new Date('2026-09-08T00:00:00Z'),
    updatedAt: new Date('2026-09-08T00:00:00Z'),
    kanji: jmdictSeq === 1410460 ? [{ text: '食べる', infos: [], priorities: ['ichi1'] }] : [],
    readings: [
      {
        text: 'たべる',
        noKanji: false,
        restrictions: [],
        infos: [],
        priorities: jmdictSeq === 1410460 ? ['ichi1'] : [],
        romaji: 'taberu',
      },
      ...(jmdictSeq === 1000000
        ? [
            {
              text: 'はむ',
              noKanji: false as const,
              restrictions: [] as string[],
              infos: [] as string[],
              priorities: [] as string[],
              romaji: 'hamu' as const,
            },
          ]
        : []),
    ],
    senses: [
      {
        partOfSpeech: ['v1'],
        fields: [],
        misc: [],
        dialects: [],
        kanjiRestrictions: [],
        readingRestrictions: [],
        glosses: [
          { language: 'pt', text: 'comer', source: 'jmdict' },
          { language: 'en', text: 'to eat', source: 'jmdict' },
        ],
        translations: [
          {
            language: 'pt-BR',
            text: 'comer',
            source: 'manual',
            sourceVersion: 'dev-1',
          },
        ],
      },
    ],
  };
}

const fixtureEntries: Record<string, DictionaryEntry> = {
  a: makeEntry('a', 1410460),
  b: makeEntry('b', 3000000),
  c: makeEntry('c', 1000000),
};

function withMatches(matches: Array<[string, SearchMatch]>): SearchService {
  return new SearchService({
    searchRepository: {
      async search() {
        return matches.map(([entryId, match]) => ({ entryId, match }));
      },
    },
    getEntriesByIds: async (ids) => fixtureEntriesList.filter((entry) => ids.includes(entry.id)),
  });
}

const fixtureEntriesList = Object.values(fixtureEntries);

describe('toSearchResult', () => {
  it('resolve traduções do idioma solicitado (pt-BR usa a camada Kotoba)', () => {
    const result: SearchResult = toSearchResult(fixtureEntries.c ?? makeEntry('', 1), 'pt-BR');
    expect(result.kanji).toEqual([]);
    expect(result.readings).toEqual(['たべる', 'はむ']);
    expect(result.romaji).toEqual(['taberu', 'hamu']);
    expect(result.translations).toContainEqual({
      language: 'pt-BR',
      text: 'comer',
      source: 'manual',
      sourceVersion: 'dev-1',
    });
  });

  it('idiomas não-Kotoba caem para os glosses JMdict (§13)', () => {
    const result: SearchResult = toSearchResult(fixtureEntries.c ?? makeEntry('', 1), 'en');
    expect(result.translations).toContainEqual({
      language: 'en',
      text: 'to eat',
      source: 'jmdict',
      sourceVersion: '',
    });
  });

  it('sem dado para o idioma retorna traduções vazias', () => {
    const result: SearchResult = toSearchResult(fixtureEntries.c ?? makeEntry('', 1), 'fr');
    expect(result.translations).toEqual([]);
  });
});

describe('SearchService.search', () => {
  it('retorna vazio para query vazia', async () => {
    const service = withMatches([]);
    expect(await service.search('   ')).toEqual([]);
  });

  it('preserva a ordem e a página retornadas pelo repositório', async () => {
    const service = withMatches([
      ['b', 'exactReading'],
      ['c', 'prefixKanji'],
    ]);
    const results = await service.search('busca', 1, 1);
    expect(results.map((result) => result.id)).toEqual(['b', 'c']);
  });

  it('repassa limit e offset ao repositório', async () => {
    const seen: Array<{
      query: string;
      lang: string;
      options: { limit?: number; offset?: number };
    }> = [];
    const service = new SearchService({
      searchRepository: {
        async search(query: string, lang: string, options) {
          seen.push({ query, lang, options: options ?? {} });
          return [{ entryId: 'a', match: 'exactReading' as const }];
        },
      },
      getEntriesByIds: async (ids) => fixtureEntriesList.filter((entry) => ids.includes(entry.id)),
    });
    await service.search('taberu', 5, 10, 'en');
    expect(seen).toEqual([{ query: 'taberu', lang: 'en', options: { limit: 5, offset: 10 } }]);
  });

  it('normaliza a query em minúsculas e com trim', async () => {
    let seen = '';
    const service = new SearchService({
      searchRepository: {
        async search(query: string) {
          seen = query;
          return fixtureEntriesList.map((entry) => ({
            entryId: entry.id,
            match: 'prefixReading' as const,
          }));
        },
      },
      getEntriesByIds: async (ids) =>
        Object.values(fixtureEntries).filter((entry) => ids.includes(entry.id)),
    });
    await service.search(' TABERU ', 1);
    expect(seen).toBe('taberu');
  });

  it('ignora entradas que deixaram de existir entre busca e hidratação', async () => {
    const service = new SearchService({
      searchRepository: {
        async search() {
          return [{ entryId: 'fantasma', match: 'exactReading' as const }];
        },
      },
      getEntriesByIds: async () => [],
    });
    expect(await service.search('comer')).toEqual([]);
  });
});
