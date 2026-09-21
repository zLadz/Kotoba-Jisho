import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const APPROVED_FILE = fileURLToPath(new URL('../v0.3/approved.json', import.meta.url));
const DATASET_FILE = fileURLToPath(new URL('./dataset.json', import.meta.url));
const MANIFEST_FILE = fileURLToPath(new URL('./manifest.json', import.meta.url));

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
const OPTIONAL_FIELDS = ['confidence'];

const LANG = 'pt-BR';

async function main() {
  const approved = JSON.parse(await readFile(APPROVED_FILE, 'utf8'));

  const rows = approved.translations;

  const canonical = [];
  let missingConfidence = 0;
  const seenKeys = new Set();
  let duplicates = 0;

  for (const row of rows) {
    if (row.status !== 'approved') {
      throw new Error(`linha inesperada sem status approved: ${JSON.stringify(row)}`);
    }
    if (!Number.isInteger(row.sense) || row.sense < 1) {
      throw new Error(`sense inválido (${row.jmdictSeq}): ${JSON.stringify(row)}`);
    }
    const entry = {
      jmdictSeq: row.jmdictSeq,
      sensePosition: row.sense - 1,
      language: LANG,
      text: row.text,
      source: row.source,
      sourceVersion: row.sourceVersion,
      position: 0,
    };
    if (typeof row.confidence === 'number') {
      entry.confidence = row.confidence;
    } else {
      missingConfidence += 1;
    }
    const key = `${entry.jmdictSeq}|${entry.sensePosition}|${entry.text}`;
    if (seenKeys.has(key)) {
      duplicates += 1;
    }
    seenKeys.add(key);
    canonical.push(entry);
  }

  for (const row of canonical) {
    const extra = Object.keys(row).filter(
      (field) => !CANONICAL_FIELDS.includes(field) && !OPTIONAL_FIELDS.includes(field),
    );
    if (extra.length > 0) {
      throw new Error(`campo não-canônico presente: ${extra.join(', ')}`);
    }
  }

  const datasetChecksum = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');

  const preservation = {
    count: canonical.length,
    sourceCount: new Set(canonical.map((row) => row.source)).size,
    sourceVersions: [...new Set(canonical.map((row) => row.sourceVersion))],
    languageCount: new Set(canonical.map((row) => row.language)).size,
    missingConfidence,
    duplicates,
    removedFields: ['kanji', 'readings', 'sense', 'status'],
  };

  const referential = await validateReferences(canonical);

  const dataset = {
    source: 'kotoba-ai-experiment',
    version: 'v0.3',
    translations: canonical,
  };

  const manifest = {
    experiment: 'pt-br-ai-translation-dataset-v0.3b',
    description:
      'Normalização estrutural determinística do approved.json do experimento v0.3 para o contrato canônico de dataset de traduções. JMdict permanece a autoridade estrutural japonesa; nenhuma tradução foi gerada ou alterada semanticamente.',
    derivedFrom: 'data/pt-br/experiments/v0.3/approved.json',
    schema: 'data/schemas/pt-br-dataset.schema.json',
    generatedAt: new Date().toISOString(),
    source: dataset.source,
    version: dataset.version,
    count: canonical.length,
    transformation: {
      removedFields: preservation.removedFields,
      addedFields: ['language', 'position'],
      mappedFields: { sense: 'sensePosition (1-based → 0-based)' },
      semanticsChanged: 0,
      determinismOrder: 'ordem do approved.json preservada; positions iniciando em 0 por acepção',
    },
    preservation,
    referentialValidation: referential,
    files: {
      dataset: 'dataset.json',
      manifest: 'manifest.json',
    },
    checksum: datasetChecksum,
  };

  await writeFile(DATASET_FILE, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`dataset canônico gerado: ${DATASET_FILE}`);
  console.log(`manifesto gerado:        ${MANIFEST_FILE}`);
  console.log(`traduções:               ${canonical.length}`);
  console.log(`referências inválidas:   ${referential.invalidReferences ?? 0}`);
  console.log(`referências checadas:    ${referential.checked}`);
  console.log(
    `validação DB:            ${referential.skipped ? 'solicitada (SKIP_DB)' : referential.database}`,
  );

  if (referential.invalidReferences > 0) {
    console.error(
      `referências inválidas detectadas (${referential.invalidReferences}); dataset NÃO deve ser importado`,
    );
    process.exitCode = 1;
  }
}

async function validateReferences(rows) {
  if (SKIP_DB) {
    return { checked: rows.length, invalidReferences: null, database: null, skipped: true };
  }

  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const { default: postgres } = await import('postgres');
  const sql = postgres(databaseUrl, { max: 1 });

  try {
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

    const samples = invalid.slice(0, 20);
    return {
      checked: rows.length,
      distinctEntries: entrySeqs.size,
      invalidReferences: invalid.length,
      samples,
      database: databaseUrl.split('@').pop() ?? '',
      skipped: false,
    };
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
