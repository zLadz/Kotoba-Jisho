import type { DictionaryEntry, KotobaTranslation } from '@kotoba/types';
import { isKotobaOwned, jmdictLanguageCodes } from '@kotoba/types';

export function resolveSenseTranslations(
  sense: DictionaryEntry['senses'][number],
  lang: string,
): KotobaTranslation[] {
  if (isKotobaOwned(lang)) {
    return sense.translations.filter((t) => t.language === lang);
  }
  const kotobaForLang = sense.translations.filter((t) => t.language === lang);
  if (kotobaForLang.length > 0) {
    return kotobaForLang;
  }
  const jmdictLangs = jmdictLanguageCodes(lang);
  return sense.glosses
    .filter((g) => jmdictLangs.includes(g.language))
    .map((g) => ({
      language: lang,
      text: g.text,
      source: 'jmdict' as const,
      sourceVersion: '',
    }));
}
