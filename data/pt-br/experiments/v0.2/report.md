# Relatório — experimento pt-BR v0.2 (100 entradas, 530 senses)

## 1. Objetivo
Avaliar a robustez da metodologia de geração/validação de traduções pt-BR por IA ao
escalar de **20 entradas / 109 senses (v0.1)** para **100 entradas reais do JMdict /
530 senses (v0.2)**, preservando **todos** os senses e sem tocar em produção.

## 2. Dataset
| Item | Valor |
| --- | --- |
| Fonte | JMdict (dev DB, `kotoba-postgres`) |
| Entradas | 100 (únicas) |
| Senses | 530 (1-baseados, contíguos) |
| Grupos | A verbos 20 · B substantivos 20 · C adjetivos 15 · D advérbios 10 · E expressões 10 · F polissêmicos 15 · G casos difíceis 10 |
| Extração | `v02_extract.json` → `generator-input.json` |

Distribuição de senses por entrada é desigual por desenho (ex.: `切る` 26, `掛ける` 25,
`上げる` 25, `出る` 21, `目` 20, `する` 17, `取る` 18), exercitando polissemia extrema.

## 3. Pipeline
`generator-input.json` → **generate** → `generated-candidates.json` →
`validator-input.json` → **validate** → `validation-results.json` →
derivação → `approved.json` + `review.json` + `rejected.json` → `report.md`.

Regras centrais aplicadas:
- 0–3 candidatos por sense (`equivalent`, `literal`, `figurative`, `explanation`);
- **no máximo um `approved` por `(jmdictSeq, sense)`**;
- `revise` exige `suggestedTranslation` (nunca corrigir em silêncio);
- colisão de sentidos (critério 14.7) é motivo explícito de rejeição/adaptação.

## 4. Gerador
| Métrica | Valor |
| --- | --- |
| Senses cobertos | 530 / 530 (100%) |
| Candidatos | 559 |
| Média de candidatos/sense | 1,05 |
| Senses com 1 / 2 / 3 candidatos | 501 / 29 / 0 |
| Tipos | `equivalent` 491 · `explanation` 52 · `literal` 15 · `figurative` 1 |

A regra de tipos manteve 87,8% de equivalências diretas, reservando `explanation` para
termos culturais (oden, gueixa, sumô, budismo, mahjong) e `literal` para alternativas
que o validador deveria reavaliar.

## 5. Validador
| Decisão | Candidatos | % |
| --- | --- | --- |
| `approved` | 525 | 93,9% |
| `revise` | 24 | 4,3% |
| `rejected` | 10 | 1,8% |
| **Total** | **559** | 100% |

- Senses com tradução aprovada: **525 / 530 (99,1%)**.
- Critérios citados nas decisões não aprovadas: 14.2 (17), 14.7 (11), 14.3 (3),
  14.6 (1), 14.1 (1), 14.5 (1).

### 5.1 Calibração (confiança do gerador × decisão do validador)
| Faixa | Candidatos | Aprovados | Taxa |
| --- | --- | --- | --- |
| 0,00–0,59 | 0 | 0 | — |
| 0,60–0,79 | 51 | 30 | 58,8% |
| 0,80–0,89 | 47 | 44 | 93,6% |
| 0,90–1,00 | 461 | 451 | 97,8% |

A taxa cresce monotonicamente com a confiança, indicando boa calibração — mas a faixa
alta ainda concentra erros (2,2% de falhas), o que exige auditoria humana.

### 5.2 Falhas com alta confiança do gerador (≥ 0,90)
| Entrada | Sense | Candidato | Conf. gerador | Decisão | Motivo |
| --- | --- | --- | --- | --- | --- |
| 1259290 見る | 3 | ver | 0,95 | rejected | 14.7 colisão com o sense 1 |
| 1236070 強い | 2 | forte | 0,92 | rejected | 14.7 colisão com o sense 1 |
| 1251320 経済 | 3 | economia | 0,90 | rejected | 14.7 colisão com o sense 1 |
| 1556730 冷たい | 2 | frio | 0,90 | rejected | 14.7 colisão (frieza emocional) |
| 1420470 知る | 1 | conhecer | 0,90 | rejected | 14.7 colisão com o sense 4 |
| 1433030 通る | 1 | atravessar | 0,90 | rejected | 14.7 colisão com o sense 4 |
| 1533580 面白い | 3 | engraçado | 0,90 | rejected | 14.7 colisão com o sense 2 |
| 1580640 人 | 1 | ser humano | 0,91 | rejected | 14.7 colisão com o sense 2 |
| 1591110 聞く | 1 | escutar | 0,90 | rejected | 14.7 colisão com o sense 2 |
| 1604890 目 | 1 | olhar | 0,90 | rejected | 14.7 colisão com o sense 3 |

