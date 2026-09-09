import { extractKanjiChars } from '../lib/kanji';

export function GlossList({
  glosses,
}: {
  glosses: Array<{ language: string; text: string }>;
}): React.JSX.Element {
  const byLanguage = glosses.reduce<Record<string, string[]>>((acc, gloss) => {
    acc[gloss.language] = [...(acc[gloss.language] ?? []), gloss.text];
    return acc;
  }, {});
  const languages = Object.keys(byLanguage).sort((left, right) => {
    if (left === 'pt' || left === 'pt-BR') {
      return -1;
    }
    if (right === 'pt' || right === 'pt-BR') {
      return 1;
    }
    return left.localeCompare(right);
  });

  return (
    <ul className="flex flex-col gap-2">
      {languages.map((language) => (
        <li key={language}>
          {byLanguage[language]?.map((text) => (
            <span key={text} className="mr-2">
              {text}
            </span>
          ))}
          <span className="text-xs uppercase text-slate-400">{language}</span>
        </li>
      ))}
    </ul>
  );
}

export function KanjiChars({ forms }: { forms: string[] }): React.JSX.Element | null {
  const chars = extractKanjiChars(forms);
  if (chars.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {chars.map((char) => (
        <span key={char} className="rounded bg-slate-100 px-3 py-1 text-xl">
          {char}
        </span>
      ))}
    </div>
  );
}
