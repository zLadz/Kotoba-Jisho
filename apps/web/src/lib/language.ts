// Espelha as constantes/predicados de `packages/types/src/language.ts`, que é o
// canônico consumido pela API/validação. O frontend mantém uma cópia local porque o
// Turbopack não resolve re-exports `./*.js` → `.ts` de pacotes transpilados em tempo de
// build; manter em sincronia com a fonte.
const DEFAULT_LANGUAGE = 'pt-BR';

const KOTOBA_OWNED_LANGUAGES: readonly string[] = ['pt-BR'];

function isKotobaOwned(language: string): boolean {
  return KOTOBA_OWNED_LANGUAGES.includes(language);
}

export { DEFAULT_LANGUAGE, KOTOBA_OWNED_LANGUAGES, isKotobaOwned };
