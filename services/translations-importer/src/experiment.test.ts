import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const EXPERIMENT_DIR = fileURLToPath(
  new URL('../../../data/pt-br/experiments/v0.1/', import.meta.url),
);
const SCHEMA_FILE = fileURLToPath(
  new URL('../../../data/schemas/pt-br.schema.json', import.meta.url),
);

async function loadJson<T>(fileName: string): Promise<T> {
  const content = await readFile(`${EXPERIMENT_DIR}${fileName}`, 'utf8');
  return JSON.parse(content) as T;
}

interface InputEntry {
  jmdictSeq: number;
  kanji: string[];
  readings: string[];
  senses: Array<{ sense: number; partOfSpeech: string[]; glosses: Array<{ language: string; text: string }> }>;
}

interface ExperimentInput {
  meta?: { entries?: number };
  entries: InputEntry[];
}

interface Candidate {
  jmdictSeq: number;
  sense: number;
  text: string;
  confidence: number;
}

interface ValidationResult {
  jmdictSeq: number;
  sense: number;
  candidate: string;
  status: 'machine_translated' | 'approved';
  decision: 'approved' | 'revise' | 'rejected';
  suggestedTranslation?: string;
}

interface ApprovedRow {
  jmdictSeq: number;
  sense: number;
  text: string;
  status: 'approved';
  source: string;
  sourceVersion: string;
}

describe('experimento v0.1 — base pt-BR gerada por IA', () => {
  let input: ExperimentInput;
  let candidates: { candidates: Candidate[] };
  let results: { results: ValidationResult[] };
  let approved: { translations: ApprovedRow[] };

  beforeAll(async () => {
    input = await loadJson('generator-input.json');
    candidates = await loadJson('generated-candidates.json');
    results = await loadJson('validation-results.json');
    approved = await loadJson('approved.json');
  });

  const inputKeys = () =>
    new Set(input.entries.flatMap((e) => e.senses.map((s) => `${e.jmdictSeq}:${s.sense}`)));

  const candidateKeys = () => new Set(candidates.candidates.map((c) => `${c.jmdictSeq}:${c.sense}`));

  const resultKeys = () => new Set(results.results.map((r) => `${r.jmdictSeq}:${r.sense}`));

  const approvedKeys = () =>
    new Set(approved.translations.map((r) => `${r.jmdictSeq}:${r.sense}`));

  it('1. contém exatamente 20 entradas reais', () => {
    expect(input.entries).toHaveLength(20);
    expect(input.meta).toBeDefined();
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
      expect(positions).toEqual([...Array(positions[positions.length - 1]).keys()].map((i) => i + 1));
      expect(new Set(positions).size).toBe(positions.length);
    }
    expect(inputKeys().size).toBe(input.entries.reduce((acc, e) => acc + e.senses.length, 0));
  });

  it('4. cada sentido tem glossas não vazias em inglês', () => {
    for (const entry of input.entries) {
      for (const sense of entry.senses) {
        expect(sense.glosses.length).toBeGreaterThan(0);
        for (const gloss of sense.glosses) {
          expect(gloss.text.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('5. um candidato por sentido do input', () => {
    expect(candidates.candidates.length).toBe(inputKeys().size);
    expect(inputKeys().size).toBe(109);
  });

  it('6. candidatos referenciam exatamente os sentidos do input', () => {
    expect(inputKeys()).toEqual(candidateKeys());
  });

  it('7. candidatos têm texto não vazio e confidence em [0,1]', () => {
    for (const candidate of candidates.candidates) {
      expect(candidate.text.trim().length).toBeGreaterThan(0);
      expect(candidate.confidence).toBeGreaterThanOrEqual(0);
      expect(candidate.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('8. resultados de validação cobrem todos os candidatos, sem duplicar', () => {
    expect(results.results.length).toBe(candidates.candidates.length);
    expect(resultKeys()).toEqual(candidateKeys());
  });

  it('9. decisões e status são válidos e coerentes', () => {
    for (const result of results.results) {
      expect(['approved', 'revise', 'rejected']).toContain(result.decision);
      expect(['machine_translated', 'approved']).toContain(result.status);
      if (result.decision === 'approved') {
        expect(result.status).toBe('approved');
      } else {
        expect(result.status).toBe('machine_translated');
        expect(result.suggestedTranslation?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('10. approved.json contém exatamente as decisões approved, com metadados', () => {
    const approvedDecisions = results.results
      .filter((r) => r.decision === 'approved')
      .map((r) => `${r.jmdictSeq}:${r.sense}`);
    expect(approvedKeys()).toEqual(new Set(approvedDecisions));
    expect(approved.translations).toHaveLength(approvedDecisions.length);
    for (const row of approved.translations) {
      expect(row.status).toBe('approved');
      expect(row.source).toBe('kotoba-ai-experiment');
      expect(row.sourceVersion).toBe('v0.1');
      expect(row.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('11. sem (jmdictSeq, sense) duplicado no dataset aprovado', () => {
    expect(approvedKeys().size).toBe(approved.translations.length);
  });

  it('12. maioria aprovada', () => {
    const approvedCount = results.results.filter((r) => r.decision === 'approved').length;
    expect(approvedCount).toBeGreaterThan(results.results.length / 2);
  });

  it('13. 見る → ver aprovado; 食べる jamais vira "ver"', () => {
    const miru = approved.translations.filter((r) => r.jmdictSeq === 1259290 && r.sense === 1);
    expect(miru).toHaveLength(1);
    expect(miru[0]!.text).toBe('ver');

    const taberu = candidates.candidates.filter((c) => c.jmdictSeq === 1358280);
    expect(taberu.length).toBeGreaterThan(0);
    for (const candidate of taberu) {
      expect(candidate.text).not.toBe('ver');
    }
    const taberuApproved = approved.translations.filter((r) => r.jmdictSeq === 1358280);
    for (const row of taberuApproved) {
      expect(row.text).not.toBe('ver');
    }
  });

  it('14. testes críticos do validador: rejeições identificáveis e confiante-mas-rejeitado', () => {
    const byKey = new Map(results.results.map((r) => [`${r.jmdictSeq}:${r.sense}`, r]));
    expect(byKey.get('1259290:3')?.decision).toBe('rejected');
    expect(byKey.get('1259290:3')?.suggestedTranslation).toContain('cuidar');
    expect(byKey.get('1283190:2')?.decision).toBe('rejected');
    expect(byKey.get('1283190:2')?.suggestedTranslation).toBe('caro');
    const confidentRejected =
      candidates.candidates.find((c) => c.jmdictSeq === 1259290 && c.sense === 3)?.confidence ?? 0;
    expect(confidentRejected).toBeGreaterThanOrEqual(0.9);
    expect(byKey.get('1310460:2')?.decision).toBe('rejected');
  });

  it('15. schema referenciado por approved.json existe', async () => {
    const schema = JSON.parse(await readFile(SCHEMA_FILE, 'utf8')) as { $schema?: string };
    expect(schema.$schema).toContain('2020-12');
  });
});