**10 falhas de alta confiança**, todas por colisão de sentido — o mesmo padrão C1 do
v0.1, agora em escala maior e detectado de forma sistemática.

### 5.3 Colisão de sentidos
11 decisões citam o critério 14.7 (10 `rejected` + 1 `revise`). A causa raiz é a
sobreposição de glossas EN da mesma entrada (`forte`, `economia`, `ver`, `frio`,
`conhecer`, `atravessar`, `engraçado`, `ser humano`, `escutar`, `olhar`, `falar`).
Estratégia validada: rejeitar o candidato colidente e sugerir um sinônimo que
desambigue (`cuidar`, `robusto`, `insensível`, `falar (um idioma)` etc.).

## 6. Casos de controle obrigatórios
- `見る` (1259290) sense 1 → **`ver` aprovado**.
- `食べる` (1358280) → candidatos `comer` / `viver de`; **nunca** recebe `ver`.
- `見る` sense 3 → candidato `ver` **rejeitado** com `suggestedTranslation: cuidar`.
- `話す` sense 3 → `falar` **revise** → `falar (um idioma)`.

## 7. Comparação v0.1 × v0.2
| Métrica | v0.1 | v0.2 |
| --- | --- | --- |
| Entradas | 20 | 100 (5×) |
| Senses | 109 | 530 (4,9×) |
| Candidatos | 109 (1/sense) | 559 (0–3/sense) |
| Aprovados | 97 (89,0%) | 525 (93,9%) |
| `revise` | 6 | 24 |
| `rejected` | 6 | 10 |
| Cobertura de senses | 100% | 99,1% |
| Falhas de alta confiança | 3 | 10 (2,2% da faixa ≥0,90) |
| Colisão de sentidos | causa raiz C1 | 11 decisões 14.7 |

O v0.2 manteve a taxa de aprovação **acima** do v0.1 mesmo com polissemia extrema e
introduziu o conceito explícito de prioridade por sense, permitindo múltiplos
candidatos sem duplicar a tradução canônica no dataset aprovado.

## 8. Escalabilidade 100 → 500 entradas
- O custo cresce **linearmente**: ~5,3 senses/entrada e ~1,055 candidatos/sense.
  500 entradas ⇒ ~2.650 senses e ~2.800 candidatos.
- O gargalo é a **validação**: cada candidato exige confronto com a glossa, o POS, o
  registro e a colisão intra-entrada. Recomenda-se processar em lotes por grupo,
  mantendo prompts fixos, e automatizar a derivação dos artefatos (como o builder
  usado aqui) para eliminar retrabalho.
- A regra “um único `approved` por sense” mantém o `approved.json` importável
  (uma posição de sentido por linha), independentemente do nº de candidatos.

## 9. Limitações
- **False approval rate não é mensurável automaticamente**: não há gold standard
  independente. Medir isso exige amostragem com revisão humana (ex.: 30–50 senses
  sorteados) para estimar a taxa de aprovações incorretas.
- A calibração mostra que confiança ≥ 0,90 **não** é garantia (2,2% de falhas).
- Não houve importação: o experimento termina nos JSONs + relatório.

## 10. Artefatos e verificação
- `generator-prompt.md`, `validator-prompt.md` — especificações das duas personas.
- `generator-input.json` (100 entradas / 530 senses), `generated-candidates.json`
  (559 candidatos), `validator-input.json`, `validation-results.json`.
- `approved.json` (525 linhas, schema `../../../schemas/pt-br.schema.json`),
  `review.json` (24), `rejected.json` (10).
- `services/translations-importer/src/experiment-v02.test.ts` — **22 testes, todos
  verdes** (`npm test -- experiment-v02.test.ts`).
- Produção intacta: nenhuma migration, nenhum `INSERT`/`UPDATE` em `translations` ou
  `source_imports`.
