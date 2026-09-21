import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { translationDatasetSchema } from '@kotoba/validation';
import { beforeAll, describe, expect, it } from 'vitest';

const V04_DIR = fileURLToPath(new URL('../../../data/pt-br/releases/v0.4/', import.meta.url));
const V03B_DIR = fileURLToPath(new URL('../../../data/pt-br/experiments/v0.3b/', import.meta.url));
const MANUAL_DIR = fileURLToPath(new URL('../../../data/pt-br/manual/', import.meta.url));
const SCHEMA_DIR = fileURLToPath(new URL('../../../data/schemas/', import.meta.url));

interface CanonicalRow {
  jmdictSeq: number;
  sensePosition: number;
  language: string;
  text: string;
  source: string;
  sourceVersion: string;
  position: number;
  confidence?: number;
  [key: string]: unknown;
}

interface CanonicalDataset {
  source?: string;
  version?: string;
  translations: CanonicalRow[];
}

interface Manifest {
  version: string;
  sourceDataset: string;
  recordCount: number;
  uniqueSenseCount: number;
  uniqueEntryCount: number;
  sha256: string;
  schemaSha256: string;
  jmdictVersion: string | null;
  referentialValidation: {
    checked: number;
    invalidReferences: number;
    skipped: boolean;
  };
  duplicateDetection: { duplicates: number };
  validation: {
    schemaErrors: number;
    structuralFieldViolations: number;
    textViolations: number;
    languageErrors: number;
  };
  provenance: { source: string; sourceVersion: string; semanticsChanged: number };
  status: string;
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
const OPTIONAL_FIELDS = ['confidence'];
const ALLOWED_FIELDS = [...CANONICAL_REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
const FORBIDDEN_FIELDS = [
  'kanji',
  'reading',
  'readings',
  'sense',
  'status',
  'pos',
  'priority',
  'gloss',
  'glosses',
  'misc',
  'dialect',
  'xrefs',
];
const IDENTITY_FIELDS = [...CANONICAL_REQUIRED_FIELDS.slice(0, 6)];

function sha256Bytes(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function loadJson<T>(fileName: string, dir: string): Promise<T> {
  return JSON.parse(await readFile(`${dir}${fileName}`, 'utf8')) as T;
}

function identityKey(row: CanonicalRow): string {
  return IDENTITY_FIELDS.map((field) => row[field]).join('|');
}

function rowSchemaIssues(row: CanonicalRow): string[] {
  const issues: string[] = [];
  for (const field of CANONICAL_REQUIRED_FIELDS) {
    if (!(field in row)) {
      issues.push(`campo obrigatório ausente: ${field}`);
    }
  }
  const unknown = Object.keys(row).filter((key) => !ALLOWED_FIELDS.includes(key));
  if (unknown.length > 0) {
    issues.push(`propriedades adicionais: ${unknown.join(', ')}`);
  }
  if (typeof row.jmdictSeq !== 'number' || !Number.isInteger(row.jmdictSeq) || row.jmdictSeq <= 0) {
    issues.push('jmdictSeq deve ser inteiro > 0');
  }
  if (
    typeof row.sensePosition !== 'number' ||
    !Number.isInteger(row.sensePosition) ||
    row.sensePosition < 0
  ) {
    issues.push('sensePosition deve ser inteiro >= 0');
  }
  if (typeof row.position !== 'number' || !Number.isInteger(row.position) || row.position < 0) {
    issues.push('position deve ser inteiro >= 0');
  }
  if (
    typeof row.language !== 'string' ||
    !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(row.language)
  ) {
    issues.push('language inválido');
  }
  if (typeof row.text !== 'string' || row.text.length === 0) {
    issues.push('text inválido');
  }
  if (typeof row.source !== 'string' || row.source.length === 0) {
    issues.push('source inválido');
  }
  if (typeof row.sourceVersion !== 'string' || row.sourceVersion.length === 0) {
    issues.push('sourceVersion inválido');
  }
  if ('confidence' in row) {
    if (typeof row.confidence !== 'number' || row.confidence < 0 || row.confidence > 1) {
      issues.push('confidence inválido');
    }
  }
  return issues;
}

function buildCanonical(rows: CanonicalRow[]): CanonicalRow[] {
  const seen = new Set<string>();
  const unique: CanonicalRow[] = [];
  for (const row of rows) {
    const key = identityKey(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push({ ...row });
  }
  const order = [...CANONICAL_REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
  const rebuilt = unique.map((row) => {
    const out: Record<string, unknown> = {};
    for (const key of order) {
      if (key in row) {
        out[key] = row[key];
      }
    }
    return out as CanonicalRow;
  });
  rebuilt.sort(
    (a, b) =>
      a.jmdictSeq - b.jmdictSeq ||
      a.sensePosition - b.sensePosition ||
      a.position - b.position ||
      (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
  );
  return rebuilt;
}

function serialize(dataset: CanonicalDataset): string {
  return `${JSON.stringify(dataset, null, 2)}\n`;
}

describe('release v0.4 — dataset canônico kotoba-pt-br (build + validation + staging readiness)', () => {
  let dataset: CanonicalDataset;
  let manifest: Manifest;
  let v03b: CanonicalDataset;
  let smokeManual: CanonicalDataset;
  let sampleManual: CanonicalDataset;
  let datasetFileBytes: string;

  beforeAll(async () => {
    dataset = await loadJson<CanonicalDataset>('dataset.json', V04_DIR);
    manifest = await loadJson<Manifest>('manifest.json', V04_DIR);
    v03b = await loadJson<CanonicalDataset>('dataset.json', V03B_DIR);
    smokeManual = await loadJson<CanonicalDataset>('pt-br-smoke.json', MANUAL_DIR);
    sampleManual = await loadJson<CanonicalDataset>('pt-br-sample.json', MANUAL_DIR);
    datasetFileBytes = await readFile(`${V04_DIR}dataset.json`, 'utf8');
    await loadJson<{ title: string }>('pt-br-dataset.schema.json', SCHEMA_DIR);
  });

  it('A. schema: todo dataset válido passa (v0.4, v0.3b e manuais)', () => {
    const datasets = [dataset, v03b, smokeManual, sampleManual];
    for (const current of datasets) {
      expect(translationDatasetSchema.safeParse(current).success).toBe(true);
      for (const row of current.translations) {
        expect(rowSchemaIssues(row)).toEqual([]);
      }
    }
  });

  it('B. isolamento estrutural: nenhum campo do JMdict duplicado no dataset', () => {
    for (const row of dataset.translations) {
      const keys = Object.keys(row);
      for (const forbidden of FORBIDDEN_FIELDS) {
        expect(keys).not.toContain(forbidden);
        expect(row).not.toHaveProperty(forbidden);
      }
      const expected = 'confidence' in row ? ALLOWED_FIELDS : CANONICAL_REQUIRED_FIELDS;
      expect(keys.sort()).toEqual([...expected].sort());
    }
    const serialized = JSON.stringify(dataset.translations);
    expect(serialized).not.toContain('"kanji"');
    expect(serialized).not.toContain('"readings"');
    expect(serialized).not.toContain('"glosses"');
  });

  it('C. referências JMdict: todas as 1706 referências resolvidas (invalidReferences=0)', () => {
    expect(manifest.sourceDataset).toBe('v0.3b');
    expect(manifest.recordCount).toBe(1706);
    expect(manifest.referentialValidation.checked).toBe(1706);
    expect(manifest.referentialValidation.invalidReferences).toBe(0);
    expect(manifest.referentialValidation.skipped).toBe(false);
    expect(manifest.jmdictVersion).toBe('2026-09-09');
  });

  it('D. duplicatas detectadas deterministicamente: 0 pelo critério do importer', () => {
    const seen = new Set<string>();
    let duplicates = 0;
    for (const row of dataset.translations) {
      const key = identityKey(row);
      if (seen.has(key)) {
        duplicates += 1;
      }
      seen.add(key);
    }
    expect(duplicates).toBe(manifest.duplicateDetection.duplicates);
    expect(duplicates).toBe(0);

    const senseKeys = dataset.translations.map((row) => `${row.jmdictSeq}:${row.sensePosition}`);
    expect(new Set(senseKeys).size).toBe(dataset.translations.length);
  });

  it('E. build determinístico: SHA256 do artefato estável e reproduzível a partir do v0.3b', () => {
    const recomputed = buildCanonical(v03b.translations);
    const expectedDataset: CanonicalDataset = {
      source: 'kotoba-ai-experiment',
      version: 'v0.4',
      translations: recomputed,
    };
    const serialized = serialize(expectedDataset);

    expect(sha256Bytes(serialized)).toBe(manifest.sha256);
    expect(sha256Bytes(datasetFileBytes)).toBe(manifest.sha256);
    expect(serialized).toBe(datasetFileBytes);

    const twice = buildCanonical(v03b.translations);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(recomputed));
  });

  it('F. proveniência: source/sourceVersion válidos e conteúdo preservado do v0.3b', () => {
    expect(dataset.translations).toHaveLength(1706);

    const sources = new Set(dataset.translations.map((row) => row.source));
    const versions = new Set(dataset.translations.map((row) => row.sourceVersion));
    expect([...sources]).toEqual(['kotoba-ai-experiment']);
    expect([...versions]).toEqual(['v0.3']);
    expect(manifest.provenance.semanticsChanged).toBe(0);

    const original = new Map<string, CanonicalRow>();
    for (const row of v03b.translations) {
      original.set(identityKey(row), row);
    }
    for (const row of dataset.translations) {
      const prior = original.get(identityKey(row));
      expect(prior).toBeDefined();
      expect(row.text).toBe(prior!.text);
      expect(row.source).toBe(prior!.source);
      expect(row.sourceVersion).toBe(prior!.sourceVersion);
      expect(row.confidence).toBe(prior!.confidence);
      expect(row.language).toBe('pt-BR');
      expect(typeof row.confidence).toBe('number');
      expect(row.confidence!).toBeGreaterThanOrEqual(0);
      expect(row.confidence!).toBeLessThanOrEqual(1);
    }
  });

  it('J. caso especial 2028930 (が/ヶ/ケ): apenas traduções, sem metadata estrutural', () => {
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
      expect(Object.keys(row).sort()).toEqual([...ALLOWED_FIELDS].sort());
      expect(row).not.toHaveProperty('kanji');
      expect(row).not.toHaveProperty('readings');
      expect(row).not.toHaveProperty('sense');
    }
  });
});
