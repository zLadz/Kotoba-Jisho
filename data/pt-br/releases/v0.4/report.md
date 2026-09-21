# Release v0.4 — Kotoba PT-BR canonical dataset (staging readiness)

> Artefato de release preparado para staging: `data/pt-br/releases/v0.4/`.
> O v0.4 é **data engineering / release preparation**. Nenhuma tradução nova foi
> gerada, nenhuma tradução aprovada foi alterada semanticamente e nenhum ciclo de
> prompt engineering foi iniciado.

## Dataset

| campo                                        | valor                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| versão                                       | `v0.4`                                                                          |
| nome                                         | `kotoba-pt-br`                                                                  |
| origem                                       | `v0.3b` (`data/pt-br/experiments/v0.3b/dataset.json`)                           |
| registros (traduções)                        | 1.706                                                                           |
| entries (jmdict_seq distintos)               | 499                                                                             |
| senses (jmdictSeq + sensePosition distintos) | 1.706                                                                           |
| idioma                                       | `pt-BR`                                                                         |
| formato                                      | `canonical`                                                                     |
| schema                                       | `data/schemas/pt-br-dataset.schema.json` (schemaVersion `1.0.0`, draft 2020-12) |
| arquivos                                     | `dataset.json`, `manifest.json`, `report.md`, `build.mjs`, `human-review.json`  |

O dataset mantém o contrato canônico (7 campos obrigatórios + `confidence` opcional)
e **não contém** qualquer campo estrutural do JMdict (`kanji`, `reading`, `readings`,
`sense`, `status`, `pos`, `priority`, glosses, etc.). O JMdict permanece a autoridade
estrutural japonesa; o Kotoba responde apenas pela camada lexical pt-BR.

## Validation

Todos os gates do v0.4 sobre o release:

| validação                   | método                                                                                                                                        | resultado                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| schema validation           | validador genérico sobre `pt-br-dataset.schema.json` (tipos, required, `additionalProperties:false`, ranges, patterns) + gate zod do importer | `schemaErrors = 0`                                                 |
| JMdict reference validation | consulta de `entries` e `senses` (positions) no banco de desenvolvimento                                                                      | `checked = 1706`, `distinctEntries = 499`, `invalidReferences = 0` |
| duplicate validation        | critério de identidade do importer (`jmdictSeq + sensePosition + language + text + source + sourceVersion`), política `first-wins`            | `duplicates = 0`                                                   |
| text validation             | não-vazio, sem whitespace inicial/final, sem caracteres de controle; preservação de Unicode/acentos/hífens (nenhuma normalização agressiva)   | `textViolations = 0`                                               |
| structural-field validation | chaves fora do contrato / campos proibidos                                                                                                    | `structuralFieldViolations = 0`                                    |
| ordering validation         | `jmdictSeq ASC, sensePosition ASC, position ASC, text ASC` (code points, independente de locale)                                              | determinístico; build executado 2× com `SHA256` idêntico           |

### Position

Política: `position` é o índice ordinal dentro de `(jmdictSeq, sensePosition)` após
ordenação estável por `(position, text)`. Com uma única tradução por acepção,
`position = 0` em todas as linhas (`positionChanged = 0`). `confidence` nunca é usado
para definir `position`.

### Determinismo

O checksum do dataset é calculado sobre os bytes exatos de `dataset.json`
(`JSON.stringify(dataset, null, 2) + '\n'`), sem timestamp dentro do arquivo. O
`generatedAt` fica isolado no manifest.

```text
run 1: sha256(dataset.json) = 163b0ec327ac53ab9a37b2705d39ff189ea7a21697d80c7d1c3abaea8a63a03c
run 2: sha256(dataset.json) = 163b0ec327ac53ab9a37b2705d39ff189ea7a21697d80c7d1c3abaea8a63a03c
```

Byte-for-byte determinístico.

## Provenance

| campo                     | valor                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| source (linhas)           | `kotoba-ai-experiment`                                                                             |
| sourceVersion (linhas)    | `v0.3`                                                                                             |
| confidence                | presente em 100% das linhas; range 0.60–0.95 (metadado de proveniência, não critério de qualidade) |
| JMdict version            | `2026-09-09` (entries = 218.753 no banco de desenvolvimento)                                       |
| dataset checksum (sha256) | `163b0ec327ac53ab9a37b2705d39ff189ea7a21697d80c7d1c3abaea8a63a03c`                                 |
| schema checksum (sha256)  | `b3cc61ae443008fbee191175c5b636b7cf4b77d951dff2a0cf961bb1deea4897`                                 |
| validação humana          | ver `human-review.json`                                                                            |

### Validação humana

Conforme a regra do v0.4, nenhuma aprovação humana foi **inventada**. Ao concluir o
v0.4, nenhuma decisão humana estava registrada formalmente no repositório; por isso a
validação humana foi representada explicitamente em `data/pt-br/releases/v0.4/human-review.json`
(`status: pending-explicit-human-validation`, `approvals: []`, `corrections: []`, zero
correções aplicadas). O dataset v0.4 é derivado integralmente do v0.3b, e problemas
semânticos descobertos em revisões futuras deverão ser registrados como correções de
dados (rastreáveis) em `corrections` — nunca corrigidos por heurística.

