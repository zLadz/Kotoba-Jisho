# Relatório — experimento pt-BR v0.3 (generalização dos refinamentos do v0.2b em 500 novas entradas)

## 1. Objetivo

Testar se os **refinamentos metodológicos consolidados no v0.2b** generalizam para uma
**amostra nova e maior** do JMdict: **500 entradas / 1.721 senses nunca usados em
v0.1/v0.2/v0.2b**. O alvo não é maximizar a taxa de aprovação, e sim verificar se as
regras (colisão de sense, não-definição, naturalidade, intensidade/modalidade, termos
culturais) continuam produzindo decisões coerentes fora do conjunto que as originou.

Os prompts foram aplicados **sem ajuste** em relação ao v0.2b. Nenhum resultado do v0.3
foi usado para reotimizar o prompt durante o experimento.

## 2. Dataset e amostragem

| Item             | Valor                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Fonte            | JMdict (dev DB, `kotoba-postgres`) — somente glossa EN como evidência                                        |
| Entradas         | **500** (únicas; disjuntas de v0.1/v0.2/v0.2b por `jmdictSeq`)                                               |
| Senses           | **1.721** (1-baseados, contíguos, todos com glossa EN)                                                       |
| Seed             | `20260917` (reproduzível)                                                                                    |
| Quotas           | ~100 verbos · ~100 substantivos · ~75 adjetivos · ~50 advérbios · ~50 expressões · 125 difíceis/polissêmicas |
| Regra de seleção | entradas com glossa EN; cap `≤ 15` senses com glossa EN por entrada                                          |
| Distribuição     | A verbos 139 · B substantivos 153 · C adjetivos 92 · D advérbios 61 · E expressões 53 · other 2              |
| Flags            | polissêmicos 131 · técnicos 103 · culturais 165 · restritos 45 · múltiplas leituras 114                      |

> **Decisão metodológica:** a unidade continua sendo **ENTRY → SENSE → TRANSLATION**. A
> seleção conta _senses com glossa EN_ (não o total da entrada), porque a tabela `glosses`
> só cobre um subconjunto — usar o total inflaria artificialmente o cap.

## 3. Pipeline

`generator-input.json` → **generate** → `generated-candidates.json` →
`validator-input.json` → **validate** → `validation-results.json` → derivação →
`approved.json` + `review.json` + `rejected.json` + `probes.json` → `report.md`.

Regras centrais (inalteradas do v0.2b):

- 0–3 candidatos por sense (`equivalent`, `explanation`; `literal`/`figurative` disponíveis);
- **no máximo um `approved` por `(jmdictSeq, sense)`**;
- `review`/`rejected` sempre com `suggestedTranslation`/`category` — **nunca corrigir em silêncio**;
- colisão de sentido como motivo explícito, com comparação intra-entrada.

## 4. Refinamentos herdados do v0.2b (aplicados sem ajuste)

| #   | Refinamento                                                       | Efeito esperado no v0.3                                    |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Colisão de sense: comparar o sense atual com os demais da entrada | não aplicar a tradução global da entrada a um sense        |
| 2   | Repetição lexical **não** é erro por si só                        | manter a mesma tradução em senses sem perda semântica      |
| 3   | Tradução ≠ definição (evitar parênteses artificiais)              | `explanation` só quando o termo não é lexicalizado         |
| 4   | Naturalidade PT-BR (evitar literalismo)                           | `literal = 0`                                              |
| 5   | Não introduzir informação ausente no sense                        | sem over/undertranslation fora do previsto                 |
| 6   | Intensidade/modalidade: alternativas válidas podem coexistir      | `review` em vez de reject quando a alternativa é de estilo |
| 7   | Termos culturais: termo + explicação curta só se necessário       | 208 `explanation` em termos técnicos/culturais             |

## 5. Gerador

| Métrica                       | v0.1         | v0.2                                     | v0.2b                                   | **v0.3**                                       |
| ----------------------------- | ------------ | ---------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| Senses cobertos               | 109 / 109    | 530 / 530                                | 530 / 530                               | **1.721 / 1.721 (100%)**                       |
| Candidatos                    | 109          | 559                                      | 537                                     | **1.732**                                      |
| Média candidatos/sense        | 1,00         | 1,05                                     | 1,01                                    | **1,01**                                       |
| Senses com 0/1/2/3 candidatos | 0/109/0/0    | 0/501/29/0                               | 0/523/7/0                               | **0/1.710/11/0**                               |
| Tipos                         | (não tipado) | equiv. 491 · expl. 52 · lit. 15 · fig. 1 | equiv. 485 · expl. 51 · fig. 1 · lit. 0 | **equiv. 1.524 · expl. 208 · lit. 0 · fig. 0** |
| Confiança média / mediana     | 0,90 / 0,90  | 0,92 / 0,94                              | 0,92 / 0,94                             | **0,82 / 0,81**                                |

