const KANJI_RANGES: Array<[number, number]> = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
];

export function extractKanjiChars(forms: string[]): string[] {
  const seen = new Set<string>();
  for (const form of forms) {
    for (const char of Array.from(form)) {
      const code = char.charCodeAt(0);
      if (KANJI_RANGES.some(([start, end]) => code >= start && code <= end)) {
        seen.add(char);
      }
    }
  }
  return Array.from(seen);
}