## Import dry-run

O importer existente é a única porta de entrada para o banco
(`npm run import:translations --workspace=@kotoba/translations-importer`). Nenhum
caminho de importação específico foi criado para o v0.4. Execução do dry-run com o
dataset do release:

```text
npm run import:translations -- --file <abs>/data/pt-br/releases/v0.4/dataset.json --dry-run
```

```text
processed = 1706
duplicates = 0
wouldInsert = 1706
wouldSkip = 0
wouldReject = 0
invalidReferences = 0
```

`--dry-run` analisa sem nenhuma escrita no banco (ver gates abaixo e teste H).

## Search regression

Casos obrigatórios do v0.4 executados na suíte de integração
(`apps/api/src/integration/integration.test.ts`), sem alteração do algoritmo de busca:

| query               | esperado                                                                  | resultado |
| ------------------- | ------------------------------------------------------------------------- | --------- |
| `ver` (pt-BR)       | `見る` no topo, nunca `食べる`                                            | passa     |
| `comer` (pt-BR)     | `食べる` no topo, nunca `見る`                                            | passa     |
| `vermelhor` (pt-BR) | sem falso positivo por prefixo de "ver" (não retorna `見る` nem `食べる`) | passa     |

Os testes pré-existentes de match exato, tradução pt-BR, busca japonesa, reading,
kanji, paginação, ranking e ausência de leakage entre senses continuam passando.

## Production safety

```text
Production database modified: NO
```

Antes e depois de toda a execução (build + dry-runs + testes):

```text
translations = 15        (inalterado; apenas dataset manual dev-1)
source_imports = 2       (jmdict@2026-09-09 completed, kotoba-translations@dev-1 completed)
entries = 218753         (inalterado)
translations source kotoba-ai-experiment = 0
```

O build do v0.4 realiza apenas leituras (validação referencial) no banco de
desenvolvimento. Nenhum INSERT/UPDATE/DELETE/migration foi executado em nenhuma base.

## Staging

Não existe infraestrutura de staging separada no repositório (apenas banco de
desenvolvimento). Conforme a regra do v0.4, **não foi criada arquitetura complexa** de
staging; nesta versão foram executados:

```text
schema validation
+ reference validation
+ importer dry-run (completo, 1706 linhas)
+ search regression
```

```text
staging environment unavailable
```

## Result

```text
STAGING-READY
```

Todos os gates do release:

```text
schemaErrors = 0
invalidReferences = 0
unexpectedDuplicates = 0
structuralFieldViolations = 0
textViolations = 0
languageErrors = 0
importRejects = 0
deterministicBuild = true
searchRegressionFailures = 0
productionWrites = 0
```

## Quality gates / auditoria final

| gate                 | comando                                                            | resultado                                                                                                                            |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| testes               | `npm test`                                                         | 250/250 passando (19 arquivos; inclui v0.4 A–J)                                                                                      |
| typecheck            | `npm run typecheck`                                                | limpo                                                                                                                                |
| lint                 | `npm run lint`                                                     | limpo                                                                                                                                |
| build                | `npm run build`                                                    | ok                                                                                                                                   |
| format:check         | `npm run format:check`                                             | apenas 16 falhas pré-existentes (v0.1, v0.2, `data/schemas/pt-br.schema.json`, `experiment.test.ts`) — nenhuma introduzida pelo v0.4 |
| dataset build        | `node data/pt-br/releases/v0.4/build.mjs`                          | `staging-ready`                                                                                                                      |
| reference validation | embutida no build                                                  | `invalidReferences = 0`                                                                                                              |
| import dry-run       | `npm run import:translations -- --file .../dataset.json --dry-run` | `wouldInsert = 1706`, `wouldReject = 0`, `invalidReferences = 0`                                                                     |
| search regression    | `vitest apps/api/src/integration/integration.test.ts`              | passa (ver/comer/vermelhor)                                                                                                          |

Não existem scripts npm dedicados de "schema validation"/"dataset build" no
`package.json` (verificado); o build do release é executado via
`node data/pt-br/releases/v0.4/build.mjs` e as demais etapas usam os scripts existentes.

## Checklist final

```text
[x] v0.3b utilizado como origem
[x] validação humana incorporada, se disponível (n/a — nenhuma correção humana registrada; representada em human-review.json; nenhuma aprovação inventada)
[x] schema validado
[x] referências JMdict validadas
[x] nenhum campo estrutural duplicado
[x] duplicatas verificadas
[x] ordenação determinística
[x] checksum calculado
[x] manifest criado
[x] relatório criado
[x] importer existente utilizado
[x] dry-run executado
[x] search regression executada
[x] PostgreSQL compatível
[x] produção não modificada
[x] testes passando
[x] typecheck passando
[x] lint passando
[x] build passando
```

## Versionamento

```text
v0.3b = dataset experimental normalizado (estrutura canônica)
v0.4  = release de dataset preparada para staging   ← este artefato
v0.5  = release candidate / primeira importação de produção (futuro)
```

O v0.4 **não** é produção.
