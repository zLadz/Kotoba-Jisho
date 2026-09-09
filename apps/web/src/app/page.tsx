import { SearchForm } from '../components/search-form';

export default function HomePage(): React.JSX.Element {
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Kotoba</h1>
        <p className="text-slate-600">
          Dicionário japonês–português. Busque por kanji, kana, romaji ou significado.
        </p>
      </header>
      <SearchForm />
    </main>
  );
}
