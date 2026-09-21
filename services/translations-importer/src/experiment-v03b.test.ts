import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { translationDatasetSchema } from '@kotoba/validation';
import { beforeAll, describe, expect, it } from 'vitest';

const V03_DIR = fileURLToPath(new URL('../../../data/pt-br/experiments/v0.3/', import.meta.url));
const V03B_DIR = fileURLToPath(new URL('../../../data/pt-br/experiments/v0.3b/', import.meta.url));
const MANUAL_DIR = fileURLToPath(new URL('../../../data/pt-br/manual/', import.meta.url));
const FIXTURES_DIR = fileURLToPath(
  new URL('../../../services/translations-importer/fixtures/', import.meta.url),
);

interface ApprovedRow {
  jmdictSeq: number;
  sense: number;
  kanji: string[];
  readings: string[];
  text: string;
  status: 'approved';
  source: string;
  sourceVersion: string;
  confidence: number;
}

interface CanonicalRow {
  jmdictSeq: number;
  sensePosition: number;
  language: string;
  text: string;
  source: string;
  sourceVersion: string;
  position: number;
  confidence?: number;
}

interface CanonicalDataset {
  source?: string;
  version?: string;
  translations: CanonicalRow[];
}

interface ManualFixtureRow extends CanonicalRow {
  kanji: string[];
  reading: string[];
}

interface ManualFixture {
  source?: string;
  version?: string;
  translations: ManualFixtureRow[];
}

const CANONICAL_REQUIRED_FIELDS = [
  'jmdictSeq',
  'sensePosition',
  'language',
  'text',
  'source',
  'sourceVersion',
  'position',
];

const CANONICAL_AI_FIELDS = [...CANONICAL_REQUIRED_FIELDS, 'confidence'];

async function loadJson<T>(fileName: string, dir: string): Promise<T> {
  const content = await readFile(`${dir}${fileName}`, 'utf8');
  return JSON.parse(content) as T;
}

function canonicalKeysOf(rows: CanonicalRow[]): Set<string> {
  return new Set(rows.map((row) => `${row.jmdictSeq}:${row.sensePosition}`));
}

