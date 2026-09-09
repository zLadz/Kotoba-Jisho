import type { EntryResponse } from '@kotoba/validation';
import { isKotobaOwned } from './language';

export interface TextItem {
  language: string;
  text: string;
}

export interface SenseDisplay {
  number: number;
  partOfSpeech: string[];
  fields: string[];
  misc: string[];
  translations: TextItem[];
  glosses: TextItem[];
}

export interface EntryPresentation {
  senses: SenseDisplay[];
  message: string | null;
}

export function presentEntry(entry: EntryResponse, lang: string): EntryPresentation {
  const owned = isKotobaOwned(lang);
  const senses: SenseDisplay[] = [];
  let number = 0;

  for (const sense of entry.senses) {
    const translations = sense.translations.map((t) => ({ language: t.language, text: t.text }));
    const glosses = sense.sourceGlosses.map((g) => ({ language: g.language, text: g.text }));
    const hasTranslations = translations.length > 0;
    // Idiomas Kotoba exibem apenas a camada de tradução; idiomas JMdict exibem
    // os glosses de origem quando não há tradução Kotoba para o idioma.
    const hasContent = owned ? hasTranslations : hasTranslations || glosses.length > 0;
    if (!hasContent) {
      continue;
    }
    number += 1;
    senses.push({
      number,
      partOfSpeech: [...sense.partOfSpeech],
      fields: [...sense.fields],
      misc: [...sense.misc],
      translations,
      glosses,
    });
  }

  // A ausência é propriedade da entrada, não de cada sense (Prompt 2, §6/§7).
  const message =
    senses.length === 0
      ? owned
        ? 'Tradução em português ainda não disponível.'
        : `Tradução em ${lang} ainda não disponível.`
      : null;

  return { senses, message };
}
