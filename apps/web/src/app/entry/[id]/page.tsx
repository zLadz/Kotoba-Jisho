import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DEFAULT_LANGUAGE } from '../../../lib/language';
import { getEntry } from '../../../lib/api';
import { localizePos } from '../../../lib/pos';
import { presentEntry } from '../../../lib/entry-presentation';
import { KanjiChars, TranslationList } from '../../../components/entry';

export const dynamic = 'force-dynamic';

async function loadEntry(id: string, lang?: string) {
  try {
    return await getEntry(id, lang);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const entry = await loadEntry(id);
  const title = entry?.kanji[0]?.text ?? entry?.readings[0]?.text ?? 'Kotoba';
  return { title };
}

export default async function EntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const { lang } = await searchParams;
  const language = lang ?? DEFAULT_LANGUAGE;
  const entry = await loadEntry(id, language);
  if (entry === null) {
    notFound();
  }

  const kanji = entry.kanji[0];
  const primaryReading = entry.readings[0];
  const display = kanji?.text ?? primaryReading?.text ?? '';
  const presented = presentEntry(entry, language);

  return (
    <main className="flex flex-col gap-6">
      <nav>
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Voltar à busca
        </Link>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-4xl font-bold">{display}</h1>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-slate-700">
          <span className="text-2xl">{kanji?.text ?? ''}</span>
          <span>{primaryReading?.text ?? ''}</span>
          <span className="text-slate-400">
            {entry.readings
              .map((reading) => reading.romaji)
              .filter((value) => value.length > 0)
              .join(', ') ||
              primaryReading?.romaji ||
              ''}
          </span>
        </div>
      </header>

      {entry.kanji.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Kanji
          </h2>
          <KanjiChars forms={entry.kanji.map((form) => form.text)} />
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Traduções ({language})
        </h2>
        {presented.message !== null ? (
          <p className="text-sm text-slate-400">{presented.message}</p>
        ) : (
          <ol className="flex flex-col gap-5">
            {presented.senses.map((sense) => (
              <li key={sense.number} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Sentido {sense.number}</h3>
                {sense.partOfSpeech.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {sense.partOfSpeech.map((pos) => (
                      <span
                        key={pos}
                        className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-700"
                      >
                        {localizePos(pos)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {sense.fields.length > 0 || sense.misc.length > 0 ? (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-400">
                    {sense.misc.map((item) => (
                      <span key={`misc-${item}`}>{item}</span>
                    ))}
                    {sense.fields.map((item) => (
                      <span key={`field-${item}`}>{item}</span>
                    ))}
                  </div>
                ) : null}
                {sense.translations.length > 0 ? (
                  <TranslationList items={sense.translations} />
                ) : sense.glosses.length > 0 ? (
                  <TranslationList items={sense.glosses} />
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
