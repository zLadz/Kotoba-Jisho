import type { DictionaryEntry, Gloss, KotobaTranslation } from '@kotoba/types';
import { isKotobaOwned, jmdictLanguageCodes } from '@kotoba/types';

export function resolveKotobaTranslations(
  sense: DictionaryEntry['senses'][number],
  lang: string,
): KotobaTranslation[] {
  return sense.translations.filter((t) => t.language === lang);
}

export function resolveSenseSourceGlosses(
  sense: DictionaryEntry['senses'][number],
  lang: string,
): Gloss[] {
  const jmdictLangs = jmdictLanguageCodes(lang);
  return sense.glosses.filter((g) => jmdictLangs.includes(g.language));
}

export function resolveSenseTranslations(
  sense: DictionaryEntry['senses'][number],
  lang: string,
): KotobaTranslation[] {
  const kotobaForLang = resolveKotobaTranslations(sense, lang);
  if (isKotobaOwned(lang) || kotobaForLang.length > 0) {
    return kotobaForLang;
  }
  return resolveSenseSourceGlosses(sense, lang).map((g) => ({
    language: lang,
    text: g.text,
    source: 'jmdict' as const,
    sourceVersion: '',
  }));
}
