export interface JmdictGloss {
  language: string;
  text: string;
}

export interface JmdictSense {
  position: number;
  partOfSpeech: string[];
  fields: string[];
  misc: string[];
  dialects: string[];
  kanjiRestrictions: string[];
  readingRestrictions: string[];
  glosses: JmdictGloss[];
}

export interface JmdictKanjiForm {
  position: number;
  text: string;
  infos: string[];
  priorities: string[];
}

export interface JmdictReading {
  position: number;
  text: string;
  noKanji: boolean;
  restrictions: string[];
  infos: string[];
  priorities: string[];
}

export interface JmdictEntry {
  sequence: number;
  kanji: JmdictKanjiForm[];
  readings: JmdictReading[];
  senses: JmdictSense[];
}

export interface JmdictHeader {
  version: string;
  revision?: string;
  fileVersion?: string;
  comments?: string;
}