describe('experimento v0.3b — dataset canônico pt-BR (normalização estrutural do v0.3)', () => {
  let approved: { translations: ApprovedRow[] };
  let dataset: CanonicalDataset;
  let manifest: {
    count: number;
    referentialValidation: { checked: number; invalidReferences: number; skipped: boolean };
  };

  beforeAll(async () => {
    approved = await loadJson('approved.json', V03_DIR);
    dataset = await loadJson('dataset.json', V03B_DIR);
    manifest = await loadJson('manifest.json', V03B_DIR);
  });

  it('A. preserva exatamente o conjunto (jmdictSeq, sensePosition, text) e metadados do v0.3', () => {
    const approvedKeys = new Map(
      approved.translations.map((row) => [`${row.jmdictSeq}:${row.sense - 1}:${row.text}`, row]),
    );
    const approvedKeysSet = new Set(approvedKeys.keys());
    const datasetKeys = new Set(
      dataset.translations.map((row) => `${row.jmdictSeq}:${row.sensePosition}:${row.text}`),
    );

    expect(approved.translations.length).toBe(1706);
    expect(dataset.translations.length).toBe(1706);
    expect(datasetKeys).toEqual(approvedKeysSet);

    for (const row of dataset.translations) {
      const original = approvedKeys.get(`${row.jmdictSeq}:${row.sensePosition}:${row.text}`);
      expect(original).toBeDefined();
      expect(row.source).toBe(original!.source);
      expect(row.sourceVersion).toBe(original!.sourceVersion);
      expect(row.confidence).toBe(original!.confidence);
      expect(original!.source).toBe('kotoba-ai-experiment');
      expect(original!.sourceVersion).toBe('v0.3');
    }
  });

  it('B. ausência de estrutura japonesa e contrato canônico (sem kanji/readings/sense/status)', () => {
    expect(canonicalKeysOf(dataset.translations).size).toBe(dataset.translations.length);

    for (const row of dataset.translations) {
      expect(Object.keys(row).sort()).toEqual([...CANONICAL_AI_FIELDS].sort());
      expect(row).not.toHaveProperty('kanji');
      expect(row).not.toHaveProperty('readings');
      expect(row).not.toHaveProperty('sense');
      expect(row).not.toHaveProperty('status');
      expect(row.language).toBe('pt-BR');
      expect(Number.isInteger(row.jmdictSeq)).toBe(true);
      expect(row.jmdictSeq).toBeGreaterThan(0);
      expect(Number.isInteger(row.sensePosition)).toBe(true);
      expect(row.sensePosition).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(row.position)).toBe(true);
      expect(row.position).toBeGreaterThanOrEqual(0);
      expect(typeof row.source).toBe('string');
      expect(typeof row.sourceVersion).toBe('string');
      if (typeof row.confidence === 'number') {
        expect(row.confidence).toBeGreaterThanOrEqual(0);
        expect(row.confidence).toBeLessThanOrEqual(1);
      }
    }

    const serialized = JSON.stringify(dataset.translations);
    expect(serialized).not.toContain('"readings"');
  });

  it('C. validação referencial contra o JMdict: 0 referências inválidas nas 1706 entradas', () => {
    expect(manifest.count).toBe(1706);
    expect(manifest.referentialValidation.checked).toBe(1706);
    expect(manifest.referentialValidation.invalidReferences).toBe(0);
    expect(manifest.referentialValidation.skipped).toBe(false);
  });

  it('D. regressão 2028930 (が/ヶ/ケ): a leitura não vaza para o dataset canônico', () => {
    const rows = dataset.translations.filter((row) => row.jmdictSeq === 2028930);
    expect(rows).toHaveLength(10);

    const subjectParticle = rows.find(
      (row) => row.sensePosition === 0 && row.text === 'partícula de sujeito',
    );
    expect(subjectParticle).toBeDefined();

    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain('が');
    expect(serialized).not.toContain('ヶ');
    expect(serialized).not.toContain('ケ');
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain('kanji');
      expect(Object.keys(row)).not.toContain('readings');
      expect(row.language).toBe('pt-BR');
    }
  });

  it('E. dataset manual normalizado preserva textos, posições, source e sourceVersion', async () => {
    const oldSmoke = await loadJson<ManualFixture>('pt-br-smoke.json', FIXTURES_DIR);
    const oldSample = await loadJson<ManualFixture>('pt-br-sample.json', FIXTURES_DIR);
    const newSmoke = await loadJson<CanonicalDataset>('pt-br-smoke.json', MANUAL_DIR);
    const newSample = await loadJson<CanonicalDataset>('pt-br-sample.json', MANUAL_DIR);

    for (const row of oldSmoke.translations) {
      expect('kanji' in row).toBe(true);
      expect('reading' in row).toBe(true);
    }
    for (const row of oldSample.translations) {
      expect('kanji' in row).toBe(true);
      expect('reading' in row).toBe(true);
    }

    const uniqueOld = (rows: ManualFixtureRow[]) => {
      const seen = new Set<string>();
      return rows.filter((row) => {
        const key = [
          row.jmdictSeq,
          row.sensePosition,
          row.language,
          row.text,
          row.source,
          row.sourceVersion,
        ].join('|');
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    };

    const oldSmokeUnique = uniqueOld(oldSmoke.translations);
    expect(oldSmoke.translations).toHaveLength(16);
    expect(oldSmokeUnique).toHaveLength(15);
    expect(newSmoke.translations).toHaveLength(15);

    const compareManual = (
      normalized: CanonicalRow[],
      original: ManualFixtureRow[],
      positionsFromIndex: boolean,
    ) => {
      expect(normalized.length).toBe(original.length);
      for (const [index, row] of normalized.entries()) {
        const originalRow = original[index]!;
        expect(Object.keys(row).sort()).toEqual([...CANONICAL_REQUIRED_FIELDS].sort());
        expect(row.jmdictSeq).toBe(originalRow.jmdictSeq);
        expect(row.sensePosition).toBe(originalRow.sensePosition);
        expect(row.language).toBe(originalRow.language);
        expect(row.text).toBe(originalRow.text);
        expect(row.source).toBe(originalRow.source);
        expect(row.sourceVersion).toBe(originalRow.sourceVersion);
        expect(row.position).toBe(positionsFromIndex ? index : originalRow.position);
      }
    };

    for (const row of newSmoke.translations) {
      expect(Object.keys(row)).not.toContain('kanji');
      expect(Object.keys(row)).not.toContain('reading');
    }
    for (const row of newSample.translations) {
      expect(Object.keys(row)).not.toContain('kanji');
      expect(Object.keys(row)).not.toContain('reading');
    }

    compareManual(newSmoke.translations, oldSmokeUnique, false);
    const oldSampleWithIndexPositions: ManualFixtureRow[] = oldSample.translations.map(
      (row, index) => ({
        ...row,
        position: index,
      }),
    );
    compareManual(newSample.translations, oldSampleWithIndexPositions, true);
  });

  it('F. o approved.json do v0.3 permanece intocado (histórico preservado)', () => {
    expect(approved.translations).toHaveLength(1706);
    for (const row of approved.translations) {
      expect('kanji' in row).toBe(true);
      expect('readings' in row).toBe(true);
      expect('sense' in row).toBe(true);
      expect(row.status).toBe('approved');
    }
  });

  it('G. um único contrato canônico: o importer aceita dataset AI e datasets manuais da mesma forma', () => {
    expect(translationDatasetSchema.safeParse(dataset).success).toBe(true);
  });
});
