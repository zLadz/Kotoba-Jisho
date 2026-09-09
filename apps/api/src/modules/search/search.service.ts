import type { DictionaryEntry, SearchResult } from '@kotoba/types';
import { dictionaryService } from '../dictionary/dictionary.service.js';
import { searchRepository, type SearchMatch, type SearchRepository } from './search.repository.js';

const SCORES: Record<SearchMatch, number> = {
  exactReading: 4000,
  exactKanji: 3200,
  exactRomaji: 3000,
  exactGloss: 2000,
  tokenReading: 3800,
  tokenGloss: 1900,
  prefixReading: 1800,
  prefixKanji: 1600,
  prefixRomaji: 1400,
  prefixGloss: 1000,
  tokenPrefixReading: 1700,
  tokenPrefixGloss: 950,
  fuzzyReading: 900,
  fuzzyKanji: 800,
  fuzzyRomaji: 700,
  fuzzyGloss: 500,
  tokenFuzzyReading: 850,
  tokenFuzzyGloss: 480,
};

const PRIORITY_TAGS = ['news1', 'ichi1'];

export function toSearchResult(entry: DictionaryEntry): SearchResult {
  return {
    id: entry.id,
    kanji: entry.kanji.map((form) => form.text),
    readings: entry.readings.map((reading) => reading.text),
    romaji: entry.readings.map((reading) => reading.romaji),
    glosses: entry.senses.flatMap((sense) =>
      sense.glosses.map((gloss) => ({ language: gloss.language, text: gloss.text })),
    ),
  };
}

export function hasPriority(entry: DictionaryEntry): boolean {
  const tags = [
    ...entry.kanji.flatMap((form) => form.priorities),
    ...entry.readings.flatMap((reading) => reading.priorities),
  ];
  return tags.some((tag) => PRIORITY_TAGS.includes(tag));
}

interface SearchDependencies {
  searchRepository: SearchRepository;
  getEntriesByIds: (ids: string[]) => Promise<DictionaryEntry[]>;
}

export class SearchService {
  constructor(private readonly dependencies: SearchDependencies) {}

  async search(query: string, limit = 20, offset = 0): Promise<SearchResult[]> {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) {
      return [];
    }

    const matches = await this.dependencies.searchRepository.search(normalized);
    const bestScore = new Map<string, number>();
    for (const match of matches) {
      const score = SCORES[match.match];
      const current = bestScore.get(match.entryId) ?? 0;
      if (score > current) {
        bestScore.set(match.entryId, score);
      }
    }

    const entries = await this.dependencies.getEntriesByIds(Array.from(bestScore.keys()));
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

    return Array.from(bestScore.entries())
      .filter(([entryId]) => entriesById.has(entryId))
      .sort(([leftId, leftScore], [rightId, rightScore]) => {
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }
        const left = entriesById.get(leftId);
        const right = entriesById.get(rightId);
        if (right === undefined || left === undefined) {
          return 0;
        }
        const leftPriority = hasPriority(left) ? 1 : 0;
        const rightPriority = hasPriority(right) ? 1 : 0;
        if (leftPriority !== rightPriority) {
          return rightPriority - leftPriority;
        }
        return left.jmdictSeq - right.jmdictSeq;
      })
      .slice(offset, offset + limit)
      .map(([entryId]) => {
        const entry = entriesById.get(entryId);
        if (entry === undefined) {
          throw new Error(`Entrada ${entryId} não encontrada após a busca`);
        }
        return toSearchResult(entry);
      });
  }
}

export const searchService = new SearchService({
  searchRepository,
  getEntriesByIds: (ids) => dictionaryService.getEntriesByIds(ids),
});
