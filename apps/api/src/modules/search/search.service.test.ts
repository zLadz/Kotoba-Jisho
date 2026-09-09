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

  it('ordena por escore do ranking (§13)', async () => {
    const service = withMatches([
      ['a', 'prefixGloss'],
      ['b', 'exactReading'],
      ['c', 'prefixKanji'],
    ]);
    const results = await service.search('busca');
    expect(results.map((result) => result.id)).toEqual(['b', 'c', 'a']);
  });

  it('prefixo romaji fica abaixo de kanji exato', async () => {
    const service = withMatches([
      ['a', 'prefixRomaji'],
      ['c', 'exactKanji'],
    ]);
    const results = await service.search('busca');
    expect(results.map((result) => result.id)).toEqual(['c', 'a']);
  });

  it('fuzzy fica abaixo de prefixo no ranking (§12/§13)', async () => {
    const service = withMatches([
      ['a', 'fuzzyReading'],
      ['b', 'prefixGloss'],
      ['c', 'fuzzyRomaji'],
    ]);
    const results = await service.search('busca');
    expect(results.map((result) => result.id)).toEqual(['b', 'a', 'c']);
  });

  it('aplica o limite de resultados', async () => {
    const service = withMatches([
      ['a', 'exactReading'],
      ['b', 'prefixReading'],
      ['c', 'prefixReading'],
    ]);
    const results = await service.search('busca', 2);
    expect(results.map((result) => result.id)).toEqual(['a', 'c']);
  });

  it('tradução Kotoba fica acima de gloss JMdict no ranking (§15)', async () => {
    const service = withMatches([
      ['a', 'exactGloss'],
      ['b', 'fuzzyGloss'],
      ['c', 'exactTranslation'],
    ]);
    const results = await service.search('busca');
    expect(results.map((result) => result.id)).toEqual(['c', 'a', 'b']);
  });

  it('prefixo de tradução fica acima de prefixo de gloss', async () => {
    const service = withMatches([
      ['a', 'prefixGloss'],
      ['b', 'prefixTranslation'],
    ]);
    const results = await service.search('busca');
    expect(results.map((result) => result.id)).toEqual(['b', 'a']);
  });

  it('aplica offset de paginação depois do ranking (§13)', async () => {
    const service = withMatches([
      ['a', 'exactReading'],
      ['b', 'prefixReading'],
      ['c', 'prefixReading'],
    ]);
    const page2 = await service.search('busca', 1, 1);
    expect(page2.map((result) => result.id)).toEqual(['c']);

    const both = await service.search('busca', 10, 0);
    expect(both.map((result) => result.id)).toEqual(['a', 'c', 'b']);
    expect(await service.search('busca', 10, 3)).toEqual([]);
  });

  it('desempate por prioridade e depois jmdict_seq', async () => {
    const priority = new SearchService({
      searchRepository: {
        async search() {
          return [
            { entryId: 'b', match: 'prefixReading' as const },
            { entryId: 'a', match: 'prefixReading' as const },
          ];
        },
      },
      getEntriesByIds: async (ids) => fixtureEntriesList.filter((entry) => ids.includes(entry.id)),
    });
    const priorityResults = await priority.search('busca');
    expect(priorityResults.map((result) => result.id)).toEqual(['a', 'b']);

    const bySeq = withMatches([
      ['b', 'prefixReading'],
      ['c', 'prefixReading'],
    ]);
    const seqResults = await bySeq.search('busca');
    expect(seqResults.map((result) => result.id)).toEqual(['c', 'b']);
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
