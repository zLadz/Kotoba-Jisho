import { buildApp } from '../app.js';

interface QueryPlan {
  label: string;
  query: string;
}

const QUERIES: QueryPlan[] = [
  { label: 'kana exato (たべる)', query: 'たべる' },
  { label: 'katakana variação/tier token (タベル)', query: 'タベル' },
  { label: 'half-width tier token (ﾀﾍﾞﾙ)', query: 'ﾀﾍﾞﾙ' },
  { label: 'romaji (taberu)', query: 'taberu' },
  { label: 'kanji prefixo (食べ)', query: '食べ' },
  { label: 'gloss pt (comer)', query: 'comer' },
  { label: 'gloss token sem acento (comerao)', query: 'comerao' },
  { label: 'gloss fuzzy (comere)', query: 'comere' },
  { label: 'kana fuzzy (たべるん)', query: 'たべるん' },
  { label: 'romaji prefixo (tabe)', query: 'tabe' },
];

const ITERATIONS = 5;

function percentiles(values: number[]): { p50: number; p95: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const p50Index = Math.floor(sorted.length / 2);
  const p50 =
    sorted.length % 2 === 0 ? (sorted[p50Index - 1]! + sorted[p50Index]!) / 2 : sorted[p50Index]!;
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return { p50, p95: sorted[p95Index]!, max: sorted[sorted.length - 1]! };
}

const app = buildApp({ loggerLevel: 'silent' });
await app.ready();

let totalRequests = 0;
const startAll = performance.now();

for (const plan of QUERIES) {
  const timings: number[] = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const t0 = performance.now();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(plan.query)}`,
    });
    timings.push(performance.now() - t0);
    totalRequests += 1;
    if (response.statusCode !== 200) {
      console.error(`FALHA ${plan.label}: HTTP ${response.statusCode} ${response.body}`);
      continue;
    }
    void response.json().results;
  }
  const { p50, p95, max } = percentiles(timings);
  const lastBody = await app.inject({
    method: 'GET',
    url: `/api/v1/search?q=${encodeURIComponent(plan.query)}`,
  });
  const results = (lastBody.statusCode === 200 ? lastBody.json().results : []) as unknown[];
  console.log(
    `${plan.label.padEnd(38)} p50=${p50.toFixed(1).padStart(6)}ms  p95=${p95.toFixed(1).padStart(6)}ms  max=${max.toFixed(1).padStart(6)}ms  resultados=${String(results.length).padStart(8)}`,
  );
}

const elapsedAll = performance.now() - startAll;
console.log(
  `\n${QUERIES.length * ITERATIONS} requisições (${QUERIES.length} queries x ${ITERATIONS}) em ${elapsedAll.toFixed(0)}ms — ${(totalRequests / (elapsedAll / 1000)).toFixed(1)} req/s`,
);

await app.close();
process.exit(0);
