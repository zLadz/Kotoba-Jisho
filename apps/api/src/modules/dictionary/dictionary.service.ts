import type { DictionaryEntry } from '@kotoba/types';
import { kanaToRomaji } from '@kotoba/romaji';
import {
  dictionaryRepository,
  type DictionaryRepository,
  type RepositoryEntry,
} from './dictionary.repository.js';

export function toDomainEntry(repositoryEntry: RepositoryEntry): DictionaryEntry {
  return {
    id: repositoryEntry.id,
    jmdictSeq: repositoryEntry.jmdictSeq,
    createdAt: repositoryEntry.createdAt,
    updatedAt: repositoryEntry.updatedAt,
    kanji: repositoryEntry.kanji.map((form) => ({
      text: form.text,
      infos: [...form.infos],
      priorities: [...form.priorities],
    })),
    readings: repositoryEntry.readings.map((reading) => ({
      text: reading.text,
      noKanji: reading.noKanji,
      restrictions: [...reading.restrictions],
      infos: [...reading.infos],
      priorities: [...reading.priorities],
      romaji: kanaToRomaji(reading.text),
    })),
    senses: repositoryEntry.senses.map((sense) => ({
      partOfSpeech: [...sense.partOfSpeech],
      fields: [...sense.fields],
      misc: [...sense.misc],
      dialects: [...sense.dialects],
      kanjiRestrictions: [...sense.kanjiRestrictions],
      readingRestrictions: [...sense.readingRestrictions],
      glosses: sense.glosses.map((gloss) => ({ language: gloss.language, text: gloss.text })),
    })),
  };
}

export class DictionaryService {
  constructor(private readonly repository: DictionaryRepository) {}

  async getEntryById(id: string): Promise<DictionaryEntry | null> {
    const entry = await this.repository.getEntryById(id);
    return entry ? toDomainEntry(entry) : null;
  }

  async getEntryBySequence(sequence: number): Promise<DictionaryEntry | null> {
    const entry = await this.repository.getEntryBySequence(sequence);
    return entry ? toDomainEntry(entry) : null;
  }

  async getEntriesByIds(ids: string[]): Promise<DictionaryEntry[]> {
    if (ids.length === 0) {
      return [];
    }
    const entries = await this.repository.getEntriesByIds(ids);
    return entries.map((entry) => toDomainEntry(entry));
  }
}

export const dictionaryService = new DictionaryService(dictionaryRepository);
