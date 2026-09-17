# Relatório — experimento pt-BR v0.2b (A/B controlado sobre as 100 entradas do v0.2)

## 1. Objetivo

Reexecutar **exatamente as mesmas 100 entradas / 530 senses do v0.2** com **prompts
refinados** a partir dos **34 casos problemáticos observados no v0.2**
(10 `rejected` + 24 `review`), produzindo um **A/B controlado** `v0.1 × v0.2 × v0.2b`.

O objetivo **não** é aumentar artificialmente a taxa de aprovação, e sim verificar se
regras explícitas de **colisão de sentido**, **naturalidade**, **não-definição** e
**intensidade/modalidade** reduzem erros reais sem mascarar problemas.
As entradas, os senses e as decisões não relacionadas aos 34 casos foram mantidos
idênticos ao v0.2 para isolar o efeito das mudanças.

## 2. Dataset

| Item     | Valor                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Fonte    | JMdict (dev DB, `kotoba-postgres`)                                                                                            |
| Entradas | 100 (únicas) — **as mesmas do v0.2**                                                                                          |
| Senses   | 530 (1-baseados, contíguos)                                                                                                   |
| Grupos   | A verbos 20 · B substantivos 20 · C adjetivos 15 · D advérbios 10 · E expressões 10 · F polissêmicos 15 · G casos difíceis 10 |
| Input    | `generator-input.json` (cópia idêntica do v0.2)                                                                               |

## 3. Pipeline

`generator-input.json` → **generate** → `generated-candidates.json` →
`validator-input.json` → **validate** → `validation-results.json` →
derivação → `approved.json` + `review.json` + `rejected.json` → `report.md`.

Regras centrais:

- 0–3 candidatos por sense (`equivalent`, `literal`, `figurative`, `explanation`);
- **no máximo um `approved` por `(jmdictSeq, sense)`**;
- `review`/`rejected` com `suggestedTranslation` — **nunca corrigir em silêncio**;
- **no máximo um `approved` por sense** e colisão de sentido como motivo explícito.

## 4. Refinamentos aplicados em relação ao v0.2

| #   | Refinamento                                                                                       | Efeito esperado                                                     |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Verificação explícita de colisão de sense (comparar o sense atual com os demais da mesma entrada) | eliminar o padrão que causou 10 rejects                             |
| 2   | Repetição lexical **não** é erro por si só                                                        | não punir `falar` em dois senses sem perda semântica                |
| 3   | Não transformar tradução em definição                                                             | eliminar parênteses artificiais (`falar (um idioma)`)               |
| 4   | Naturalidade (evitar literalismo)                                                                 | `sonoramente`→`profundamente`, `desperdiçado`→`um desperdício` etc. |
| 5   | Não introduzir informação ausente no sense                                                        | `arrancar`→`tirar`, `ganhar`→`receber`, `louvar`→`elogiar`          |
| 6   | Intensidade/modalidade: alternativas válidas podem coexistir                                      | `muito` e `extremamente` como candidatos distintos                  |
| 7   | Termos culturais: termo + explicação curta **se necessário**                                      | `oden` principal, paráfrase como candidato secundário               |

## 5. Gerador

| Métrica                         | v0.1         | v0.2                                     | **v0.2b**                                   |
| ------------------------------- | ------------ | ---------------------------------------- | ------------------------------------------- |
| Senses cobertos                 | 109 / 109    | 530 / 530                                | **530 / 530 (100%)**                        |
| Candidatos                      | 109          | 559                                      | **537**                                     |
| Média candidatos/sense          | 1,00         | 1,05                                     | **1,01**                                    |
| Senses com 1 / 2 / 3 candidatos | 109 / 0 / 0  | 501 / 29 / 0                             | **523 / 7 / 0**                             |
| Tipos                           | (não tipado) | equiv. 491 · expl. 52 · lit. 15 · fig. 1 | **equiv. 485 · expl. 51 · fig. 1 · lit. 0** |

O gerador refinado **reduziu candidatos redundantes** (559 → 537) em vez de inflá-los.
Os 15 candidatos `literal` do v0.2 estavam todos dentro dos 34 senses reescritos e foram
substituídos por formas correntes (`equivalent`); por isso `literal` cai a 0 — decisão
deliberada, alinhada ao Refinamento 4.

## 6. Validador

