import type { SearchResult } from '@kotoba/types';
import type { EntryResponse } from '@kotoba/validation';

export const apiBaseUrl = (): string => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function searchWords(
  query: string,
  limit = 20,
  lang?: string,
): Promise<SearchResult[]> {
  const langParam =
    lang !== undefined && lang.length > 0 ? `&lang=${encodeURIComponent(lang)}` : '';
  const response = await fetch(
    `${apiBaseUrl()}/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}${langParam}`,
  );
  if (!response.ok) {
    throw new Error(`Falha na busca (${response.status})`);
  }
  const body = (await response.json()) as { query: string; results: SearchResult[] };
  return body.results;
}

export async function getEntry(id: string, lang?: string): Promise<EntryResponse | null> {
  const langParam =
    lang !== undefined && lang.length > 0 ? `?lang=${encodeURIComponent(lang)}` : '';
  const response = await fetch(
    `${apiBaseUrl()}/api/v1/entries/${encodeURIComponent(id)}${langParam}`,
    {
      cache: 'no-store',
    },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Falha ao obter entrada (${response.status})`);
  }
  return (await response.json()) as EntryResponse;
}
