import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEntry, parseHeaderBlock } from './parser.js';
import { validateEntry } from './validate.js';

const fixturePath = new URL('../fixtures/jmdict-fixture.xml', import.meta.url);
const fixture = readFileSync(fixturePath, 'utf8');

function entriesOf(xml: string): string[] {
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []).filter(
    (value): value is string => value != null,
  );
}

function headerBlockOf(xml: string): string {
  const end = xml.indexOf('</header>');
  return xml.slice(0, end + '</header>'.length);
}

function entryAt(xml: string, index: number): string {
  const entry = entriesOf(xml)[index];
  if (!entry) {
    throw new Error(`Fixture sem entrada no índice ${index}`);
  }
  return entry;
}

describe('parseHeaderBlock', () => {
  it('extrai fileVersion como versão preferida', () => {
    const header = parseHeaderBlock(headerBlockOf(fixture));
    expect(header.version).toBe('2026-09-08');
    expect(header.fileVersion).toBe('2026-09-08');
    expect(header.revision).toBe('1.02');
  });

  it('usa fallback de revisão quando não há fileVersion', () => {
    const header = parseHeaderBlock(
      headerBlockOf(fixture).replace(/<fileVersion>.*<\/fileVersion>\s*/, ''),
    );
    expect(header.version).toMatch(/^1\.02\+/);
  });
});

describe('parseEntry', () => {
  it('parseia 食べる com kanji, leituras e acepções', () => {
    const entry = parseEntry(entryAt(fixture, 0));
    expect(entry.sequence).toBe(1410460);
    expect(entry.kanji.map((k) => k.text)).toEqual(['食べる', '喰べる']);
    expect(entry.kanji[0]?.priorities).toEqual(['ichi1', 'news1']);
    expect(entry.kanji[1]?.infos).toEqual(['ateji']);
    expect(entry.readings).toHaveLength(2);
    expect(entry.readings[1]?.restrictions).toEqual(['喰べる']);
    expect(entry.readings[1]?.infos).toEqual(['uk']);
    expect(entry.readings[1]?.noKanji).toBe(false);
    expect(entry.senses).toHaveLength(3);
  });

  it('decodifica códigos de POS e mantém ordem dos glosses', () => {
    const entry = parseEntry(entryAt(fixture, 0));
    const sense = entry.senses[0];
    expect(sense?.partOfSpeech).toEqual(['adj-i']);
    const glosses = sense?.glosses ?? [];
    expect(glosses.map((g) => g.language)).toEqual(['pt', 'pt', 'en']);
    expect(glosses[0]?.text).toBe('comestível');
    expect(glosses[1]?.text).toBe('próprio para comer');
    expect(glosses[2]?.text).toBe('edible');
  });

  it('parseia campos extras de sense (field, misc, stagk, stagr)', () => {
    const entry = parseEntry(entryAt(fixture, 0));
    const sense = entry.senses[1];
    expect(sense?.partOfSpeech).toEqual(['v1', 'vt']);
    expect(sense?.fields).toEqual(['food']);
    expect(sense?.misc).toEqual(['col']);
    expect(sense?.kanjiRestrictions).toEqual(['食べる']);
    expect(sense?.readingRestrictions).toEqual(['たべる']);
  });

  it('marca re_nokanji e decodifica entidades predefinidas de gloss', () => {
    const entry = parseEntry(entryAt(fixture, 3));
    expect(entry.sequence).toBe(1742690);
    expect(entry.readings[0]?.noKanji).toBe(true);
    expect(entry.readings[0]?.text).toBe('コーヒー');
    const glosses = entry.senses[0]?.glosses ?? [];
    expect(glosses.map((g) => g.language)).toEqual(['pt', 'en', 'pt']);
    expect(glosses[2]?.text).toBe('café & leite');
  });

  it('mantém componentes únicos como arrays', () => {
    const entry = parseEntry(entryAt(fixture, 1));
    expect(entry.kanji).toHaveLength(1);
    expect(entry.readings).toHaveLength(2);
    expect(entry.senses[0]?.glosses.map((g) => g.text)).toEqual(['Japão', 'Japan']);
  });
});

describe('validateEntry', () => {
  it('aceita uma entrada JMdict válida', () => {
    const entry = parseEntry(entryAt(fixture, 1));
    expect(validateEntry(entry).valid).toBe(true);
  });

  it('rejeita entrada sem leitura', () => {
    const entry = parseEntry(entryAt(fixture, 1));
    entry.readings = [];
    const { valid, warnings } = validateEntry(entry);
    expect(valid).toBe(false);
    expect(warnings).toContain('entrada sem r_ele (leitura é obrigatória)');
  });
});
