import { extractKanjiChars } from '../lib/kanji';

export function TranslationList({
  translations,
}: {
  translations: Array<{ language: string; text: string; source: string }>;
}): React.JSX.Element {
  if (translations.length === 0) {
    return <p className="text-sm text-slate-400">Nenhuma tradução para este idioma.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {translations.map((translation) => (
        <li key={`${translation.language}-${translation.text}-${translation.source}`}>
          <span className="mr-2">{translation.text}</span>
          <span className="text-xs uppercase text-slate-400">{translation.source}</span>
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