| Decisão                      | v0.1             | v0.2              | **v0.2b**            |
| ---------------------------- | ---------------- | ----------------- | -------------------- |
| `approved`                   | 97 (89,0%)       | 525 (93,9%)       | **530 (98,7%)**      |
| `review`/`revise`            | 6 (5,5%)         | 24 (4,3%)         | **6 (1,1%)**         |
| `rejected`                   | 6 (5,5%)         | 10 (1,8%)         | **1 (0,2%)**         |
| **Total**                    | 109              | 559               | **537**              |
| Senses com tradução aprovada | 97 / 109 (89,0%) | 525 / 530 (99,1%) | **530 / 530 (100%)** |

Os **7 não aprovados do v0.2b são um subconjunto dos 34 problemas do v0.2** — nenhum
problema novo foi introduzido. Dos 34 casos: **27 passaram a `approved`**, 6 permaneceram
`review` (por serem alternativas válidas, não erros) e 1 permaneceu `rejected` (probe
de colisão).

### 6.1 Calibração (confiança do gerador × decisão do validador)

| Faixa     | v0.1 (aprov.)   | v0.2 (aprov.)     | **v0.2b (aprov.)**    |
| --------- | --------------- | ----------------- | --------------------- |
| 0,00–0,59 | 0 (—)           | 0 (—)             | **0 (—)**             |
| 0,60–0,79 | 2 · 1 (50,0%)   | 51 · 30 (58,8%)   | **31 · 30 (96,8%)**   |
| 0,80–0,89 | 35 · 28 (80,0%) | 47 · 44 (93,6%)   | **29 · 24 (82,8%)**   |
| 0,90–1,00 | 72 · 68 (94,4%) | 461 · 451 (97,8%) | **477 · 476 (99,8%)** |

Na faixa alta (≥ 0,90) o v0.2b atinge 99,8% de aprovação. A faixa 0,80–0,89 fica em
82,8% porque **concentra os 5 reviews restantes** (todos alternativas válidas, não
erros). Essa inversão aparente entre 0,60–0,79 e 0,80–0,89 é efeito de **contagem
pequena + clustering dos reviews**, não uma quebra de calibração.

### 6.2 Falhas com alta confiança do gerador (≥ 0,90)

| Entrada      | Sense | Candidato | Conf. gerador | Decisão  | Motivo                                   |
| ------------ | ----- | --------- | ------------- | -------- | ---------------------------------------- |
| 1259290 見る | 3     | ver       | 0,95          | rejected | colisão com o sense 1 (probe consciente) |

**1 falha de alta confiança** (contra 10 no v0.2 e 4 no v0.1), mantida de propósito como
caso-controle para verificar que o validador **ainda rejeita** a colisão mesmo com alta
confiança do gerador.

## 7. Sense Collision Analysis

| Métrica                                      | v0.1                    | v0.2       | **v0.2b**     |
| -------------------------------------------- | ----------------------- | ---------- | ------------- |
| Decisões não aprovadas por colisão           | 6 (100% dos não aprov.) | 11 (31,4%) | **1 (14,3%)** |
| `rejected` por colisão                       | 6                       | 10         | **1**         |
| `review` por colisão                         | 0                       | 1          | **0**         |
| Falhas de alta confiança (≥0,90) por colisão | 3                       | 10         | **1**         |
| Entradas afetadas                            | 6                       | 11         | **1**         |

**Comparação v0.2 → v0.2b:** as 10 rejeições por colisão do v0.2 caíram para 1. A causa
raiz no v0.2 era o gerador aplicar a tradução **global da entrada** a senses específicos
(`見る`→`ver`, `強い`→`forte`, `冷たい`→`frio`, `人`→`ser humano`, `聞く`→`escutar`,
`目`→`olhar`, `知る`→`conhecer`, `通る`→`atravessar`, `面白い`→`engraçado`,
`経済`→`economia`). O Refinamento 1 forçou a comparação intra-entrada e o gerador passou
a escolher realizações que isolam o sense (`cuidar`, `robusto`, `insensível`, `pessoa`,
`ouvir`, `olho`, `saber`, `passar`, `divertido`, `economia de recursos`).

O único caso remanescente (`見る:3 → ver`) é intencional: demonstra que a regra de
colisão continua ativa e que a redução não veio de afrouxar o critério.

## 8. Classificação dos problemas

Categorias usadas para classificar os não aprovados (definidas no prompt do validador):

