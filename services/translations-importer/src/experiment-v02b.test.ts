import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const EXPERIMENT_DIR = fileURLToPath(
  new URL('../../../data/pt-br/experiments/v0.2b/', import.meta.url),
);
const V02_DIR = fileURLToPath(new URL('../../../data/pt-br/experiments/v0.2/', import.meta.url));
const SCHEMA_FILE = fileURLToPath(
  new URL('../../../data/schemas/pt-br.schema.json', import.meta.url),
);

const SEQUENCE = 'pt-br-ai-generation-v0.2b';

async function loadJson<T>(fileName: string): Promise<T> {
  const content = await readFile(`${EXPERIMENT_DIR}${fileName}`, 'utf8');
  return JSON.parse(content) as T;
}

interface InputSense {
  sense: number;
  partOfSpeech: string[];
  glosses: Array<{ language: string; text: string }>;
}

interface InputEntry {
  jmdictSeq: number;
  kanji: string[];
  readings: string[];
  senses: InputSense[];
}

interface ExperimentInput {
  meta: { experiment: string; entries: number; senseBlocks: number };
  entries: InputEntry[];
}

type CandidateType = 'equivalent' | 'literal' | 'figurative' | 'explanation';

interface Candidate {
  jmdictSeq: number;
  sense: number;
  kanji: string[];
  readings: string[];
  text: string;
  type: CandidateType;
  priority: number;
  confidence: number;
  reason: string;
}

interface ValidationResult {
  jmdictSeq: number;
  sense: number;
  candidate: string;
  type: CandidateType;
  priority: number;
  status: 'machine_translated' | 'approved';
  decision: 'approved' | 'review' | 'rejected';
  confidence: number;
  reason: string;
  suggestedTranslation?: string;
  category?: string;
}

interface ApprovedRow {
  jmdictSeq: number;
  kanji: string[];
  readings: string[];
  sense: number;
  text: string;
  status: 'approved';
  source: string;
  sourceVersion: string;
  confidence: number;
}

const ALLOWED_TYPES: CandidateType[] = ['equivalent', 'literal', 'figurative', 'explanation'];
const APPROVED_KEYS = new Set([
  'jmdictSeq',
  'kanji',
  'readings',
  'sense',
  'text',
  'status',
  'source',
  'sourceVersion',
  'confidence',
]);

