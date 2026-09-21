# Experimento v0.3b — Dataset canônico PT-BR (normalização estrutural do v0.3)

> **Resumo**: v0.3b é a normalização estrutural determinística do `approved.json` do
> experimento v0.3 para o **contrato canônico de dataset de traduções** do Kotoba.
> Não gerou novas traduções, não alterou nenhum texto aprovado e não tocou no banco de
> produção. O JMdict permanece a única autoridade estrutural japonesa (kanji, readings,
> POS, prioridades, contadores).

## Input

- **Fonte**: `data/pt-br/experiments/v0.3/approved.json` (intocado).
- **Rótulo**: experimento `pt-br-ai-generation-v0.3`, `source = kotoba-ai-experiment`,
  `sourceVersion = v0.3`.
- **Conteúdo**: 1.706 traduções aprovadas de 499 entradas JMdict distintas.
- **Formato de origem**: linhas com `jmdictSeq`, `kanji`, `readings`, `sense` (1-based),
  `text`, `status: "approved"`, `source`, `sourceVersion`, `confidence`.
- **Estruturas japonesas no input**: `kanji` e `readings` presentes em todas as linhas
  (ex.: entrada 2028930 com readings `[が, ヶ, ケ]`), `sense` 1-based.

## Transformation

Transformação puramente estrutural e **determinística** (reproduzível com
`node data/pt-br/experiments/v0.3b/build.mjs`; hash do `dataset.json` estável entre
execuções):

| Campo canônico  | Origem                                                               |
| --------------- | -------------------------------------------------------------------- |
| `jmdictSeq`     | preservado de `approved.json`                                        |
| `sensePosition` | `sense - 1` (passa de 1-based para 0-based, contrato do importer/DB) |
| `language`      | `"pt-BR"` (adicionado, constante do contrato)                        |
| `text`          | preservado byte a byte                                               |
| `source`        | preservado (`kotoba-ai-experiment`)                                  |
| `sourceVersion` | preservado (`v0.3`)                                                  |
| `position`      | `0` (uma tradução aprovada por acepção; mesma ordem do approved)     |
| `confidence`    | preservado (todas as 1.706 linhas possuem `confidence` em `[0,1]`)   |

- **Removidos**: `kanji`, `readings`, `sense`, `status` — os dois primeiros ficam sob
  autoridade exclusiva do JMdict e os dois últimos são conceitos do experimento, não do
  dataset de troca.
- **Mudanças semânticas**: 0 (nenhum texto, associação ou metadado de proveniência alterado).
- **Ordenação**: preservada a ordem do `approved.json`.

## Referential validation

- Validação executada no build contra o JMdict carregado no ambiente de desenvolvimento
  (`localhost:5432/kotoba`, `source_imports jmdict@2026-09-09`):
  - `jmdictSeq` deve existir em `entries.jmdict_seq`;
  - `sensePosition` deve existir em `senses.position` (0-based) daquela entrada.
- **Resultado**: `checked = 1706`, `invalidReferences = 0` — todas as
  `jmdictSeq + sensePosition` resolvem para uma acepção JMdict válida.
- Em caso de referências inválidas, o build falha (exit ≠ 0) e **nenhum dataset é
  importável a partir de referências quebradas** (sem autocorreção).
- Evidência também pelo importer: `--dry-run` do `dataset.json` reporta
  `wouldInsert = 1706`, `wouldReject = 0`, `invalidReferences = 0`.

## Preservation

Comparação v0.3 ↔ v0.3b (verificada por testes automatizados):

- Conjunto `(jmdictSeq, sensePosition, text)` **idêntico** (1.706 ↔ 1.706, bijeção).
- `status/source/sourceVersion/confidence` preservados linha a linha.
- **Regressão 2028930** (が/ヶ/ケ): as 10 acepções de `partícula de sujeito` etc. estão
  no dataset canônico com `sensePosition 0..9` e **nenhum** valor de leitura
  (が, ヶ, ケ) aparece no dataset — o JMdict continua sendo a fonte de kanji/readings.
- `data/pt-br/experiments/v0.3/approved.json` permanece intocado (histórico preservado).

## Manual dataset

- O dataset manual vive nos fixtures do importer (`pt-br-smoke.json`, `pt-br-sample.json`)
  com `kanji`/`reading` declarados. Versão **normalizada** criada em
  `data/pt-br/manual/` (mesmo contrato canônico, `additionalProperties: false`,
  sem `kanji`/`reading`), reproduzível via `node data/pt-br/manual/build.mjs`:
  - **smoke**: 16 linhas → 15 únicas (deduplicação determinística `first-wins` da linha
    `comer` repetida na acepção 0; posições das demais preservadas). Texto `fazer uma
refeição` e todas as demais traduções mantidas.
  - **sample**: 11 linhas → 11, `position` = índice do array (default do importer, pois o
    fixture original não definia `position`).
- **Preservado**: textos, `jmdictSeq`+`sensePosition`, `source` (`manual`) e
  `sourceVersion` (`manual-curated-1` etc.).
