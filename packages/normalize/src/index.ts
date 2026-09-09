const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KATAKANA_TO_HIRAGANA_OFFSET = 0x60;

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const WHITESPACE = /\s+/g;

export function toHiragana(input: string): string {
  return Array.from(input.normalize('NFKC'), (char) => {
    const code = char.charCodeAt(0);
    if (code >= KATAKANA_START && code <= KATAKANA_END) {
      return String.fromCharCode(code - KATAKANA_TO_HIRAGANA_OFFSET);
    }
    return char;
  }).join('');
}

export function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC');
}

export function normalizeReading(input: string): string {
  return toHiragana(input.trim().replace(WHITESPACE, ''));
}

export function normalizeRomaji(input: string): string {
  return stripDiacritics(toHiragana(input)).toLowerCase().trim().replace(WHITESPACE, '');
}

export function normalizeGloss(input: string): string {
  return stripDiacritics(input.normalize('NFKC')).toLowerCase().trim().replace(WHITESPACE, ' ');
}