describe('experimento v0.2b — A/B controlado refinado sobre as 100 entradas do v0.2', () => {
  let input: ExperimentInput;
  let v02Input: ExperimentInput;
  let candidates: {
    meta: { experiment: string; candidates: number };
    candidates: Candidate[];
  };
  let validatorInput: { items: Array<{ jmdictSeq: number; sense: number; candidates: unknown[] }> };
  let results: {
    meta: {
      candidates: number;
      summary: { approved: number; review: number; rejected: number };
      highConfidenceFailures: Array<{
        jmdictSeq: number;
        sense: number;
        candidate: string;
        generatorConfidence: number;
        decision: string;
      }>;
      problemCategories: Record<string, number>;
    };
    results: ValidationResult[];
  };
  let approved: {
    $schema?: string;
    meta: { count: number; excluded: { review: number; rejected: number } };
    translations: ApprovedRow[];
  };
  let review: {
    meta: { count: number; role: string };
    items: Array<{ jmdictSeq: number; sense: number; suggestedTranslation: string }>;
  };
  let rejected: { meta: { count: number; role: string }; items: unknown[] };

  beforeAll(async () => {
    input = await loadJson('generator-input.json');
    candidates = await loadJson('generated-candidates.json');
    validatorInput = await loadJson('validator-input.json');
    results = await loadJson('validation-results.json');
    approved = await loadJson('approved.json');
    review = await loadJson('review.json');
    rejected = await loadJson('rejected.json');
    v02Input = JSON.parse(
      await readFile(`${V02_DIR}generator-input.json`, 'utf8'),
    ) as ExperimentInput;
  });

  const inputKeys = () =>
    new Set(input.entries.flatMap((e) => e.senses.map((s) => `${e.jmdictSeq}:${s.sense}`)));

  const approvedKeys = () => new Set(approved.translations.map((r) => `${r.jmdictSeq}:${r.sense}`));

  const resultFor = (seq: number, sense: number, priority = 1) =>
    results.results.find(
      (r) => r.jmdictSeq === seq && r.sense === sense && r.priority === priority,
    );

  // ── Estrutura ─────────────────────────────────────────────────────────────

  it('1. reusa exatamente as 100 entradas / 530 senses do v0.2', () => {
    expect(candidates.meta.experiment).toBe(SEQUENCE);
    expect(input.entries).toHaveLength(100);
    expect(input.meta.entries).toBe(100);
    expect(input.meta.senseBlocks).toBe(530);
    const v02Seq = new Set(v02Input.entries.map((e) => e.jmdictSeq));
    expect(new Set(input.entries.map((e) => e.jmdictSeq))).toEqual(v02Seq);
    const v02Keys = new Set(
      v02Input.entries.flatMap((e) => e.senses.map((s) => `${e.jmdictSeq}:${s.sense}`)),
    );
    expect(inputKeys()).toEqual(v02Keys);
  });

  it('2. jmdictSeq são inteiros positivos e únicos', () => {
    const seqs = input.entries.map((e) => e.jmdictSeq);
    expect(seqs.length).toBe(new Set(seqs).size);
    for (const seq of seqs) {
      expect(Number.isInteger(seq)).toBe(true);
      expect(seq).toBeGreaterThan(0);
    }
  });

  it('3. sentidos são 1-baseados, contínuos e únicos por entrada', () => {
    for (const entry of input.entries) {
      const positions = entry.senses.map((s) => s.sense).sort((a, b) => a - b);
      expect(positions).toEqual(
        [...Array(positions[positions.length - 1]).keys()].map((i) => i + 1),
      );
      expect(new Set(positions).size).toBe(positions.length);
    }
  });

  it('4. cada sentido tem glossas não vazias em inglês', () => {
    for (const entry of input.entries) {
      for (const sense of entry.senses) {
        expect(sense.glosses.length).toBeGreaterThan(0);
        for (const gloss of sense.glosses) {
          expect(gloss.language).toBe('en');
          expect(gloss.text.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  // ── Gerador ───────────────────────────────────────────────────────────────

  it('5. candidatos cobrem todos os senses do input (0 a 3 por sense)', () => {
    const covered = new Set(candidates.candidates.map((c) => `${c.jmdictSeq}:${c.sense}`));
    expect(covered).toEqual(inputKeys());
    expect(candidates.meta.candidates).toBe(candidates.candidates.length);
    const perSense = new Map<string, number>();
    for (const c of candidates.candidates) {
      const key = `${c.jmdictSeq}:${c.sense}`;
      perSense.set(key, (perSense.get(key) ?? 0) + 1);
    }
    for (const count of perSense.values()) {
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it('6. não há candidato sem sense válido nem duplicado no mesmo sense', () => {
    const seen = new Set<string>();
    for (const c of candidates.candidates) {
      expect(inputKeys().has(`${c.jmdictSeq}:${c.sense}`)).toBe(true);
      const key = `${c.jmdictSeq}:${c.sense}:${c.text}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('7. candidatos têm texto, tipo, prioridade (1–4) e confidence válidos', () => {
    for (const c of candidates.candidates) {
      expect(c.text.trim().length).toBeGreaterThan(0);
      expect(ALLOWED_TYPES).toContain(c.type);
      expect(Number.isInteger(c.priority)).toBe(true);
      expect(c.priority).toBeGreaterThanOrEqual(1);
      expect(c.priority).toBeLessThanOrEqual(4);
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
      expect(c.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('8. dentro de cada sense as prioridades são 1..n, sem repetição', () => {
    const bySense = new Map<string, number[]>();
    for (const c of candidates.candidates) {
      const key = `${c.jmdictSeq}:${c.sense}`;
      bySense.set(key, [...(bySense.get(key) ?? []), c.priority]);
    }
    for (const priorities of bySense.values()) {
      expect([...priorities].sort((a, b) => a - b)).toEqual(
        [...Array(priorities.length).keys()].map((i) => i + 1),
      );
    }
  });

  it('9. kanji/readings dos candidatos espelham o input', () => {
    const bySeq = new Map(input.entries.map((e) => [e.jmdictSeq, e]));
    for (const c of candidates.candidates) {
      const entry = bySeq.get(c.jmdictSeq)!;
      expect(c.kanji).toEqual(entry.kanji);
      expect(c.readings).toEqual(entry.readings);
    }
  });

  it('10. o gerador refinado não inflou candidatos (≤ v0.2)', async () => {
    const v02 = JSON.parse(await readFile(`${V02_DIR}generated-candidates.json`, 'utf8')) as {
      candidates: Candidate[];
    };
    expect(candidates.candidates.length).toBeLessThanOrEqual(v02.candidates.length);
  });

  // ── Validador ─────────────────────────────────────────────────────────────

  it('11. validator-input cobre os 530 senses com os mesmos candidatos', () => {
    expect(validatorInput.items).toHaveLength(530);
    const vi = new Map(
      validatorInput.items.map((i) => [`${i.jmdictSeq}:${i.sense}`, i.candidates.length]),
    );
    const gen = new Map<string, number>();
    for (const c of candidates.candidates) {
      const key = `${c.jmdictSeq}:${c.sense}`;
      gen.set(key, (gen.get(key) ?? 0) + 1);
    }
    expect(vi).toEqual(gen);
  });

  it('12. resultados cobrem todos os candidatos, sem duplicar', () => {
    expect(results.results.length).toBe(candidates.candidates.length);
    expect(results.meta.candidates).toBe(candidates.candidates.length);
    const keys = new Set(
      results.results.map((r) => `${r.jmdictSeq}:${r.sense}:${r.priority}:${r.candidate}`),
    );
    expect(keys.size).toBe(results.results.length);
  });

  it('13. decisões e status são válidos e coerentes', () => {
    for (const result of results.results) {
      expect(['approved', 'review', 'rejected']).toContain(result.decision);
      expect(['machine_translated', 'approved']).toContain(result.status);
      if (result.decision === 'approved') {
        expect(result.status).toBe('approved');
      } else {
        expect(result.status).toBe('machine_translated');
      }
      if (result.decision === 'review') {
        expect(result.suggestedTranslation?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('14. no máximo um approved por (jmdictSeq, sense)', () => {
    const approvedPerSense = new Map<string, number>();
    for (const r of results.results) {
      if (r.decision !== 'approved') continue;
      const key = `${r.jmdictSeq}:${r.sense}`;
      approvedPerSense.set(key, (approvedPerSense.get(key) ?? 0) + 1);
    }
    for (const count of approvedPerSense.values()) {
      expect(count).toBe(1);
    }
  });

  it('15. summary e approved.json batem com as decisões', () => {
    const a = results.results.filter((r) => r.decision === 'approved');
    const rv = results.results.filter((r) => r.decision === 'review');
    const rj = results.results.filter((r) => r.decision === 'rejected');
    expect(results.meta.summary).toEqual({
      approved: a.length,
      review: rv.length,
      rejected: rj.length,
    });
    expect(approved.translations).toHaveLength(a.length);
    expect(approved.meta.count).toBe(a.length);
    expect(approved.meta.excluded).toEqual({ review: rv.length, rejected: rj.length });
  });

  it('16. approved.json contém exatamente as decisões approved, com metadados', () => {
    const approvedDecisions = results.results
      .filter((r) => r.decision === 'approved')
      .map((r) => `${r.jmdictSeq}:${r.sense}`);
    expect(approvedKeys()).toEqual(new Set(approvedDecisions));
    expect(approved.$schema ?? '').toBeTruthy();
    for (const row of approved.translations) {
      expect(row.status).toBe('approved');
      expect(row.source).toBe('kotoba-ai-experiment');
      expect(row.sourceVersion).toBe('v0.2b');
      expect(row.text.trim().length).toBeGreaterThan(0);
      expect(row.confidence).toBeGreaterThanOrEqual(0);
      expect(row.confidence).toBeLessThanOrEqual(1);
      expect(Object.keys(row).every((k) => APPROVED_KEYS.has(k))).toBe(true);
    }
  });

  it('17. sem (jmdictSeq, sense) duplicado no dataset aprovado', () => {
    expect(approvedKeys().size).toBe(approved.translations.length);
  });

  it('18. rejected ∉ approved e todo review tem suggestedTranslation', () => {
    const approvedTexts = new Set(
      approved.translations.map((r) => `${r.jmdictSeq}:${r.sense}:${r.text}`),
    );
    const rejectedCandidates = results.results.filter((r) => r.decision === 'rejected');
    for (const r of rejectedCandidates) {
      expect(approvedTexts.has(`${r.jmdictSeq}:${r.sense}:${r.candidate}`)).toBe(false);
    }
    expect(review.meta.role).toBe('review');
    expect(rejected.meta.role).toBe('rejected');
    for (const item of review.items) {
      expect(item.suggestedTranslation.trim().length).toBeGreaterThan(0);
    }
  });

  it('19. não há correção silenciosa (candidato preservado na decisão)', () => {
    for (const r of results.results) {
      const gen = candidates.candidates.find(
        (c) =>
          c.jmdictSeq === r.jmdictSeq &&
          c.sense === r.sense &&
          c.priority === r.priority &&
          c.text === r.candidate,
      );
      expect(gen).toBeTruthy();
      if (r.decision !== 'approved' && r.suggestedTranslation) {
        expect(r.suggestedTranslation).not.toBe(r.candidate);
      }
    }
  });

  it('20. high-confidence failures: ≥0.90 do gerador e não aprovados', () => {
    const failures = results.meta.highConfidenceFailures;
    for (const failure of failures) {
      expect(failure.generatorConfidence).toBeGreaterThanOrEqual(0.9);
      expect(failure.decision).not.toBe('approved');
      const gen = candidates.candidates.find(
        (c) =>
          c.jmdictSeq === failure.jmdictSeq &&
          c.sense === failure.sense &&
          c.text === failure.candidate,
      );
      expect(gen?.confidence).toBe(failure.generatorConfidence);
    }
    expect(failures.map((f) => `${f.jmdictSeq}:${f.sense}`)).toEqual(['1259290:3']);
  });

  it('21. review.json e rejected.json espelham as decisões e metadados', () => {
    const rv = results.results.filter((r) => r.decision === 'review');
    const rj = results.results.filter((r) => r.decision === 'rejected');
    expect(review.meta.count).toBe(rv.length);
    expect(rejected.meta.count).toBe(rj.length);
    expect(review.items).toHaveLength(rv.length);
    expect(rejected.items).toHaveLength(rj.length);
  });

  it('22. problemCategories coincide com os não aprovados e cobre as categorias', () => {
    const cats = results.meta.problemCategories;
    const total = Object.values(cats).reduce((a, b) => a + b, 0);
    expect(total).toBe(results.meta.summary.review + results.meta.summary.rejected);
    for (const value of Object.values(cats)) {
      expect(value).toBeGreaterThan(0);
    }
  });

  // ── Sense collision ───────────────────────────────────────────────────────

  it('23. o único não aprovado por colisão é o probe 見る:3 → ver', () => {
    const collisions = results.results.filter(
      (r) => r.decision !== 'approved' && /colis|colid/.test(r.reason),
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0]!.jmdictSeq).toBe(1259290);
    expect(collisions[0]!.sense).toBe(3);
    expect(collisions[0]!.candidate).toBe('ver');
    expect(collisions[0]!.decision).toBe('rejected');
  });

  it('24. as colisões reais do v0.2 foram resolvidas para approved', () => {
    const fixed: Array<[number, number, string]> = [
      [1236070, 2, 'robusto'],
      [1251320, 3, 'economia de recursos'],
      [1420470, 1, 'saber'],
      [1433030, 1, 'passar'],
      [1533580, 3, 'divertido'],
      [1556730, 2, 'insensível'],
      [1580640, 1, 'pessoa'],
      [1591110, 1, 'ouvir'],
      [1604890, 1, 'olho'],
    ];
    for (const [seq, sense, text] of fixed) {
      const row = approved.translations.find((r) => r.jmdictSeq === seq && r.sense === sense);
      expect(row?.text).toBe(text);
    }
  });

  it('25. reutilizar a mesma tradução em dois senses NÃO é erro automático', () => {
    const falarRows = approved.translations.filter(
      (r) => r.jmdictSeq === 1562350 && r.text === 'falar',
    );
    expect(falarRows.map((r) => r.sense).sort((a, b) => a - b)).toEqual([1, 3]);
    expect(resultFor(1562350, 3)?.decision).toBe('approved');
    expect(resultFor(1562350, 3)?.candidate).toBe('falar');
  });

  // ── Regressão crítica ─────────────────────────────────────────────────────

  it('26. 見る:1 → ver aprovado; 見る:3 → ver rejeitado; candidato cuidar aprovado', () => {
    const miru1 = approved.translations.filter((r) => r.jmdictSeq === 1259290 && r.sense === 1);
    expect(miru1).toHaveLength(1);
    expect(miru1[0]!.text).toBe('ver');

    const miru3Primary = resultFor(1259290, 3, 1);
    expect(miru3Primary?.decision).toBe('approved');
    expect(miru3Primary?.candidate).toBe('cuidar');
    const miru3Collision = resultFor(1259290, 3, 2);
    expect(miru3Collision?.decision).toBe('rejected');
    expect(miru3Collision?.candidate).toBe('ver');
  });

  it('27. 食べる jamais é traduzido como "ver"', () => {
    const taberu = candidates.candidates.filter((c) => c.jmdictSeq === 1358280);
    expect(taberu.length).toBeGreaterThan(0);
    for (const candidate of taberu) {
      expect(candidate.text).not.toBe('ver');
    }
    for (const row of approved.translations.filter((r) => r.jmdictSeq === 1358280)) {
      expect(row.text).not.toBe('ver');
    }
  });

  it('28. cobertura: todos os 530 senses têm uma tradução aprovada', () => {
    expect(approvedKeys()).toEqual(inputKeys());
    expect(approved.translations).toHaveLength(530);
  });

  it('29. schema referenciado por approved.json existe', async () => {
    const schema = JSON.parse(await readFile(SCHEMA_FILE, 'utf8')) as { $schema?: string };
    expect(schema.$schema).toContain('2020-12');
    const approvedSchema = JSON.parse(await readFile(`${EXPERIMENT_DIR}approved.json`, 'utf8')) as {
      $schema: string;
    };
    expect(approvedSchema.$schema).toBe('../../../schemas/pt-br.schema.json');
  });
});