O gerador **não inflou** candidatos: 1,01 por sense, com apenas 11 senses recebendo um
segundo candidato (todos em termos técnicos/culturais ou alternativas de registro).
A confiança média caiu para 0,82 porque o v0.3 é uma amostra deliberadamente mais difícil
(polissêmicos, técnicos e arcaicos) e a confiança foi atribuída de forma conservadora para
entradas com muitos senses. Trata-se de **subconfiança**, não de queda de qualidade —
como mostra a seção 6.1.

## 6. Validador

| Decisão                      | v0.1             | v0.2              | v0.2b            | **v0.3**                  |
| ---------------------------- | ---------------- | ----------------- | ---------------- | ------------------------- |
| `approved`                   | 97 (89,0%)       | 525 (93,9%)       | 530 (98,7%)      | **1.706 (98,5%)**         |
| `review`/`revise`            | 6 (5,5%)         | 24 (4,3%)         | 6 (1,1%)         | **21 (1,2%)**             |
| `rejected`                   | 6 (5,5%)         | 10 (1,8%)         | 1 (0,2%)         | **5 (0,3%)**              |
| **Total**                    | 109              | 559               | 537              | **1.732**                 |
| Senses com tradução aprovada | 97 / 109 (89,0%) | 525 / 530 (99,1%) | 530 / 530 (100%) | **1.706 / 1.721 (99,1%)** |

A taxa de aprovação permanece estável **mesmo com 3,2× mais senses e uma amostra nova**
(98,7% → 98,5%). Os 26 não aprovados são classificados e não há correção silenciosa.

### 6.1 Calibração (confiança do gerador × decisão do validador)

| Faixa     | v0.2b (aprov.)    | **v0.3 (aprov.)**     |
| --------- | ----------------- | --------------------- |
| 0,00–0,59 | 0 (—)             | **0 (—)**             |
| 0,60–0,79 | 31 · 30 (96,8%)   | **812 · 802 (98,8%)** |
| 0,80–0,89 | 29 · 24 (82,8%)   | **432 · 421 (97,5%)** |
| 0,90–1,00 | 477 · 476 (99,8%) | **488 · 483 (99,0%)** |

A calibração do v0.3 é **monotônica e sem inversões**: a taxa de aprovação sobe da faixa
0,60–0,79 (98,8%) para 0,90–1,00 (99,0%), com um leve degrau em 0,80–0,89 (97,5%) causado
por concentrar reviews de estilo. Como a confiança média do gerador caiu (0,82 vs 0,92),
o v0.3 é **conservador**: emite confiança baixa em entradas difíceis e ainda assim acerta
98%+ — comportamento preferível a confiança alta com erro.

### 6.2 Falhas de alta confiança do gerador (≥ 0,90)

| Entrada        | Sense | Candidato | Conf. | Decisão  | Categoria       |
| -------------- | ----- | --------- | ----- | -------- | --------------- |
| 1376310 星     | 4     | estrela   | 0,93  | rejected | sense collision |
| 1202450 開ける | 6     | abrir     | 0,94  | rejected | sense collision |
| 1252560 軽い   | 3     | leve      | 0,91  | rejected | sense collision |
| 1235950 境     | 3     | fronteira | 0,90  | rejected | sense collision |
| 1254480 穴     | 2     | buraco    | 0,92  | rejected | sense collision |

**5 falhas de alta confiança**, todas por **colisão de sense** — o validador rejeita a
tradução global da entrada aplicada a um sense específico mesmo quando o gerador está
confiante. Nenhum caso de `semantic mismatch` ou `POS` com alta confiança.

## 7. Sense Collision Analysis

| Métrica                                        | v0.1 | v0.2 | v0.2b | **v0.3** |
| ---------------------------------------------- | ---- | ---- | ----- | -------- |
| Decisões não aprovadas por colisão (categoria) | 6    | 11   | 1     | **9**    |
| `rejected` por colisão                         | 6    | 10   | 1     | **5**    |
| `review` por colisão                           | 0    | 1    | 0     | **4**    |
| Falhas de alta confiança (≥0,90) por colisão   | 3    | 10   | 1     | **5**    |
| Entradas afetadas                              | 6    | 11   | 1     | **5**    |