- **Referential validation**: 0 referências inválidas (16 linhas checadas).
- `--dry-run` do `pt-br-smoke.json` normalizado: `wouldSkip = 15` — exatamente as 15
  traduções já presentes no banco de desenvolvimento (importadas como `dev-1`),
  comprovando que a versão normalizada resolve para as mesmas acepções e é idempotente.

## Importer (mesmo caminho de resolução)

- `flushTranslationBatch` agora trata `kanji`/`reading` como **identidade opcional**:
  - sem identidade declarada → resolve por `jmdictSeq + sensePosition` (dataset canônico);
  - com identidade declarada → mantém a validação contra as superfícies JMdict (regressão
    preservada: identidade errada continua sendo rejeitada).
- AI e manual percorrem **o mesmo caminho** — nenhum caso especial.
- Novo modo `--dry-run` no CLI: apenas leitura, reporta
  `wouldInsert/wouldSkip/wouldReject/invalidReferences/duplicates` e **não grava nada**
  (validado por teste: contagens de `translations` e `source_imports` inalteradas).

## Production

- **Production database modified: NO**
- Verificação pós-trabalho: `translations = 15`, `source_imports = 2`
  (`jmdict@2026-09-09`, `kotoba-translations@dev-1`), `entries = 218.753`. Nenhum
  INSERT/UPDATE/DELETE executado em produção; o v0.3b está pronto para importar via
  `--dry-run`/validação humana, não foi importado.
- Nenhuma migração ou alteração de schema PostgreSQL.

## Files

| Arquivo                                                      | Papel                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `data/schemas/pt-br-dataset.schema.json`                     | Contrato canônico de dataset (JSON Schema draft 2020-12, `additionalProperties: false`) |
| `data/pt-br/experiments/v0.3b/dataset.json`                  | Dataset canônico v0.3b (1.706 linhas) — input direto do importer                        |
| `data/pt-br/experiments/v0.3b/manifest.json`                 | Metadados da transformação + resultado da referential validation                        |
| `data/pt-br/experiments/v0.3b/build.mjs`                     | Script determinístico que gera `dataset.json`/`manifest.json`                           |
| `data/pt-br/manual/pt-br-smoke.json`                         | Dataset manual normalizado (15 linhas)                                                  |
| `data/pt-br/manual/pt-br-sample.json`                        | Dataset manual normalizado (11 linhas)                                                  |
| `data/pt-br/manual/manifest.json`                            | Resultado da normalização manual                                                        |
| `data/pt-br/manual/build.mjs`                                | Script determinístico da normalização manual                                            |
| `services/translations-importer/src/storage.ts`              | Identidade opcional + `analyzeTranslationBatch` (dry-run)                               |
| `services/translations-importer/src/index.ts`                | Flag `--dry-run`                                                                        |
| `services/translations-importer/src/storage.test.ts`         | Testes DB (resolução canônica, mesmo caminho, dry-run sem escrita)                      |
| `services/translations-importer/src/experiment-v03b.test.ts` | Testes A–G do v0.3b                                                                     |

## Critérios de sucesso

1. ✅ Preservação: conjuntos `(jmdictSeq, sensePosition, text)` idênticos (1.706 ↔ 1.706).
2. ✅ Ausência de kanji/readings/POS/prioridades no dataset canônico (JMdict é a autoridade).
3. ✅ Integridade referencial: 1.706/1.706 referências válidas (build-fail em referência inválida).
4. ✅ Regressão 2028930: readings が/ヶ/ケ não vazam para o dataset canônico.
5. ✅ Dataset manual unificado: textos, posições e sources preservados (sem kanji/reading).
6. ✅ Importer consome AI e manual pela mesma resolução (sem caminho especial).
7. ✅ Schema único canônico (`additionalProperties: false`), compatível com o runtime (zod).
8. ✅ Produção não modificada (Production database modified: NO).
9. ✅ `--dry-run` coerente (wouldInsert/wouldSkip/wouldReject/invalidReferences/duplicates), sem escrita.

## Quality gates

- `npm test`: **238/238** (v0.3b: 7 testes A–G; storage: 15 testes, incl. 3 novos).
- `npm run typecheck`: limpo. `npm run lint`: limpo. `npm run build`: ok.
- `npm run format:check`: apenas **16 falhas pré-existentes** (v0.1, v0.2,
  `data/schemas/pt-br.schema.json`, `experiment.test.ts`) — nenhuma introduzida pelo v0.3b.

## Recomendação

O v0.3b está **pronto para validação humana**. A validação deve focar na revisão do
`dataset.json` (1.706 traduções, agora desacopladas de kanji/readings) e na decisão de
importar, via `--dry-run` + confirmação explícita, como `kotoba-ai-experiment@v0.3` no
ambiente de desenvolvimento antes de cogitar produção. Próximo passo natural: **v0.4**
(human-in-the-loop), **não iniciado automaticamente**.
