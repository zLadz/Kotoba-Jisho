import type { JmdictEntry } from './types.js';

export interface EntryValidation {
  valid: boolean;
  warnings: string[];
}

export function validateEntry(entry: JmdictEntry): EntryValidation {
  const warnings: string[] = [];

  if (!Number.isInteger(entry.sequence) || entry.sequence <= 0) {
    warnings.push('ent_seq deve ser um número inteiro positivo');
  }
  if (entry.readings.length === 0) {
    warnings.push('entrada sem r_ele (leitura é obrigatória)');
  }
  if (entry.senses.length === 0) {
    warnings.push('entrada sem sense (acepção é obrigatória)');
  }
  entry.senses.forEach((sense, senseIndex) => {
    sense.glosses.forEach((gloss, glossIndex) => {
      if (gloss.text.trim() === '') {
        warnings.push(`gloss sem texto (sense ${senseIndex + 1}, gloss ${glossIndex + 1})`);
      }
    });
  });

  const hasCriticalIssue =
    !Number.isInteger(entry.sequence) ||
    entry.sequence <= 0 ||
    entry.readings.length === 0 ||
    entry.senses.length === 0;

  return { valid: !hasCriticalIssue, warnings };
}