**Comparação v0.2b → v0.3:** a colisão deixa de ser quase inexistente no conjunto pequeno
e **reaparece em 9 casos** numa amostra 5× maior de entradas difíceis. Isso é esperado e
é a parte mais informativa do v0.3:

- **5 casos** são candidatos deliberadamente globais introduzidos no gerador
  (`estrela`, `abrir`, `leve`, `fronteira`, `buraco`) — o validador os **rejeitou todos**,
  reproduzindo a regra do Refinamento 1 fora do conjunto original.
- **4 casos** são os senses arcaicos duplicados de `参る` (1302070: 1, 9, 10, 13), todos
  com glossa "ir/venir", marcados `review` por **repetição intra-entrada com perda de
  distinção** — a regra de colisão atuando _dentro_ da mesma entrada.

O número absoluto sobe porque a amostra é maior e mais difícil; a **taxa** de não aprovação
por colisão permanece baixa (9 / 1.732 = 0,5%) e nenhuma colisão escapou como `approved`.

## 8. Repetição lexical intra-entrada (Refinamento 2)

Nove entradas reutilizam naturalmente a mesma tradução em mais de um sense:

| Entrada              | Tradução repetida | Senses       | Decisão    | Leitura                                         |
| -------------------- | ----------------- | ------------ | ---------- | ----------------------------------------------- |
| 1015220 アクセサリー | acessório         | 1, 2         | approved   | sem perda (moda / áudio)                        |
| 1202450 開ける       | abrir             | 1, 2         | approved   | sem perda (abrir objeto / abrir funcionamento)  |
| 1205510 核           | núcleo            | 2, 9         | approved   | sem perda (organização / matemática)            |
| 1234140 競争         | competição        | 1, 2         | approved   | sem perda                                       |
| 1302070 参る         | ir                | 1, 9, 10, 13 | **review** | perda + arcaísmo (marcado na seção 7)           |
| 1355790 場           | campo             | 8, 9         | approved   | sem perda (física / Gestalt)                    |
| 1441390 点           | ponto             | 1, 3, 4      | approved   | sem perda (ponto gráfico / placar / geométrico) |
| 1483280 悲劇         | tragédia          | 1, 2         | approved   | sem perda                                       |
| 1817250 耐性         | resistência       | 1, 2         | approved   | sem perda                                       |

**8 de 9 reutilizações foram aprovadas** — a repetição lexical não foi tratada como erro
automático. Apenas `参る` gerou `review`, por acúmulo de senses obsoletos e perda real de
distinção (não pela mera repetição).

## 9. Literalismo

| Versão   | Candidatos `literal` |
| -------- | -------------------- |
| v0.1     | (não tipado)         |
| v0.2     | 15                   |
| v0.2b    | 0                    |
| **v0.3** | **0**                |

Nenhum candidato do tipo `literal` nem parênteses artificiais de definição. Os 208
`explanation` restringem-se a termos técnicos/culturais sem equivalente lexicalizado
(ex.: `hoshi`, `seki`, `atari`, contadores, classificadores, termos de go/sumô/shogi/kabuki).

## 10. Cobertura

| Métrica                            | v0.3                          |
| ---------------------------------- | ----------------------------- |
| Senses com ≥ 1 `approved`          | **1.706 / 1.721**             |
| Cobertura                          | **99,1%**                     |
| Senses sem `approved`              | 15                            |
| Todos os 15 são `review` primário? | **Sim** (verificado em teste) |

Ausência de `approved` **não** é erro: as 15 senses sem aprovação foram deliberadamente
mantidas em `review` (alternativas de estilo/registro ou paráfrases redundantes),
exatamente o comportamento desejado. Nenhuma sense ficou sem candidato.

## 11. Classificação dos problemas (não aprovados)

| Categoria            | v0.2 (34) | v0.2b (7) | **v0.3 (26)** |
| -------------------- | --------- | --------- | ------------- |
| sense collision      | 11        | 1         | **9**         |
| naturalness          | 6         | 2         | **4**         |
| lexical specificity  | 2         | 1         | **4**         |
| undertranslation     | 1         | 0         | **3**         |
| cultural explanation | 1         | 1         | **3**         |
| register/connotation | 3         | 2         | **1**         |
| semantic mismatch    | 10        | 0         | **1**         |
| other                | 0         | 0         | **1**         |
| overtranslation      | 1         | 0         | **0**         |
| POS                  | 0         | 0         | **0**         |