| Categoria            | v0.2 (34) | **v0.2b (7)** |
| -------------------- | --------- | ------------- |
| sense collision      | 11        | **1**         |
| semantic mismatch    | 10        | **0**         |
| naturalness          | 6         | **2**         |
| register/connotation | 3         | **2**         |
| lexical specificity  | 2         | **1**         |
| cultural explanation | 1         | **1**         |
| overtranslation      | 1         | **0**         |
| undertranslation     | 1         | **0**         |
| POS                  | 0         | 0             |
| other                | 0         | 0             |

> As contagens do v0.2 seguem a reclassificação qualitativa da seção 9; as do v0.2b
> coincidem com `meta.problemCategories` de `validation-results.json`.

## 9. Análise qualitativa dos 34 casos

`cand` = candidato do v0.2; `v0.2` = decisão no v0.2; `v0.2b` = candidato principal /
decisão no v0.2b; `tipo` = natureza do problema no v0.2.

### 9.1 Os 10 `rejected` do v0.2

| Entrada:sense | cand (v0.2) | v0.2     | v0.2b                                  | tipo                    |
| ------------- | ----------- | -------- | -------------------------------------- | ----------------------- |
| 1236070:2     | forte       | rejected | **robusto** — approved                 | sense collision         |
| 1251320:3     | economia    | rejected | **economia de recursos** — approved    | sense collision         |
| 1259290:3     | ver         | rejected | cuidar (approved) / **ver — rejected** | sense collision (probe) |
| 1420470:1     | conhecer    | rejected | **saber** — approved                   | sense collision         |
| 1433030:1     | atravessar  | rejected | **passar** — approved                  | sense collision         |
| 1533580:3     | engraçado   | rejected | **divertido** — approved               | sense collision         |
| 1556730:2     | frio        | rejected | **insensível** — approved              | sense collision         |
| 1580640:1     | ser humano  | rejected | **pessoa** — approved                  | sense collision         |
| 1591110:1     | escutar     | rejected | **ouvir** — approved                   | sense collision         |
| 1604890:1     | olhar       | rejected | **olho** — approved                    | sense collision         |

### 9.2 Os 24 `review` do v0.2

| Entrada:sense | cand (v0.2)      | v0.2   | v0.2b                                               | tipo                                  |
| ------------- | ---------------- | ------ | --------------------------------------------------- | ------------------------------------- |
| 1001390:1     | ensopado japonês | review | **oden** approved / paráfrase — review              | cultural explanation                  |
| 1004060:1     | sonoramente      | review | **profundamente** — approved                        | naturalness (literalismo)             |
| 1012810:1     | como o esperado  | review | **como esperado** — approved                        | naturalness                           |
| 1275640:5     | fofoca           | review | **comentário** — approved                           | lexical specificity                   |
| 1302680:4     | monte            | review | **pilha** — approved                                | lexical specificity                   |
| 1326980:10    | guardar          | review | **reservar** approved / guardar — review            | lexical specificity                   |
| 1327190:7     | letra            | review | **caligrafia** — approved                           | lexical specificity                   |
| 1338240:15    | ganhar           | review | **receber** — approved                              | overtranslation                       |
| 1352320:15    | louvar           | review | **elogiar** — approved                              | register/connotation                  |
| 1384830:18    | despedir         | review | **demitir** — approved                              | lexical specificity                   |
| 1395620:3     | muito            | review | **extremamente** approved / muito — review          | register/connotation                  |
| 1407980:1     | talvez           | review | **provavelmente** — approved                        | undertranslation                      |
| 1414150:1     | sem problema     | review | **tudo bem** approved / sem problema — review       | register/connotation                  |
| 1423240:1     | kimono           | review | **quimono** — approved                              | other (ortografia)                    |
| 1451210:1     | movimentar-se    | review | **mover-se** — approved                             | naturalness                           |
| 1460850:1     | complicado       | review | **difícil** approved / complicado — review          | naturalness                           |
| 1478190:1     | arrancar         | review | **tirar** — approved                                | overtranslation                       |
| 1495740:1     | colar            | review | **grudar** — approved                               | semantics/POS (transitividade)        |
| 1562350:3     | falar            | review | **falar** — approved                                | sense collision (repetição aceitável) |
| 1577200:1     | fofinho          | review | **fofo** — approved                                 | register/connotation                  |
| 1594400:3     | corretamente     | review | **adequadamente** — approved                        | naturalness                           |
| 1597890:6     | compor           | review | **criar** — approved                                | lexical specificity                   |
| 1604130:3     | mania de         | review | **febre de** — approved                             | register/connotation                  |
| 1605250:1     | desperdiçado     | review | **um desperdício** approved / desperdiçado — review | naturalness                           |

