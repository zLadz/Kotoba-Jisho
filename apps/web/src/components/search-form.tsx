'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { SearchResult } from '@kotoba/types';
import { DEFAULT_LANGUAGE, isKotobaOwned } from '../lib/language';
import { searchWords } from '../lib/api';

export function SearchForm(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return;
    }
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      setResults(await searchWords(trimmed, 20, language));
    } catch (cause) {
      setResults([]);
      setError(cause instanceof Error ? cause.message : 'Erro ao buscar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex gap-2" role="search">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar uma palavra... (ex.: 食べる, たべる, taberu, comer)"
          aria-label="Pesquisar uma palavra"
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-base shadow-sm focus:border-slate-500 focus:outline-none"
        />
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          aria-label="Idioma"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="pt-BR">Português (BR)</option>
          <option value="en">English</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-6 py-2 text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {error !== null ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {results.map((result) => {
            const primary = result.readings[0] ?? '';
            const title = result.kanji[0] ?? primary;
            const translations = result.translations
              .filter((t) => (isKotobaOwned(language) ? true : t.source === 'jmdict'))
              .map((t) => t.text);
            return (
              <li key={result.id}>
                <Link
                  href={`/entry/${result.id}?lang=${encodeURIComponent(language)}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-400"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-semibold">{title}</span>
                    <span className="text-slate-600">{primary}</span>
                    <span className="text-sm text-slate-400">{result.romaji[0] ?? ''}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-slate-700">{translations.join(' · ')}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : loading ? null : searched ? (
        <p className="text-center text-slate-400">Nenhum resultado.</p>
      ) : (
        <p className="text-center text-slate-400">Digite uma palavra para pesquisar.</p>
      )}
    </div>
  );
}
