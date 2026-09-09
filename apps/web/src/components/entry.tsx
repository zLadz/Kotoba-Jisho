import { extractKanjiChars } from '../lib/kanji';

export function TranslationList({ items }: { items: Array<{ text: string }> }): React.JSX.Element {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {items.map((item, index) => (
        <li key={`${item.text}-${index}`}>{item.text}</li>
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
