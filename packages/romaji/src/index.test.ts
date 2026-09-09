import { describe, expect, it } from 'vitest';
import { hiraganaToRomaji, katakanaToRomaji, kanaToRomaji } from './index.js';

describe('kanaToRomaji', () => {
  it('converte hiragana básico', () => {
    expect(hiraganaToRomaji('たべる')).toBe('taberu');
    expect(hiraganaToRomaji('にほん')).toBe('nihon');
    expect(hiraganaToRomaji('はしる')).toBe('hashiru');
    expect(hiraganaToRomaji('みる')).toBe('miru');
  });

  it('combina digrafos com small ya/yu/yo', () => {
    expect(hiraganaToRomaji('きょう')).toBe('kyou');
    expect(hiraganaToRomaji('しゃ')).toBe('sha');
    expect(hiraganaToRomaji('ちゅ')).toBe('chu');
    expect(hiraganaToRomaji('じょ')).toBe('jo');
  });

  it('dobra consoante com sokuon (っ)', () => {
    expect(hiraganaToRomaji('がっこう')).toBe('gakkou');
    expect(hiraganaToRomaji('きっぷ')).toBe('kippu');
    expect(hiraganaToRomaji('いっしょ')).toBe('issho');
  });

  it('trata ん (n/m com apóstrofo antes de vogal)', () => {
    expect(hiraganaToRomaji('げんき')).toBe('genki');
    expect(hiraganaToRomaji('しんぶん')).toBe('shimbun');
    expect(hiraganaToRomaji('かんぱい')).toBe('kampai');
    expect(hiraganaToRomaji('たんい')).toBe("tan'i");
    expect(hiraganaToRomaji('しんかんせん')).toBe('shinkansen');
  });

  it('converte katakana e vogal longa (ー)', () => {
    expect(katakanaToRomaji('コーヒー')).toBe('koohii');
    expect(katakanaToRomaji('ラーメン')).toBe('raamen');
    expect(katakanaToRomaji('カップ')).toBe('kappu');
    expect(katakanaToRomaji('テレビ')).toBe('terebi');
    expect(katakanaToRomaji('マッチ')).toBe('matchi');
  });

  it('trata entrada vazia e caracteres desconhecidos', () => {
    expect(kanaToRomaji('')).toBe('');
    expect(kanaToRomaji('a')).toBe('');
  });

  it('aplica n e apostrofo antes de vogal e y com ん', () => {
    expect(hiraganaToRomaji('しんや')).toBe("shin'ya");
    expect(hiraganaToRomaji('しんにゅう')).toBe('shinnyuu');
    expect(hiraganaToRomaji('しんねん')).toBe('shinnen');
  });

  it('documenta comportamento atual para particulas e empréstimos', () => {
    expect(hiraganaToRomaji('こんにちは')).toBe('konnichiha');
    expect(katakanaToRomaji('ティー')).toBe('teii');
    expect(katakanaToRomaji('ファン')).toBe('fuan');
    expect(katakanaToRomaji('シェフ')).toBe('shiefu');
    expect(katakanaToRomaji('ヴァン')).toBe('an');
  });
});
