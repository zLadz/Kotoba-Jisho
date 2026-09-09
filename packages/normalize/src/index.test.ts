import { describe, expect, it } from 'vitest';
import {
  normalizeGloss,
  normalizeReading,
  normalizeRomaji,
  stripDiacritics,
  toHiragana,
} from './index.js';

describe('toHiragana', () => {
  it('converte katakana para hiragana', () => {
    expect(toHiragana('アイウエオ')).toBe('あいうえお');
  });

  it('converte meia-largura katakana via NFKC', () => {
    expect(toHiragana('ﾀﾍﾞﾙ')).toBe('たべる');
  });

  it('mantém hiragana inalterado', () => {
    expect(toHiragana('たべる')).toBe('たべる');
  });

  it('mantém caracteres não-kana', () => {
    expect(toHiragana('ABCー123')).toBe('ABCー123');
  });
});

describe('stripDiacritics', () => {
  it('remove acentos do português', () => {
    expect(stripDiacritics('paraquedismo')).toBe('paraquedismo');
    expect(stripDiacritics('coração')).toBe('coracao');
    expect(stripDiacritics('àções')).toBe('acoes');
  });

  it('mantém ASCII e kana', () => {
    expect(stripDiacritics('食べる abc')).toBe('食べる abc');
  });
});

describe('normalizeReading', () => {
  it('normaliza leitura em katakana', () => {
    expect(normalizeReading('チャーハン')).toBe('ちゃーはん');
  });

  it('remove espaços e aplica NFKC', () => {
    expect(normalizeReading('ゲーム　セット')).toBe('げーむせっと');
  });
});

describe('normalizeRomaji', () => {
  it('converte para minúsculas', () => {
    expect(normalizeRomaji('Taberu')).toBe('taberu');
  });

  it('converte kana para hiragana', () => {
    expect(normalizeRomaji('ジャガイモ')).toBe('じゃがいも');
  });
});

describe('normalizeGloss', () => {
  it('converte gloss pt-BR para base de comparação', () => {
    expect(normalizeGloss('Comer (algo)')).toBe('comer (algo)');
    expect(normalizeGloss('Pa  Ção')).toBe('pa cao');
  });

  it('aplica NFKC em caracteres meia-largura', () => {
    expect(normalizeGloss('ｗｏｒｄ')).toBe('word');
  });
});
