# Experimento v0.1 — Geração e validação da base pt-BR (Kotoba)

- **Data de extração/geração**: 2026-09-15
- **Fonte estrutural**: JMdict (dev DB `kotoba-postgres`, banco `kotoba`)
- **Unidade de tradução**: ENTRY + SENSE (sense 1-baseado)
- **Artefatos**: `generator-prompt.md`, `validator-prompt.md`, `generator-input.json`,
  `generated-candidates.json`, `validation-results.json`, `approved.json`,
  `data/schemas/pt-br.schema.json`, `report.md` (este), testes automatizados.
- **Escopo**: 20 entradas reais, 109 blocos de sentido com glossas primárias em inglês.
- **Mudança de produção**: nenhuma. Nenhum dado foi gravado no PostgreSQL de produção;
  tudo reside sob `data/pt-br/experiments/v0.1/` + `data/schemas/`.

## 1. Objetivo

Avaliar de forma controlada e reproduzível se um pipeline de IA (gerador + validador
independente) consegue produzir uma semente de base pt-BR de qualidade, por sentido,
sem contaminação de datasets existentes (nenhum jmdict-pt/Tatoeba/curation manual foi
consultado — a estrutura JMdict serviu como fonte de verdade).

## 2. Pipeline

1. **Extração** (real, do dev DB): 20 entradas reais selecionadas conforme a distribuição
   alvo (6–7 verbos, 4–5 adjetivos, 5 substantivos, 3 advérbios/expressões, 2 entradas
   deliberadamente polissêmicas). Sentidos considerados: blocos contínuos de glossas em
   inglês (`en`) do dev DB — blocos multilíngues subsequentes (dut/ger/fre/hun/rus/slv/spa/swe)
   ficam fora do escopo v0.1 por serem re-renderizações dos mesmos significados.
2. **Geração** (`generator-prompt.md` → `generator-input.json` →
   `generated-candidates.json`): um candidato por sense, com `text`, `confidence` e
   `reason` rastreável.
3. **Validação independente** (`validator-prompt.md` → `validation-results.json`): a
   validadora recebe apenas o input (fonte de verdade) e os candidatos; decide
   `approved`/`revise`/`rejected`, sem alterar silenciosamente o texto.
4. **Aprovação final** (`approved.json`): apenas decisões `approved`, já com
   `source`/`sourceVersion` no formato consumível pelo importador.

## 3. Dataset

| jmdictSeq | Entrada | Leitura | Classe | Sentidos (EN) |
|----------:|---------|---------|--------|--------------:|
| 1358280 | 食べる/喰べる | たべる | verbo (vt) | 2 |
| 1259290 | 見る/観る/視る/覧る | みる | verbo (vt/aux) | 6 |
| 1578850 | 行く/往く | いく/ゆく | verbo (vi/aux) | 12 |
| 1547720 | 来る/來る | くる | verbo (vi/aux) | 5 |
| 1606560 | 分かる/解る/判る/分る/理解る | わかる | verbo (vi) | 3 |
| 1326980 | 取る | とる | verbo (vt, polissêmico) | 18 |
| 1157170 | 為る (する) | する | verbo (vs-i/aux, polissêmico extremo) | 17 |
| 1588880 | 大きい/巨きい | おおきい | adjetivo -i | 5 |
| 1283190 | 高い/高価い | たかい | adjetivo -i (polissêmico) | 5 |
| 1213400 | 甘い | あまい | adjetivo -i (polissêmico) | 9 |
| 1591900 | 綺麗/奇麗/暉麗 | きれい | adjetivo -na | 3 |
| 1310460 | 上手い/美味い/旨い | うまい | adjetivo -i (polissêmico) | 3 |
| 1323080 | 車 | くるま | substantivo concreto | 2 |
| 1206900 | 学生/學生 | がくせい | substantivo concreto | 1 |
| 1582710 | 日本 | にほん/にっぽん | substantivo próprio | 1 |
| 1156530 | 意見 | いけん | substantivo abstrato | 2 |
| 1536010 | 問題 | もんだい | substantivo (polissêmico) | 5 |
| 1008630 | 迚も (とても) | とても | advérbio | 2 |
| 1188890 | 何時も (いつも) | いつも | advérbio | 3 |
| 1527110 | 未だ (まだ) | まだ/いまだ | advérbio/adj-na | 5 |
| **Total** | **20 entradas** | | | **109 sentidos (EN)** |

Seleção: 7 verbos, 5 adjetivos, 5 substantivos, 3 advérbios/expressões; 2 entradas
explícitas para stress-test de polissemia (取る e する). A distribuição ajusta-se à
estrutura real do JMdict (entradas como する têm 37 senses no total, dos quais 17 são
blocos EN).

## 4. Resultado da validação

| Decisão | Qtd | % | Observação |
|---------|----:|---:|------------|
| approved | 97 | 88,99% | publicáveis como estão |
| revise | 6 | 5,50% | parcialmente corretos; sugestão fornecida |
| rejected | 6 | 5,50% | erros identificáveis; sugestão fornecida |

Critérios de aceite do experimento, todos atendidos:

- ✅ Maioria approved (89%).
- ✅ Erros identificáveis e específicos (colisão entre sentidos da mesma entrada).
- ✅ Caso "geradora confiante mas validadora rejeitou" (3 casos com `confidence ≥ 0.9`).
- ✅ `1259290` (見る) sense 1 = **ver** (aprovado).
- ✅ `1358280` (食べる) nunca recebe "ver"; sense 1 = **comer** (aprovado).
- ✅ Todo `(jmdictSeq, sense)` do input aparece exatamente uma vez no lote.

