import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const V03B_DATASET_FILE = path.resolve(SCRIPT_DIR, '../../experiments/v0.3b/dataset.json');
const SCHEMA_FILE = path.resolve(SCRIPT_DIR, '../../../schemas/pt-br-dataset.schema.json');
const HUMAN_REVIEW_FILE = path.resolve(SCRIPT_DIR, './human-review.json');
const DATASET_FILE = path.resolve(SCRIPT_DIR, './dataset.json');
const MANIFEST_FILE = path.resolve(SCRIPT_DIR, './manifest.json');

const DEFAULT_DATABASE_URL = 'postgresql://kotoba:kotoba_dev_password@localhost:5432/kotoba';
const SKIP_DB = process.env.SKIP_DB === '1' || process.env.SKIP_DB === 'true';

export const CANONICAL_REQUIRED_FIELDS = [
  'jmdictSeq',
  'sensePosition',
  'language',
  'text',
  'source',
  'sourceVersion',
  'position',
];
export const OPTIONAL_FIELDS = ['confidence'];
export const CANONICAL_FIELD_ORDER = [...CANONICAL_REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
export const FORBIDDEN_FIELDS = [
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
export const IDENTITY_FIELDS = [
  'jmdictSeq',
  'sensePosition',
  'language',
  'text',
  'source',
  'sourceVersion',
];

const LANG = 'pt-BR';
const DATASET_SOURCE = 'kotoba-ai-experiment';
const DATASET_VERSION = 'v0.4';
const SCHEMA_VERSION = '1.0.0';

export function sha256Bytes(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function serializeDataset(dataset) {
  return `${JSON.stringify(dataset, null, 2)}\n`;
}

function compareCodePoints(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function identityKey(row) {
  return IDENTITY_FIELDS.map((field) => row[field]).join('|');
}

function rebuildRow(row) {
  const out = {};
  for (const key of CANONICAL_FIELD_ORDER) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      out[key] = row[key];
    }
  }
  return out;
}

export function canonicalizeRows(rows) {
  let duplicates = 0;
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = identityKey(row);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(rebuildRow(row));
  }

  const bySense = new Map();
  for (const row of unique) {
    const key = `${row.jmdictSeq}:${row.sensePosition}`;
    const group = bySense.get(key) ?? [];
    group.push(row);
    bySense.set(key, group);
  }

  let positionChanged = 0;
  const positionBefore = new Map();
  for (const row of unique) {
    positionBefore.set(identityKey(row), row.position);
  }
  for (const group of bySense.values()) {
    group.sort((a, b) => a.position - b.position || compareCodePoints(a.text, b.text));
    group.forEach((row, index) => {
      row.position = index;
    });
  }
  for (const row of unique) {
    if (positionBefore.get(identityKey(row)) !== row.position) {
      positionChanged += 1;
    }
  }

  unique.sort(
    (a, b) =>
      a.jmdictSeq - b.jmdictSeq ||
      a.sensePosition - b.sensePosition ||
      a.position - b.position ||
      compareCodePoints(a.text, b.text),
  );

  return { rows: unique, duplicates, positionChanged };
}

function typeMatches(type, value) {
  switch (type) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function resolveRef(ref, root) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return undefined;
  }
  let target = root;
  for (const part of ref
    .slice(2)
    .split('/')
    .map((segment) => decodeURIComponent(segment))) {
    target = target?.[part];
  }
  return target;
}

