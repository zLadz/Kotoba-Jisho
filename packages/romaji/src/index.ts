const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KATAKANA_TO_HIRAGANA_OFFSET = 0x60;

const BASE: Record<string, string> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  ゐ: 'i',
  ゑ: 'e',
  を: 'o',
  ん: 'n',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
};

const SMALL: Record<string, string> = {
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  ゎ: 'wa',
};

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

const PALATAL_SYLLABLES = new Set(['shi', 'chi', 'ji']);

function toHiragana(input: string): string {
  return Array.from(input, (char) => {
    const code = char.charCodeAt(0);
    if (code >= KATAKANA_START && code <= KATAKANA_END) {
      return String.fromCharCode(code - KATAKANA_TO_HIRAGANA_OFFSET);
    }
    return char;
  }).join('');
}

function combine(syllable: string, suffix: string): string {
  if (syllable.length === 0) {
    return suffix;
  }
  if (PALATAL_SYLLABLES.has(syllable)) {
    return syllable.slice(0, -1) + suffix.slice(1);
  }
  return syllable.slice(0, -1) + suffix;
}

function onsetOf(char: string): string {
  const small = SMALL[char];
  if (small !== undefined) {
    return small[0] ?? '';
  }
  return BASE[char]?.[0] ?? '';
}

function extendWithSokuon(syllable: string): string {
  if (syllable.length === 0) {
    return syllable;
  }
  if (syllable.startsWith('ch')) {
    return `t${syllable}`;
  }
  return (syllable[0] ?? '') + syllable;
}

function renderN(onset: string): string {
  if (onset === 'b' || onset === 'p' || onset === 'm') {
    return 'm';
  }
  if (onset !== '' && (VOWELS.has(onset) || onset === 'y')) {
    return "n'";
  }
  return 'n';
}

export function hiraganaToRomaji(input: string): string {
  return kanaToRomaji(input);
}

export function katakanaToRomaji(input: string): string {
  return kanaToRomaji(input);
}

export function kanaToRomaji(input: string): string {
  const chars = Array.from(toHiragana(input));
  let output = '';
  let sokuon = false;

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (char === undefined) {
      continue;
    }
    const next = chars[index + 1];

    if (char === 'ー') {
      if (output.length > 0 && VOWELS.has(output[output.length - 1] ?? '')) {
        output += output[output.length - 1];
      }
      continue;
    }

    if (char === 'っ') {
      sokuon = true;
      continue;
    }

    if (char === 'ん') {
      const onset = next !== undefined ? onsetOf(next) : '';
      output += renderN(onset);
      continue;
    }

    if (SMALL[char] !== undefined) {
      output += SMALL[char];
      continue;
    }

    let syllable = BASE[char] ?? '';
    const nextSmall = next !== undefined ? SMALL[next] : undefined;

    if (nextSmall === 'ya' || nextSmall === 'yu' || nextSmall === 'yo') {
      syllable = combine(syllable, nextSmall);
      index += 1;
    } else if (nextSmall !== undefined) {
      output += syllable;
      syllable = nextSmall;
      index += 1;
    }

    if (sokuon) {
      syllable = extendWithSokuon(syllable);
    }
    sokuon = false;

    output += syllable;
  }

  return output;
}
