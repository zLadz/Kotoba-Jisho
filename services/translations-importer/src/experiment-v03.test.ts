import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const EXPERIMENT_DIR = fileURLToPath(
  new URL('../../../data/pt-br/experiments/v0.3/', import.meta.url),
);
const PREV_DIRS = ['v0.1', 'v0.2', 'v0.2b'].map((v) =>
  fileURLToPath(new URL(`../../../data/pt-br/experiments/${v}/`, import.meta.url)),
);
const SCHEMA_FILE = fileURLToPath(
  new URL('../../../data/schemas/pt-br.schema.json', import.meta.url),
);

const SEQUENCE = 'pt-br-ai-generation-v0.3';

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

interface Probe {
  id: string;
  jmdictSeq: number;
  sense: number;
  candidate: { text: string };
  expected: string;
  decision: 'approved' | 'review' | 'rejected';
  category: string | null;
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

describe('experimento v0.3 — generalização dos refinamentos do v0.2b em 500 novas entradas', () => {
  let input: ExperimentInput;
  let candidates: { meta: { experiment: string; candidates: number }; candidates: Candidate[] };
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
        category?: string;
      }>;
      problemCategories: Record<string, number>;
    };
    results: ValidationResult[];
  };
  let approved: {
    $schema?: string;
    meta: { count: number; excluded: { review?: number; revise?: number; rejected: number } };
    translations: ApprovedRow[];
  };
  let review: {
    meta: { count: number; role: string };
    items: Array<{ suggestedTranslation: string }>;
  };
  let rejected: { meta: { count: number; role: string }; items: unknown[] };
  let probes: { meta: { count: number }; probes: Probe[] };
  let prevSeq: Set<number>;

  beforeAll(async () => {
    input = await loadJson('generator-input.json');
    candidates = await loadJson('generated-candidates.json');
    validatorInput = await loadJson('validator-input.json');
    results = await loadJson('validation-results.json');
    approved = await loadJson('approved.json');
    review = await loadJson('review.json');
    rejected = await loadJson('rejected.json');
    probes = await loadJson('probes.json');
    prevSeq = new Set<number>();
    for (const dir of PREV_DIRS) {
      const prev = JSON.parse(
        await readFile(`${dir}generator-input.json`, 'utf8'),
      ) as ExperimentInput;
      for (const e of prev.entries) prevSeq.add(e.jmdictSeq);
    }
  });

  const inputKeys = () =>
    new Set(input.entries.flatMap((e) => e.senses.map((s) => `${e.jmdictSeq}:${s.sense}`)));

  const approvedKeys = () => new Set(approved.translations.map((r) => `${r.jmdictSeq}:${r.sense}`));

  const resultFor = (seq: number, sense: number, priority = 1) =>
    results.results.find(
      (r) => r.jmdictSeq === seq && r.sense === sense && r.priority === priority,
    );

  // ── Estrutura ─────────────────────────────────────────────────────────────

  it('1. tem 500 entradas / 1721 senses e é uma sequência própria', () => {
    expect(candidates.meta.experiment).toBe(SEQUENCE);
    expect(input.meta.experiment).toBe(SEQUENCE);
    expect(input.entries).toHaveLength(500);
    expect(input.meta.entries).toBe(500);
    expect(input.meta.senseBlocks).toBe(1721);
  });

  it('2. jmdictSeq são inteiros positivos e únicos', () => {
    const seqs = input.entries.map((e) => e.jmdictSeq);
    expect(seqs.length).toBe(new Set(seqs).size);
    for (const seq of seqs) {
      expect(Number.isInteger(seq)).toBe(true);
      expect(seq).toBeGreaterThan(0);
    }
  });

  it('3. nenhuma entrada repete jmdictSeq de v0.1/v0.2/v0.2b', () => {
    for (const e of input.entries) {
      expect(prevSeq.has(e.jmdictSeq)).toBe(false);
    }
  });

  it('4. sentidos são 1-baseados, contínuos e únicos por entrada', () => {
    for (const entry of input.entries) {
      const positions = entry.senses.map((s) => s.sense).sort((a, b) => a - b);
      expect(positions).toEqual(
        [...Array(positions[positions.length - 1]).keys()].map((i) => i + 1),
      );
      expect(new Set(positions).size).toBe(positions.length);
    }
  });

  it('5. cada sentido tem glossas não vazias em inglês', () => {
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

  it('6. candidatos cobrem todos os senses do input (0 a 3 por sense)', () => {
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

  it('7. não há candidato sem sense válido nem duplicado no mesmo sense', () => {
    const seen = new Set<string>();
    for (const c of candidates.candidates) {
      expect(inputKeys().has(`${c.jmdictSeq}:${c.sense}`)).toBe(true);
      const key = `${c.jmdictSeq}:${c.sense}:${c.text}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('8. candidatos têm texto, tipo, prioridade (1–4) e confidence válidos', () => {
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

  it('9. dentro de cada sense as prioridades são 1..n, sem repetição', () => {
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

  it('10. kanji/readings dos candidatos espelham o input', () => {
    const bySeq = new Map(input.entries.map((e) => [e.jmdictSeq, e]));
    for (const c of candidates.candidates) {
      const entry = bySeq.get(c.jmdictSeq)!;
      expect(c.kanji).toEqual(entry.kanji);
      expect(c.readings).toEqual(entry.readings);
    }
  });

  // ── Validador ─────────────────────────────────────────────────────────────

  it('11. validator-input cobre os 1721 senses com os mesmos candidatos', () => {
    expect(validatorInput.items).toHaveLength(1721);
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
      expect(result.status).toBe(
        result.decision === 'approved' ? 'approved' : 'machine_translated',
      );
      if (result.decision === 'review') {
        expect(result.suggestedTranslation?.trim().length).toBeGreaterThan(0);
      }
      if (result.decision !== 'approved') {
        expect(result.category?.trim().length).toBeGreaterThan(0);
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
    expect(approved.meta.excluded.rejected).toBe(rj.length);
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
      expect(row.sourceVersion).toBe('v0.3');
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
    const approvedTriples = new Set(
      approved.translations.map((r) => `${r.jmdictSeq}:${r.sense}:${r.text}`),
    );
    for (const r of results.results.filter((x) => x.decision === 'rejected')) {
      expect(approvedTriples.has(`${r.jmdictSeq}:${r.sense}:${r.candidate}`)).toBe(false);
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
    expect(failures.length).toBeGreaterThan(0);
    for (const failure of failures) {
      expect(failure.generatorConfidence).toBeGreaterThanOrEqual(0.9);
      expect(failure.decision).not.toBe('approved');
      expect(failure.category).toBe('sense collision');
      const gen = candidates.candidates.find(
        (c) =>
          c.jmdictSeq === failure.jmdictSeq &&
          c.sense === failure.sense &&
          c.text === failure.candidate,
      );
      expect(gen?.confidence).toBe(failure.generatorConfidence);
    }
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

  // ── Sense collision / repetição lexical ───────────────────────────────────

  it('23. colisões de sense são classificadas e não aprovadas', () => {
    const collisions = results.results.filter(
      (r) => r.decision !== 'approved' && r.category === 'sense collision',
    );
    expect(collisions.length).toBe(9);
    const approvedTriples = new Set(
      approved.translations.map((r) => `${r.jmdictSeq}:${r.sense}:${r.text}`),
    );
    for (const c of collisions) {
      expect(approvedTriples.has(`${c.jmdictSeq}:${c.sense}:${c.candidate}`)).toBe(false);
    }
  });

  it('24. 参る (1302070) tem os senses arcaicos duplicados marcados como review', () => {
    const senses = [1, 9, 10, 13];
    for (const sense of senses) {
      expect(resultFor(1302070, sense)?.decision).toBe('review');
      expect(resultFor(1302070, sense)?.category).toBe('sense collision');
      expect(approvedKeys().has(`1302070:${sense}`)).toBe(false);
    }
  });

  it('25. reutilizar a mesma tradução em dois senses NÃO é erro automático', () => {
    const abrirRows = approved.translations.filter(
      (r) => r.jmdictSeq === 1202450 && r.text === 'abrir',
    );
    expect(abrirRows.map((r) => r.sense).sort((a, b) => a - b)).toEqual([1, 2]);
    for (const sense of [1, 2]) {
      expect(resultFor(1202450, sense)?.decision).toBe('approved');
    }
  });

  // ── Probes ────────────────────────────────────────────────────────────────

  it('26. probes.json tem os 6 casos controlados e não entra no dataset', () => {
    expect(probes.meta.count).toBe(6);
    expect(probes.probes).toHaveLength(6);
    const probeSeqs = probes.probes.map((p) => p.jmdictSeq);
    for (const seq of probeSeqs) {
      expect(input.entries.some((e) => e.jmdictSeq === seq)).toBe(false);
    }
  });

  it('27. probes preservam as decisões esperadas (R1/R2/R3/R5)', () => {
    const byId = new Map(probes.probes.map((p) => [p.id, p]));
    expect(byId.get('P1')!.decision).toBe('approved');
    expect(byId.get('P2')!.decision).toBe('rejected');
    expect(byId.get('P2')!.category).toBe('sense collision');
    expect(byId.get('P3')!.decision).toBe('rejected');
    expect(byId.get('P3')!.category).toBe('semantic mismatch');
    expect(byId.get('P4')!.decision).toBe('approved');
    expect(byId.get('P5')!.decision).toBe('approved');
    expect(byId.get('P6')!.decision).toBe('review');
    expect(byId.get('P6')!.category).toBe('register/connotation');
  });

  // ── Cobertura e schema ────────────────────────────────────────────────────

  it('28. cobertura: as senses sem approved são exatamente as com review primário', () => {
    const missing = new Set([...inputKeys()].filter((k) => !approvedKeys().has(k)));
    const reviewPrimary = new Set(
      results.results
        .filter((r) => r.decision === 'review' && r.priority === 1)
        .map((r) => `${r.jmdictSeq}:${r.sense}`),
    );
    expect(missing).toEqual(reviewPrimary);
    expect(approved.translations).toHaveLength(1706);
    expect(approved.translations.length / input.meta.senseBlocks).toBeGreaterThan(0.95);
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