function walk(node, value, root, nodePath, errors) {
  if (node === undefined || node === null) {
    return;
  }
  if (typeof node.$ref === 'string') {
    const target = resolveRef(node.$ref, root);
    if (target !== undefined) {
      walk(target, value, root, nodePath, errors);
    }
    return;
  }

  const types = Array.isArray(node.type) ? node.type : node.type !== undefined ? [node.type] : [];
  if (types.length > 0 && !types.some((entry) => typeMatches(entry, value))) {
    errors.push({ path: [...nodePath], message: `esperado tipo ${types.join('|')}` });
  }

  if (
    Array.isArray(node.enum) &&
    !node.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))
  ) {
    errors.push({ path: [...nodePath], message: `valor fora do enum: ${JSON.stringify(value)}` });
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (node.properties) {
      for (const [key, sub] of Object.entries(node.properties)) {
        if (key in value) {
          walk(sub, value[key], root, [...nodePath, key], errors);
        }
      }
    }
    if (node.additionalProperties === false && node.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in node.properties)) {
          errors.push({ path: [...nodePath, key], message: 'propriedade adicional não permitida' });
        }
      }
    }
    if (Array.isArray(node.required)) {
      for (const key of node.required) {
        if (!(key in value)) {
          errors.push({ path: [...nodePath], message: `campo obrigatório ausente: ${key}` });
        }
      }
    }
  }

  if (Array.isArray(value) && node.items) {
    value.forEach((item, index) => walk(node.items, item, root, [...nodePath, index], errors));
  }

  if (typeof value === 'string') {
    if (typeof node.minLength === 'number' && value.length < node.minLength) {
      errors.push({ path: [...nodePath], message: `menor que minLength ${node.minLength}` });
    }
    if (typeof node.pattern === 'string' && !new RegExp(node.pattern).test(value)) {
      errors.push({ path: [...nodePath], message: `não atende o pattern ${node.pattern}` });
    }
  }

  if (typeof value === 'number') {
    if (typeof node.minimum === 'number' && value < node.minimum) {
      errors.push({ path: [...nodePath], message: `abaixo do mínimo ${node.minimum}` });
    }
    if (typeof node.maximum === 'number' && value > node.maximum) {
      errors.push({ path: [...nodePath], message: `acima do máximo ${node.maximum}` });
    }
    if (typeof node.exclusiveMinimum === 'number' && value <= node.exclusiveMinimum) {
      errors.push({ path: [...nodePath], message: `deve ser maior que ${node.exclusiveMinimum}` });
    }
    if (typeof node.exclusiveMaximum === 'number' && value >= node.exclusiveMaximum) {
      errors.push({ path: [...nodePath], message: `deve ser menor que ${node.exclusiveMaximum}` });
    }
  }
}

export function validateAgainstSchema(instance, schema) {
  const errors = [];
  walk(schema, instance, schema, [], errors);
  return { valid: errors.length === 0, errors };
}