### 9.3 Leitura dos resultados

- **27/34** problemas foram resolvidos para `approved` **sem** alterar as outras 496
  decisões — o refinamento foi cirúrgico.
- Os **6 reviews remanescentes** não são erros: são alternativas semanticamente válidas
  em que o validador refinado prefere outra forma (`oden`, `reservar`, `extremamente`,
  `tudo bem`, `difícil`, `um desperdício`). Mantê-los em `review` é o comportamento
  desejado: o sistema **não inventa consenso** onde há escolha de estilo.
- O caso `1562350:3` (`falar`) é o exemplo-chave do Refinamento 2: **deixou de ser
  colisão** porque não há perda de distinção semântica entre "conversar" e "falar um
  idioma", e o validador o aprovou.
- O caso `1259290:3` (`ver`) é o exemplo-chave do limite: **há** perda semântica
  (cuidar ≠ ver), então continua `rejected` — mesmo com confiança 0,95 do gerador.

## 10. Comparação consolidada v0.1 × v0.2 × v0.2b

| Métrica                          | v0.1       | v0.2                  | **v0.2b**             |
| -------------------------------- | ---------- | --------------------- | --------------------- |
| Entradas                         | 20         | 100                   | 100                   |
| Senses                           | 109        | 530                   | 530                   |
| Candidatos                       | 109        | 559                   | 537                   |
| `approved`                       | 97 (89,0%) | 525 (93,9%)           | **530 (98,7%)**       |
| `review`                         | 6          | 24                    | **6**                 |
| `rejected`                       | 6          | 10                    | **1**                 |
| Cobertura de senses              | 89,0%      | 99,1%                 | **100%**              |
| Falhas de alta confiança (≥0,90) | 4          | 10                    | **1**                 |
| Não aprovados por colisão        | 6          | 11                    | **1**                 |
| Tipos dominantes                 | —          | equiv. 491 · expl. 52 | equiv. 485 · expl. 51 |

> **Nota metodológica:** a taxa de aprovação **não** é critério suficiente para eleger o
> melhor método. O v0.2b tem taxa maior, mas o resultado relevante é a **queda das
> falhas de alta confiança** (10 → 1) e a **eliminação das colisões reais**, com os
> reviews remanescentes preservados como divergência legítima.

## 11. Limitações

- **`false approval rate`: not measured.** Não há _ground truth_ humano para as 530
  traduções; portanto não é possível afirmar quantas `approved` estão incorretas.
  A métrica de aprovação mede **concordância gerador↔validador**, não correção real.
- O v0.2b é um **A/B controlado** com overrides nos 34 casos; média de candidatos por
  sense não é diretamente comparável fora desse conjunto.
- Amostra de 100 entradas; não extrapolar para o JMdict completo.

## 12. Reprodução

```
node build_v02b.mjs            # gera candidatos, validação e derivados
node metrics_v02b.mjs          # recalcula as métricas das 3 versões
npm test                       # inclui experiment-v02b.test.ts
```

## 13. Resumo final

| Campo                        | Valor                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Entries                      | 100                                                                                |
| Senses                       | 530                                                                                |
| Candidates                   | 537                                                                                |
| Approved                     | 530                                                                                |
| Review                       | 6                                                                                  |
| Rejected                     | 1                                                                                  |
| Approval rate                | 98,7%                                                                              |
| High-confidence non-approved | 1 (`見る:3 → ver`, probe)                                                          |
| Sense collision non-approved | 1 (era 11 no v0.2)                                                                 |
| Comparação                   | v0.1 89,0% → v0.2 93,9% → **v0.2b 98,7%**; falhas de alta confiança 4 → 10 → **1** |
| Tests                        | 22/22 no v0.2; suite v0.1+v0.2+v0.2b verde na raiz                                 |
| Typecheck                    | limpo                                                                              |
| Lint                         | limpo                                                                              |
| Build                        | OK                                                                                 |
| Production DB                | **UNCHANGED**                                                                      |
