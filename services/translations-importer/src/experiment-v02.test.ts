import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const EXPERIMENT_DIR = fileURLToPath(
  new URL('../../../data/pt-br/experiments/v0.2/', import.meta.url),
);
const SCHEMA_FILE = fileURLToPath(
  new URL('../../../data/schemas/pt-br.schema.json', import.meta.url),
);

const SEQUENCE = 'pt-br-ai-generation-v0.2';

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
  decision: 'approved' | 'revise' | 'rejected';
  confidence: number;
  reason: string;
  suggestedTranslation?: string;
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

describe('experimento v0.2 — base pt-BR gerada por IA em 100 entradas', () => {
  let input: ExperimentInput;
  let candidates: { meta: { candidates: number }; candidates: Candidate[] };
  let validatorInput: { items: Array<{ jmdictSeq: number; sense: number; candidates: unknown[] }> };
  let results: {
    meta: {
      candidates: number;
      summary: { approved: number; revise: number; rejected: number };
      highConfidenceFailures: Array<{
        jmdictSeq: number;
        sense: number;
        candidate: string;
        generatorConfidence: number;
        decision: string;
      }>;
    };
    results: ValidationResult[];
  };
  let approved: {
    $schema?: string;
    meta: { count: number; excluded: { revise: number; rejected: number } };
    translations: ApprovedRow[];
  };
  let review: {
    meta: { count: number; role: string };
    items: Array<{ suggestedTranslation: string }>;
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
  });

  const inputKeys = () =>
    new Set(input.entries.flatMap((e) => e.senses.map((s) => `${e.jmdictSeq}:${s.sense}`)));

  const candidateKeys = () =>
    new Set(candidates.candidates.map((c) => `${c.jmdictSeq}:${c.sense}`));

  const resultKeys = () =>
    new Set(results.results.map((r) => `${r.jmdictSeq}:${r.sense}:${r.priority}:${r.candidate}`));

  const approvedKeys = () => new Set(approved.translations.map((r) => `${r.jmdictSeq}:${r.sense}`));

  const resultFor = (seq: number, sense: number, priority = 1) =>
    results.results.find(
      (r) => r.jmdictSeq === seq && r.sense === sense && r.priority === priority,
    );

  it('1. contém exatamente 100 entradas reais e 530 senses', () => {
    expect(input.meta.experiment).toBe(SEQUENCE);
    expect(input.entries).toHaveLength(100);
    expect(input.meta.entries).toBe(100);
    expect(input.meta.senseBlocks).toBe(530);
    expect(inputKeys().size).toBe(530);
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

  it('5. candidatos cobrem todos os senses do input (0 a 3 por sense)', () => {
    expect(candidateKeys()).toEqual(inputKeys());
    expect(candidates.meta.candidates).toBe(candidates.candidates.length);
    const perSense = new Map<string, number>();
    for (const c of candidates.candidates) {
      const key = `${c.jmdictSeq}:${c.sense}`;
      perSense.set(key, (perSense.get(key) ?? 0) + 1);
    }
    for (const count of perSense.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it('6. candidatos têm texto, tipo, prioridade e confidence válidos', () => {
    for (const c of candidates.candidates) {
      expect(c.text.trim().length).toBeGreaterThan(0);
      expect(ALLOWED_TYPES).toContain(c.type);
      expect(Number.isInteger(c.priority)).toBe(true);
      expect(c.priority).toBeGreaterThanOrEqual(1);
      expect(c.priority).toBeLessThanOrEqual(3);
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
      expect(c.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('7. dentro de cada sense as prioridades são 1..n, sem repetição', () => {
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

  it('8. kanji/readings dos candidatos espelham o input', () => {
    const bySeq = new Map(input.entries.map((e) => [e.jmdictSeq, e]));
    for (const c of candidates.candidates) {
      const entry = bySeq.get(c.jmdictSeq)!;
      expect(c.kanji).toEqual(entry.kanji);
      expect(c.readings).toEqual(entry.readings);
    }
  });

  it('9. validator-input cobre os 530 senses com os mesmos candidatos', () => {
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

  it('10. resultados cobrem todos os candidatos, sem duplicar', () => {
    expect(results.results.length).toBe(candidates.candidates.length);
    expect(results.meta.candidates).toBe(candidates.candidates.length);
    expect(resultKeys().size).toBe(results.results.length);
  });

  it('11. decisões e status são válidos e coerentes', () => {
    for (const result of results.results) {
      expect(['approved', 'revise', 'rejected']).toContain(result.decision);
      expect(['machine_translated', 'approved']).toContain(result.status);
      if (result.decision === 'approved') {
        expect(result.status).toBe('approved');
      } else {
        expect(result.status).toBe('machine_translated');
      }
      if (result.decision === 'revise') {
        expect(result.suggestedTranslation?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('12. no máximo um approved por (jmdictSeq, sense)', () => {
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

  it('13. summary e approved.json batem com as decisões', () => {
    const approvedResults = results.results.filter((r) => r.decision === 'approved');
    const reviseResults = results.results.filter((r) => r.decision === 'revise');
    const rejectedResults = results.results.filter((r) => r.decision === 'rejected');
    expect(results.meta.summary).toEqual({
      approved: approvedResults.length,
      revise: reviseResults.length,
      rejected: rejectedResults.length,
    });
    expect(approved.translations).toHaveLength(approvedResults.length);
    expect(approved.meta.count).toBe(approvedResults.length);
    expect(approved.meta.excluded).toEqual({
      revise: reviseResults.length,
      rejected: rejectedResults.length,
    });
  });

  it('14. approved.json contém exatamente as decisões approved, com metadados', () => {
    const approvedDecisions = results.results
      .filter((r) => r.decision === 'approved')
      .map((r) => `${r.jmdictSeq}:${r.sense}`);
    expect(approvedKeys()).toEqual(new Set(approvedDecisions));
    expect(approved.$schema ?? '').toBeTruthy();
    for (const row of approved.translations) {
      expect(row.status).toBe('approved');
      expect(row.source).toBe('kotoba-ai-experiment');
      expect(row.sourceVersion).toBe('v0.2');
      expect(row.text.trim().length).toBeGreaterThan(0);
      expect(row.confidence).toBeGreaterThanOrEqual(0);
      expect(row.confidence).toBeLessThanOrEqual(1);
      expect(Object.keys(row).every((k) => APPROVED_KEYS.has(k))).toBe(true);
    }
  });

  it('15. sem (jmdictSeq, sense) duplicado no dataset aprovado', () => {
    expect(approvedKeys().size).toBe(approved.translations.length);
  });

  it('16. maioria dos candidatos aprovada', () => {
    expect(results.meta.summary.approved).toBeGreaterThan(results.results.length / 2);
  });

  it('17. 見る → ver aprovado; 食べる jamais vira "ver"', () => {
    const miru = approved.translations.filter((r) => r.jmdictSeq === 1259290 && r.sense === 1);
    expect(miru).toHaveLength(1);
    expect(miru[0]!.text).toBe('ver');

    const taberu = candidates.candidates.filter((c) => c.jmdictSeq === 1358280);
    expect(taberu.length).toBeGreaterThan(0);
    for (const candidate of taberu) {
      expect(candidate.text).not.toBe('ver');
    }
    for (const row of approved.translations.filter((r) => r.jmdictSeq === 1358280)) {
      expect(row.text).not.toBe('ver');
    }
  });

  it('18. colisões de sense são rejeitadas com substituição sugerida', () => {
    const miru3 = resultFor(1259290, 3);
    expect(miru3?.decision).toBe('rejected');
    expect(miru3?.suggestedTranslation).toContain('cuidar');
    expect(resultFor(1236070, 2)?.decision).toBe('rejected');
    expect(resultFor(1251320, 3)?.decision).toBe('rejected');
    expect(resultFor(1556730, 2)?.decision).toBe('rejected');
    expect(resultFor(1580640, 1, 2)?.decision).toBe('rejected');
  });

  it('19. há decisões revise com suggestedTranslation não vazio', () => {
    expect(results.meta.summary.revise).toBeGreaterThan(0);
    const revise = resultFor(1562350, 3);
    expect(revise?.decision).toBe('revise');
    expect(revise?.suggestedTranslation).toBe('falar (um idioma)');
  });

  it('20. high-confidence failures: ≥0.90 do gerador e não aprovados', () => {
    const failures = results.meta.highConfidenceFailures;
    expect(failures.length).toBeGreaterThan(0);
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
    expect(failures.some((f) => f.jmdictSeq === 1259290 && f.sense === 3)).toBe(true);
  });

  it('21. review.json e rejected.json espelham as decisões e metadados', () => {
    const reviseResults = results.results.filter((r) => r.decision === 'revise');
    const rejectedResults = results.results.filter((r) => r.decision === 'rejected');
    expect(review.meta.role).toBe('review');
    expect(rejected.meta.role).toBe('rejected');
    expect(review.meta.count).toBe(reviseResults.length);
    expect(rejected.meta.count).toBe(rejectedResults.length);
    expect(review.items).toHaveLength(reviseResults.length);
    expect(rejected.items).toHaveLength(rejectedResults.length);
    for (const item of review.items) {
      expect(item.suggestedTranslation.trim().length).toBeGreaterThan(0);
    }
  });

  it('22. schema referenciado por approved.json existe', async () => {
    const schema = JSON.parse(await readFile(SCHEMA_FILE, 'utf8')) as { $schema?: string };
    expect(schema.$schema).toContain('2020-12');
    const approvedSchema = JSON.parse(await readFile(`${EXPERIMENT_DIR}approved.json`, 'utf8')) as {
      $schema: string;
    };
    expect(approvedSchema.$schema).toBe('../../../schemas/pt-br.schema.json');
  });
});
