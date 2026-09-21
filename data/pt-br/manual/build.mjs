import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = fileURLToPath(
  new URL('../../../services/translations-importer/fixtures/', import.meta.url),
);

const DEFAULT_DATABASE_URL = 'postgresql://kotoba:kotoba_dev_password@localhost:5432/kotoba';
const SKIP_DB = process.env.SKIP_DB === '1' || process.env.SKIP_DB === 'true';

const CANONICAL_FIELDS = [
  'jmdictSeq',
  'sensePosition',
  'language',
  'text',
  'source',
  'sourceVersion',
  'position',
];

const rowKey = (row) =>
  [row.jmdictSeq, row.sensePosition, row.language, row.text, row.source, row.sourceVersion].join(
    '|',
  );

function normalize(rows, assignPosition) {
  const seen = new Set();
  const normalized = [];
  let removed = 0;
  for (const row of rows) {
    const key = rowKey(row);
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    const entry = {
      jmdictSeq: row.jmdictSeq,
      sensePosition: row.sensePosition,
      language: row.language,
      text: row.text,
      source: row.source,
      sourceVersion: row.sourceVersion,
      position: assignPosition ? normalized.length : row.position,
    };
    for (const field of CANONICAL_FIELDS) {
      if (typeof entry[field] !== 'number' && typeof entry[field] !== 'string') {
        throw new Error(`campo ${field} ausente/inválido: ${JSON.stringify(row)}`);
      }
      if (typeof entry[field] === 'number' && !Number.isInteger(entry[field])) {
        throw new Error(`campo ${field} não é inteiro: ${JSON.stringify(row)}`);
      }
    }
    if (
      typeof entry.position !== 'number' ||
      !Number.isInteger(entry.position) ||
      entry.position < 0
    ) {
      throw new Error(
        `position inválida (${entry.jmdictSeq}:${entry.sensePosition}): ${JSON.stringify(row)}`,
      );
    }
    normalized.push(entry);
  }
  return { normalized, removed };
}

async function validateReferences(rows) {
  if (SKIP_DB) {
    return { checked: rows.length, invalidReferences: null, skipped: true };
  }
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const { default: postgres } = await import('postgres');
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const seqs = [...new Set(rows.map((row) => row.jmdictSeq))];
    const entries = await sql`
      select e.jmdict_seq from entries e where e.jmdict_seq = any(${seqs})
    `;
    const entrySeqs = new Set(entries.map((entry) => Number(entry.jmdict_seq)));
    const senses = await sql`
      select e.jmdict_seq, s.position
      from entries e join senses s on s.entry_id = e.id
      where e.jmdict_seq = any(${seqs})
    `;
    const valid = new Set(
      senses.map((sense) => `${Number(sense.jmdict_seq)}:${Number(sense.position)}`),
    );
    const invalid = rows
      .filter(
        (row) =>
          !entrySeqs.has(row.jmdictSeq) || !valid.has(`${row.jmdictSeq}:${row.sensePosition}`),
      )
      .map((row) => ({ jmdictSeq: row.jmdictSeq, sensePosition: row.sensePosition }));
    return {
      checked: rows.length,
      invalidReferences: invalid.length,
      samples: invalid.slice(0, 20),
      skipped: false,
    };
  } finally {
    await sql.end();
  }
}

function canonicalHeader(source, version, rows) {
  return {
    $schema: 'https://kotoba.local/schemas/pt-br-dataset.schema.json',
    source,
    version,
    translations: rows,
  };
}

async function main() {
  const files = ['pt-br-smoke.json', 'pt-br-sample.json'];
  const report = [];

  for (const fileName of files) {
    const original = JSON.parse(await readFile(`${FIXTURES}${fileName}`, 'utf8'));
    const assignPosition = !('position' in original.translations[0]);
    const { normalized, removed } = normalize(original.translations, assignPosition);

    for (const row of normalized) {
      const extra = Object.keys(row).filter((field) => !CANONICAL_FIELDS.includes(field));
      if (extra.length > 0) {
        throw new Error(`campo não-canônico: ${extra.join(', ')}`);
      }
    }

    const referential = await validateReferences(normalized);
    const checksum = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');

    const output = canonicalHeader(original.source, original.version, normalized);
    await writeFile(`${HERE}${fileName}`, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    report.push({
      file: fileName,
      source: original.source,
      version: original.version,
      originalCount: original.translations.length,
      normalizedCount: normalized.length,
      duplicatesRemoved: removed,
      positionSource: assignPosition
        ? 'índice do array (default do importer)'
        : 'posição original preservada',
      referentialValidation: referential,
      checksum,
    });
  }

  const manifest = {
    description:
      'Dataset manual PT-BR normalizado para o contrato canônico de dataset (sem kanji/reading; JMdict como autoridade estrutural japonesa). Textos, posições, source e sourceVersion preservados.',
    schema: 'data/schemas/pt-br-dataset.schema.json',
    files: report,
  };
  await writeFile(`${HERE}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  for (const entry of report) {
    console.log(
      `${entry.file}: ${entry.normalizedCount} (original ${entry.originalCount}, duplicatas removidas ${entry.duplicatesRemoved})`,
    );
    console.log(`  referências inválidas: ${entry.referentialValidation.invalidReferences ?? 0}`);
    console.log(`  posições: ${entry.positionSource}`);
  }
  console.log(`manifesto gerado: ${HERE}manifest.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