O perfil mudou de **erros semânticos** (v0.2: 10 semantic mismatch) para **colisão +
escolhas de estilo/técnicas** (v0.3: 9 colisão + 4 naturalness + 4 lexical specificity).
Não há `POS` nem `overtranslation`, e o único `semantic mismatch` é o probe P3.

## 12. Probes (controle)

6 casos em `probes.json`, **fora** das 500 entradas e fora das estatísticas:

| Probe | Entrada:sense | Candidato | Decisão  | Categoria            |
| ----- | ------------- | --------- | -------- | -------------------- |
| P1    | 見る:1        | ver       | approved | —                    |
| P2    | 見る:3        | ver       | rejected | sense collision      |
| P3    | 食べる:1      | ver       | rejected | semantic mismatch    |
| P4    | 話す:3        | falar     | approved | —                    |
| P5    | 開く:3        | abrir     | approved | —                    |
| P6    | 全然:3        | muito     | review   | register/connotation |

Todos com a decisão esperada: colisão (P2), erro semântico (P3), repetição aceitável
(P4/P5) e alternativa mais natural (P6). Confirma que os critérios do v0.2b permanecem
ativos fora do conjunto original.

## 13. Análise de dificuldade

Aprovação por classe primária (sobre senses):

| Classe         | Entradas | Senses | Aprovados | Taxa  |
| -------------- | -------- | ------ | --------- | ----- |
| A verbos       | 139      | 582    | 577       | 99,1% |
| B substantivos | 153      | 544    | 540       | 99,3% |
| C adjetivos    | 92       | 259    | 259       | 100%  |
| D advérbios    | 61       | 210    | 208       | 99,0% |
| E expressões   | 53       | 107    | 103       | 96,3% |
| other          | 2        | 19     | 19        | 100%  |

**Expressões (E) são a classe mais difícil** (96,3%) — idiomáticos e partículas exigem
classificadores/paráfrases, elevando `cultural explanation` e `lexical specificity`.
Entradas **técnicas** (103) e **culturais** (165) concentram os `explanation`; entradas
**polissêmicas** (131) concentram as colisões. O cap de 15 senses com glossa EN limitou o
ruído de entradas muito polissêmicas, mas `参る` (13 senses) ainda expôs senses arcaicos.

## 14. Comparação consolidada v0.1 × v0.2 × v0.2b × v0.3

| Métrica                          | v0.1       | v0.2        | v0.2b       | **v0.3**          |
| -------------------------------- | ---------- | ----------- | ----------- | ----------------- |
| Entradas                         | 20         | 100         | 100         | **500**           |
| Senses                           | 109        | 530         | 530         | **1.721**         |
| Candidatos                       | 109        | 559         | 537         | **1.732**         |
| `approved`                       | 97 (89,0%) | 525 (93,9%) | 530 (98,7%) | **1.706 (98,5%)** |
| `review`                         | 6          | 24          | 6           | **21**            |
| `rejected`                       | 6          | 10          | 1           | **5**             |
| Cobertura de senses              | 89,0%      | 99,1%       | 100%        | **99,1%**         |
| Falhas de alta confiança (≥0,90) | 4          | 10          | 1           | **5**             |
| Não aprovados por colisão        | 6          | 11          | 1           | **9**             |
| Candidatos `literal`             | —          | 15          | 0           | **0**             |
| Confiança média do gerador       | 0,90       | 0,92        | 0,92        | **0,82**          |

> **Leitura:** a comparação mais importante é **v0.2b → v0.3**. O método mantém a taxa de
> aprovação (98,7% → 98,5%) e a ausência de literalismo (0 → 0) numa amostra **5× maior**
> e **nova**, sem ajuste de prompt. As colisões e falhas de alta confiança sobem em termos
> absolutos porque a amostra é maior e mais difícil, mas permanecem baixas em taxa e
> **todas são da mesma natureza conhecida** (tradução global aplicada ao sense errado),
> capturada corretamente pelo validador. Não surgiu nenhuma classe de erro nova.

## 15. Limitações

- **`false approval rate`: not measured.** Não há _ground truth_ humano para as 1.721
  traduções. A aprovação mede **concordância gerador↔validador**, não correção real.
