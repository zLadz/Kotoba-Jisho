import type { DictionaryEntry, SearchResult } from '@kotoba/types';
import { dictionaryService } from '../dictionary/dictionary.service.js';
import { resolveSenseTranslations } from '../dictionary/translations.js';
import { searchRepository, type SearchRepository } from './search.repository.js';

export function toSearchResult(entry: DictionaryEntry, lang: string): SearchResult {
  return {
    id: entry.id,
    kanji: entry.kanji.map((form) => form.text),
    readings: entry.readings.map((reading) => reading.text),
    romaji: entry.readings.map((reading) => reading.romaji),
    translations: entry.senses.flatMap((sense) => resolveSenseTranslations(sense, lang)),
  };
}

interface SearchDependencies {
  searchRepository: SearchRepository;
  getEntriesByIds: (ids: string[]) => Promise<DictionaryEntry[]>;
}

export class SearchService {
  constructor(private readonly dependencies: SearchDependencies) {}

  async search(query: string, limit = 20, offset = 0, lang = 'pt-BR'): Promise<SearchResult[]> {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) {
      return [];
    }

    const matches = await this.dependencies.searchRepository.search(normalized, lang, {
      limit,
      offset,
    });
    const entries = await this.dependencies.getEntriesByIds(matches.map((match) => match.entryId));
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

    const results: SearchResult[] = [];
    for (const match of matches) {
      const entry = entriesById.get(match.entryId);
      if (entry === undefined) {
        continue;
      }
      results.push(toSearchResult(entry, lang));
    }
    return results;
  }
}

export const searchService = new SearchService({
  searchRepository,
  getEntriesByIds: (ids) => dictionaryService.getEntriesByIds(ids),
});
