export const DEFAULT_LANGUAGE = 'pt-BR';

export const KOTOBA_OWNED_LANGUAGES = ['pt-BR'] as const;

export type KotobaOwnedLanguage = (typeof KOTOBA_OWNED_LANGUAGES)[number];

const JMDICT_LANGUAGE_CODE_MAP: Record<string, string[]> = {
  'pt-BR': ['pt', 'por'],
  en: ['en'],
  es: ['spa'],
  fr: ['fre'],
  de: ['ger'],
  nl: ['dut'],
  sv: ['swe'],
  hu: ['hun'],
  ru: ['rus'],
  sl: ['slv'],
};

export function jmdictLanguageCodes(language: string): string[] {
  return JMDICT_LANGUAGE_CODE_MAP[language] ?? [language];
}

export function isKotobaOwned(language: string): boolean {
  return (KOTOBA_OWNED_LANGUAGES as readonly string[]).includes(language);
}