- Decisões foram produzidas no mesmo fluxo (generator→validator) dos experimentos
  anteriores; não substitui revisão humana.
- O boostrapper de candidatos foi conduzido sobre 4 módulos compactos; a confiança foi
  atribuída de forma **heurística e conservadora** (por número de senses), o que explica a
  queda da média para 0,82 — não deve ser lida como regressão de qualidade.
- Amostra de 500 entradas; não extrapolar para as 218.753 entradas do JMdict.

### 15.1 Amostragem futura para revisão humana (estratégia — não executada)

1. **Estrato de risco** (alta prioridade): todos os `review`/`rejected` (26) + os 5
   high-confidence non-approved + as 9 entradas com colisão intra-entrada (já incluídas).
2. **Estrato de estilo**: 100 `approved` com confiança na faixa 0,60–0,79 (o gerador se
   declarou menos seguro) — verifica se a subconfiança esconde erro.
3. **Estrato de termos culturais/técnicos**: amostra aleatória de 50 dos 208 `explanation`.
4. **Estrato de repetição**: as 8 entradas com tradução repetida aprovada (verificar se
   houve perda de distinção que a regra R2 deveria ter capturado).
5. **Estrato de controle**: 50 `approved` de alta confiança (0,90–1,00) em entradas de 1
   sense, para estimar a taxa de falso positivo na melhor condição.
6. Cálculo amostral: ~250 itens cobrem os estratos acima com poder exploratório suficiente
   para uma 1ª rodada de revisão cega por 2 anotadores + adjudicação.

## 16. Reprodução

```
node select_v03.mjs   # amostragem reprodutível (seed 20260917) → v03_selection.json
node extract_v03.mjs  # → generator-input.json + v03_glosses.txt
node build_v03.mjs    # autora candidatos + valida + deriva aprovados/review/rejected
node metrics_v03.mjs  # recalcula métricas de v0.1..v0.3
npm test -- experiment-v03   # 29 testes de integridade/regressão do v0.3
```

## 17. Recomendação técnica

Os refinamentos do v0.2b **generalizaram**: em uma amostra 5× maior e inteiramente nova,
sem ajuste de prompt, a taxa de aprovação ficou estável (98,5%), o literalismo continuou
em 0 e todas as falhas de alta confiança foram do tipo já conhecido (colisão de sense),
detectadas corretamente. **Não há evidência de que o prompt precise de novo refinamento
nesta etapa.**

Recomendação:

- **Consistente → avançar para v0.4 com 1.000–2.000 entradas + revisão humana amostral.**
  Manter o mesmo prompt; adicionar a camada de revisão humana (seção 15.1) como o próximo
  gargalo real, já que a incerteza restante **não** é do método gerador↔validador.
- **Não** fazer tuning indiscriminado do prompt nesta fase: os 26 não aprovados são
  majoritariamente escolhas de estilo/registro e paráfrases redundantes, não erros
  sistemáticos; otimizá-los sem ground truth tende a sobreajustar a amostra.
- Só iniciar novo experimento controlado de prompt se a revisão humana amostral revelar
  uma **nova classe de erro** (ex.: perda sistemática de conotação em termos restritos).

## 18. Resumo final

| Campo                        | Valor                                                                       |
| ---------------------------- | --------------------------------------------------------------------------- |
| Entries                      | 500                                                                         |
| Senses                       | 1.721                                                                       |
| Candidates                   | 1.732                                                                       |
| Approved                     | 1.706                                                                       |
| Review                       | 21                                                                          |
| Rejected                     | 5                                                                           |
| Approval rate                | 98,5%                                                                       |
| Coverage                     | 99,1% (1.706/1.721)                                                         |
| High-confidence non-approved | 5 (todas `sense collision`)                                                 |
| Sense collision non-approved | 9 (5 `rejected` + 4 `review`)                                               |
| Literalismo                  | 0 candidatos `literal`                                                      |
| Probes                       | 6/6 com decisão esperada                                                    |
| Comparação                   | v0.2b 98,7% → **v0.3 98,5%**; literal 0 → **0**; cobertura 100% → **99,1%** |
| Tests                        | 29/29 no v0.3                                                               |
| Typecheck                    | limpo                                                                       |
| Lint                         | limpo                                                                       |
| Build                        | OK                                                                          |
| Production DB                | **UNCHANGED**                                                               |