export function auditRows(rows) {
  let structuralViolations = 0;
  let textViolations = 0;
  let languageErrors = 0;
  const samples = { structural: [], text: [], language: [] };
  const allowedKeys = new Set([...CANONICAL_REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);

  for (const row of rows) {
    const keys = Object.keys(row);
    const extra = keys.filter((key) => !allowedKeys.has(key));
    const forbidden = keys.filter((key) => FORBIDDEN_FIELDS.includes(key));
    if (extra.length > 0 || forbidden.length > 0) {
      structuralViolations += 1;
      if (samples.structural.length < 10) {
        samples.structural.push({ jmdictSeq: row.jmdictSeq, extra, forbidden });
      }
    }

    const text = row.text;
    if (
      typeof text !== 'string' ||
      text.length === 0 ||
      text !== text.trim() ||
      /[\u0000-\u001F\u007F]/.test(text)
    ) {
      textViolations += 1;
      if (samples.text.length < 10) {
        samples.text.push({ jmdictSeq: row.jmdictSeq, sample: String(text).slice(0, 40) });
      }
    }

    if (row.language !== LANG) {
      languageErrors += 1;
      if (samples.language.length < 10) {
        samples.language.push({ jmdictSeq: row.jmdictSeq, language: row.language });
      }
    }
  }

  return { structuralViolations, textViolations, languageErrors, samples };
}

function applyHumanCorrections(rows, corrections) {
  if (!Array.isArray(corrections) || corrections.length === 0) {
    return { rows, applied: 0 };
  }
  const next = rows.map((row) => ({ ...row }));
  const allowedReplacement = new Set([...CANONICAL_REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
  let applied = 0;
  for (const correction of corrections) {
    if (!correction || typeof correction !== 'object') {
      throw new Error(`correção humana inválida: ${JSON.stringify(correction)}`);
    }
    const { jmdictSeq, sensePosition, language, text, source, sourceVersion, replacement } =
      correction;
    if (!replacement || typeof replacement !== 'object') {
      throw new Error(`correção humana sem replacement: ${JSON.stringify(correction)}`);
    }
    for (const field of Object.keys(replacement)) {
      if (!allowedReplacement.has(field)) {
        throw new Error(`replacement contém campo fora do contrato: ${field}`);
      }
    }
    const key = [jmdictSeq, sensePosition, language, text, source, sourceVersion].join('|');
    const index = next.findIndex((row) => identityKey(row) === key);
    if (index < 0) {
      throw new Error(
        `correção humana refere identidade inexistente no dataset: ${JSON.stringify(correction)}`,
      );
    }
    for (const [field, value] of Object.entries(replacement)) {
      if (value === null) {
        delete next[index][field];
      } else {
        next[index][field] = value;
      }
    }
    applied += 1;
  }
  return { rows: next, applied };
}

async function loadJmdictVersion(sql) {
  const rows = await sql`
    select version from source_imports
    where source = 'jmdict'
    order by imported_at desc
    limit 1
  `;
  return rows[0]?.version !== undefined ? String(rows[0].version) : null;
}

async function validateReferences(sql, rows) {
  const seqs = [...new Set(rows.map((row) => row.jmdictSeq))];
  const entries = await sql`
    select e.jmdict_seq
    from entries e
    where e.jmdict_seq = any(${seqs})
  `;
  const entrySeqs = new Set(entries.map((entry) => Number(entry.jmdict_seq)));

  const senseRows = await sql`
    select e.jmdict_seq, s.position
    from entries e
    join senses s on s.entry_id = e.id
    where e.jmdict_seq = any(${seqs})
  `;
  const validPositions = new Set(
    senseRows.map((sense) => `${Number(sense.jmdict_seq)}:${Number(sense.position)}`),
  );

  const invalid = rows
    .map((row) => {
      if (!entrySeqs.has(row.jmdictSeq)) {
        return {
          jmdictSeq: row.jmdictSeq,
          sensePosition: row.sensePosition,
          reason: 'jmdict_seq inexistente',
        };
      }
      if (!validPositions.has(`${row.jmdictSeq}:${row.sensePosition}`)) {
        return {
          jmdictSeq: row.jmdictSeq,
          sensePosition: row.sensePosition,
          reason: 'acepção inexistente',
        };
      }
      return null;
    })
    .filter((entry) => entry !== null);

  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  return {
    checked: rows.length,
    distinctEntries: entrySeqs.size,
    invalidReferences: invalid.length,
    samples: invalid.slice(0, 20),
    database: databaseUrl.split('@').pop() ?? '',
    skipped: false,
  };
}

export async function main() {
  const v03b = JSON.parse(await readFile(V03B_DATASET_FILE, 'utf8'));
  const schema = JSON.parse(await readFile(SCHEMA_FILE, 'utf8'));

  let humanReview = {
    status: 'pending-explicit-human-validation',
    approvals: [],
    corrections: [],
    reviewedBy: null,
    reviewedAt: null,
  };
  let humanReviewMissingFile = false;
  try {
    const raw = JSON.parse(await readFile(HUMAN_REVIEW_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      humanReview = { ...humanReview, ...raw };
    }
  } catch {
    humanReviewMissingFile = true;
  }

  const corrections = Array.isArray(humanReview.corrections) ? humanReview.corrections : [];
  const { rows: correctedRows, applied } = applyHumanCorrections(v03b.translations, corrections);

  const datasetProbe = {
    source: DATASET_SOURCE,
    version: DATASET_VERSION,
    translations: correctedRows,
  };
  const schemaResult = validateAgainstSchema(datasetProbe, schema);
  const schemaErrors = schemaResult.errors.length;

  const audit = auditRows(correctedRows);
  if (
    schemaErrors > 0 ||
    audit.structuralViolations > 0 ||
    audit.textViolations > 0 ||
    audit.languageErrors > 0
  ) {
    console.error('validação do dataset reprovada:');
    for (const entry of schemaResult.errors.slice(0, 20)) {
      console.error(`  [schema] ${entry.path.join('.')}: ${entry.message}`);
    }
    for (const entry of audit.samples.structural) {
      console.error(
        `  [estrutura] ${entry.jmdictSeq}: extra=${entry.extra.join(',')} forbidden=${entry.forbidden.join(',')}`,
      );
    }
    for (const entry of audit.samples.text) {
      console.error(`  [texto] ${entry.jmdictSeq}: ${entry.sample}`);
    }
    process.exitCode = 1;
    return;
  }

  const { rows: canonical, duplicates, positionChanged } = canonicalizeRows(correctedRows);

  const dataset = {
    source: DATASET_SOURCE,
    version: DATASET_VERSION,
    translations: canonical,
  };
  const datasetBytes = serializeDataset(dataset);
  const datasetSha256 = sha256Bytes(datasetBytes);

  const schemaBytes = await readFile(SCHEMA_FILE, 'utf8');
  const schemaSha256 = sha256Bytes(schemaBytes);

  let jmdictVersion = null;
  let referential = null;
  if (SKIP_DB) {
    referential = {
      checked: canonical.length,
      invalidReferences: null,
      database: null,
      skipped: true,
    };
  } else {
    const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
    const { default: postgres } = await import('postgres');
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      jmdictVersion = await loadJmdictVersion(sql);
      referential = await validateReferences(sql, canonical);
    } finally {
      await sql.end();
    }
  }

  const blocked =
    schemaErrors > 0 ||
    audit.structuralViolations > 0 ||
    audit.textViolations > 0 ||
    audit.languageErrors > 0 ||
    duplicates > 0 ||
    (referential.invalidReferences ?? 0) > 0;

  const status = blocked ? 'blocked' : 'staging-ready';

  const manifest = {
    dataset: 'kotoba-pt-br',
    version: DATASET_VERSION,
    language: LANG,
    format: 'canonical',
    schemaVersion: SCHEMA_VERSION,
    schema: 'data/schemas/pt-br-dataset.schema.json',
    sourceDataset: 'v0.3b',
    derivedFrom: 'data/pt-br/experiments/v0.3b/dataset.json',
    humanReview: {
      file: 'human-review.json',
      status: humanReview.status ?? 'unknown',
      missingFile: humanReviewMissingFile,
      correctionsApplied: applied,
    },
    generatedAt: new Date().toISOString(),
    recordCount: canonical.length,
    uniqueSenseCount: new Set(canonical.map((row) => `${row.jmdictSeq}:${row.sensePosition}`)).size,
    uniqueEntryCount: new Set(canonical.map((row) => row.jmdictSeq)).size,
    sha256: datasetSha256,
    schemaSha256,
    jmdictVersion,
    referentialValidation: referential,
    duplicateDetection: {
      checked: canonical.length,
      duplicates,
      identity: IDENTITY_FIELDS,
      policy:
        'first-wins — mesma política do importer (deduplicateRows em services/translations-importer/src/index.ts)',
    },
    positionPolicy: {
      policy:
        'índice ordinal dentro de (jmdictSeq, sensePosition) após ordenação estável por (position, text); uma tradução por acepção ⇒ position=0',
      changed: positionChanged,
    },
    ordering: {
      policy:
        'jmdictSeq ASC, sensePosition ASC, position ASC, text ASC (comparação por code points, independente de locale)',
      deterministic: true,
    },
    validation: {
      schemaErrors,
      structuralFieldViolations: audit.structuralViolations,
      textViolations: audit.textViolations,
      languageErrors: audit.languageErrors,
    },
    provenance: {
      source: DATASET_SOURCE,
      sourceVersion: 'v0.3',
      confidenceRange: {
        min: Math.min(...canonical.map((row) => row.confidence)),
        max: Math.max(...canonical.map((row) => row.confidence)),
        presentInAllRows: canonical.every((row) => typeof row.confidence === 'number'),
      },
      semanticsChanged: 0,
    },
    gates: {
      schemaErrors,
      invalidReferences: referential.invalidReferences ?? null,
      unexpectedDuplicates: duplicates,
      structuralFieldViolations: audit.structuralViolations,
      textViolations: audit.textViolations,
      languageErrors: audit.languageErrors,
      deterministicBuild: true,
      productionWrites: 0,
    },
    status,
    files: {
      dataset: 'dataset.json',
      manifest: 'manifest.json',
      report: 'report.md',
    },
  };

  if (blocked) {
    await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.error(`build reprovado (status=${status}); dataset NÃO reescrito`);
    process.exitCode = 1;
    return;
  }

  await writeFile(DATASET_FILE, datasetBytes, 'utf8');
  await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`dataset release:       ${DATASET_FILE}`);
  console.log(`manifesto:             ${MANIFEST_FILE}`);
  console.log(`traduções:             ${canonical.length}`);
  console.log(`entries:               ${manifest.uniqueEntryCount}`);
  console.log(`senses:                ${manifest.uniqueSenseCount}`);
  console.log(`duplicatas:            ${duplicates}`);
  console.log(`referências inválidas: ${referential.invalidReferences ?? '(skipped)'}`);
  console.log(`sha256(dataset.json):  ${datasetSha256}`);
  console.log(`sha256(schema):        ${schemaSha256}`);
  console.log(`jmdict versão:         ${jmdictVersion}`);
  console.log(`status:                ${status}`);
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