## 5. Problemas encontrados (categorizadas)

**C1 — Colisão entre sentidos da mesma entrada (causa raiz de 5 das 6 rejeições).**
O gerador reusou o lexema do sentido dominante para um sentido secundário:

- (1259290, 3) “ver” para *to look after / to take care of* → **rejeitado**, correto é
  “cuidar de / vigiar”. Relevância: é o mesmo padrão do bug real corrigido no repositório
  (prefixo "ver" vazando para 食べる).
- (1283190, 2) “alto” para *expensive* → **rejeitado**, correto é “caro”.
- (1310460, 2) “habilidoso” para *delicious* → **rejeitado**, correto é “gostoso/delicioso”.
- (1213400, 4) “doce” para *indulgent / lenient* → **rejeitado**, correto é
  “indulgente/condescendente”.
- (1326980, 9) “pegar” para *to take up time/space* → **rejeitado**, correto é “ocupar”.

**C2 — Ambiguidade de lexema em pt-BR (revise).**
- (1326980, 2) “passar” para *to pass / to hand / to give*: “passar” também cobre
  tempo/trânsito → exigido “passar, entregar (algo a alguém)”.
- (1008630, 2) “de jeito nenhum”: sentido *not at all / by no means* só funciona com
  negação explícita → “não ... de jeito nenhum / de forma alguma”.

**C3 — Conteúdo gramatical/funcional (revise).**
- (1157170, 14÷16): sentidos funcionais de する (“sentir A sobre B”, sufixo verbalizador,
  verbo humilde) exigem fraseologia explicativa + exemplo, não tradução lexical.
- (1606560, 3) “Eu sei!”: interjeição *I know! / I think so too!* cobre só parte
  → “Pois é! / Também acho!”.

**C4 — Não-problemas do pipeline (verificados como corretos).**
- (1358280, 2) “viver de, subsistir de (um salário)”: não contaminou o sense 1.
- (1578850, 11) “ter orgasmo, gozar”: sentido colateral registrado de forma limpa.

## 6. Exemplos para o relatório de qualidade

- **Melhor tradução**: (1259290, 1) `見る` → **ver** (approved, conf. 0.97): cobertura
  total das glossas, transitividade vt preservada, sem contaminação.
- **Tradução problemática corrigida**: (1259290, 3) geradora propôs “ver” com confiança
  0.92; validadora rejeitou. É o caso emblemático (geradora confiante × rejeitado).
- **Tradução rejeitada identificável**: (1283190, 2) `高い` sense “expensive” → “alto”
  rejeitado (dígrafe “alto” pertence ao sense 1 “high/tall”); correto: “caro”.
- **Redundância sadia**: (1358280, 1) “comer” e (1323080, 1) “carro” e (1582710, 1)
  “Japão” foram aprovados com confiança máxima e estão prontos para importação.

## 7. Reproducibilidade

1. `generator-input.json` é derivado mecanicamente do dev DB (inclui `jmdict_seq`,
   kanji, readings, sensos e glossas EN conforme extração 2026-09-15).
2. `generator-prompt.md`/`validator-prompt.md` fixam o contrato dos agentes (formato,
   regras anti-colisão, critérios de decisão).
3. `approved.json` referencia `data/schemas/pt-br.schema.json` (JSON Schema 2020-12).
4. O teste automatizado (`services/translations-importer/src/experiment.test.ts`)
   re-valida o contrato a cada execução (estrutura, chaves, 108 regras e o par
   `見る→ver` / “`食べる` jamais `ver`”).

## 8. Conversão para o formato do importador

O importador (`translationDatasetRowSchema`, `services/translations-importer`) usa
`sensePosition` 0-baseado, `language`, `text`, `source`, `sourceVersion`. Mapeamento:

| experimento | importador |
|---|---|
| `jmdictSeq` | `jmdictSeq` (igual) |
| `sense` (1-baseado) | `sensePosition = sense - 1` |
| `text` | `text` |
| `source` = `"kotoba-ai-experiment"` | `source` (novo `source_id.key` criado dinamicamente) |
| `sourceVersion` = `"v0.1"` | `sourceVersion` |

Convertendo `approved.json` (97 linhas) e rodando o CLI
(`npm run translations-import -- --file <convertido>`) nada além do dev DB seria tocado;
o import é transacional e idempotente por checksum. **Nada foi importado neste experimento.**

## 9. Lições e escalabilidade

- A maior fonte de erro não é vocabulário, e sim **desambiguação entre sentidos da mesma
  entrada** (padrão C1): um validador independente com regra anti-colisão é o controle de
  qualidade mais importante do pipeline — e já existe equivalente no código de busca
  (prefixo vs. contém), que foi o bug “ver” encontrado anteriormente.
- Sentidos funcionais (auxiliares, sufixos) precisam de tratamento especial no prompt
  (traduzir função + exemplo), senão a safra vira “etiquetas” em vez de uso.
- 20 entradas / 109 sentidos produziram ~4,9 sentidos EN por entrada, em média; o JMdict
  completo tem 218.753 entradas. Estimativa bruta de escala: ~1,07M blocos EN, dos quais
  uma fração pequena é polissêmica — sugere que a automação é viável se a taxa de
  rejeição (5,5%) e revise (5,5%) forem mantidas com orçamento de revisão humana.
- Próximo passo natural (fora deste experimento): importar `approved.json` no dev DB com
  novo `source = kotoba-ai-experiment` e medir impacto no ranking de busca (testes de
  regressão “ver”/“comer” e integração com a migration 0005).