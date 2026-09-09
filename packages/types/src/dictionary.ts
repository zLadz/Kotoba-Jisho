export interface KanjiForm {
  text: string;
  infos: string[];
  priorities: string[];
}

export interface Reading {
  text: string;
  noKanji: boolean;
  restrictions: string[];
  infos: string[];
  priorities: string[];
}

export interface Gloss {
  language: string;
  text: string;
}

export interface Sense {
  partOfSpeech: string[];
  fields: string[];
  misc: string[];
  dialects: string[];
  kanjiRestrictions: string[];
  readingRestrictions: string[];
  glosses: Gloss[];
}

export interface ReadingWithRomaji extends Reading {
  romaji: string;
}

export interface DictionaryEntry {
  id: string;
  jmdictSeq: number;
  createdAt: Date;
  updatedAt: Date;
  kanji: KanjiForm[];
  readings: ReadingWithRomaji[];
  senses: Sense[];
}

export interface SearchResult {
  id: string;
  kanji: string[];
  readings: string[];
  romaji: string[];
  glosses: Gloss[];
}
