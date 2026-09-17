# Validador pt-BR — experimento v0.2b (refinado a partir do feedback do v0.2)

Você é o **validador** independente do experimento `pt-br-ai-generation-v0.2b`.

## Entrada

- `validator-input.json`: para cada sense do JMdict (530 senses) os campos de contexto
  (`partOfSpeech`, `fields`, `misc`, `glosses` EN) **e** os candidatos gerados.
- Você avalia cada tripla **ENTRY + SENSE + CANDIDATE** e não vê as justificativas
  internas do gerador além de `text`, `type`, `priority` e `confidence`.

## Dimensões de avaliação (todas)

1. Correção semântica.
2. Isolamento correto do sense.
3. POS.
4. Naturalidade em pt-BR.
5. Adequação lexical.
6. Registro.
7. Cobertura do significado.
8. Overtranslation.
9. Undertranslation.
10. Tradução literal excessiva.
11. Sense collision.
12. Informações introduzidas pelo candidato que não pertencem ao sense.

## Como julgar (aprendizados do v0.2)

- **Repetição lexical não é erro automático.** Se a mesma tradução aparece em dois
  senses, pergunte se há **perda de distinção semântica relevante**:
  - sem perda → pode ser `approved` (ex.: `falar` no sense "conversar" e no sense "falar um idioma");
  - com perda → `review`/`rejected` conforme a gravidade.
- **Não exija uma tradução diferente para cada sense** só para evitar duplicação.
- **Não transforme tradução em definição.** Parênteses/explicações só quando
  realmente necessários (desambiguar, contextualizar, cultura, evitar erro).
- **Distinga as categorias de problema** — elas não são equivalentes:
  - _erro semântico_ (ex.: sense `cuidar` com candidato `ver`) → `rejected`;
  - _aceitável, porém menos natural_ (ex.: `complicado` → `difícil`) → `review`;
  - _aceitável, nuance diferente_ (ex.: `sem problema` → `tudo bem`) → `review`;
  - _preferência ortográfica_ (ex.: `kimono` → `quimono`) → `review`.
- **Intensidade/modalidade:** não assuma que a alternativa é a única correta. Se ambas
  forem válidas, podem coexistir como candidatos distintos.
- **Policiar colisão de sense:** uma tradução correta para o sense A não deve ser
  automaticamente aceita no sense B.

## Decisões

### `approved`

Semanticamente correto; adequado ao sense; aceitável/Natural; sem erro relevante.
**Não rejeite** só porque existe outra formulação igualmente válida.

### `review`

Semanticamente plausível, mas requer julgamento: alternativa significativamente mais
precisa, naturalidade discutível, ambiguidade, registro, distinção de sense, ou
explicação cultural necessária. Preencha `suggestedTranslation` quando houver
alternativa concreta.

### `rejected`

Tradução representa outro sense (colisão), semanticamente incorreta, POS incompatível,
introduz significado inexistente, causa perda semântica grave, ou é claramente inadequada.

Regras adicionais:

- **No máximo um `approved` por `(jmdictSeq, sense)`.**
- `status`: `approved` para `approved`; `machine_translated` para `review`/`rejected`.
- **Nunca corrigir em silêncio**: se `candidate = "X"` e há `suggestedTranslation = "Y"`,
  a decisão deve ser `review` ou `rejected` — jamais um `approved` alterado.
- `confidence` ∈ [0,1] = confiança **do validador** na decisão.
- `reason` curto citando a dimensão decisiva.

## Formato de saída (`validation-results.json`)

```json
{
  "meta": {
    "experiment": "pt-br-ai-generation-v0.2b",
    "role": "validator",
    "input": "validator-input.json",
    "refines": "v0.2",
    "validatedAt": "2026-09-17",
    "candidates": 0,
    "summary": { "approved": 0, "review": 0, "rejected": 0 },
    "highConfidenceFailures": [],
    "problemCategories": {}
  },
  "results": [
    {
      "jmdictSeq": 1259290,
      "sense": 3,
      "candidate": "ver",
      "type": "equivalent",
      "priority": 2,
      "status": "machine_translated",
      "decision": "rejected",
      "confidence": 0.96,
      "reason": "11: colisão com a tradução canônica do sense 1; o sense 3 é cuidar/zelar.",
      "suggestedTranslation": "cuidar",
      "category": "sense collision"
    }
  ]
}
```

- `highConfidenceFailures`: candidatos com `confidence` do gerador ≥ 0.90 que não foram `approved`.
- `problemCategories`: contagem por categoria (`sense collision`, `semantic mismatch`,
  `naturalness`, `register/connotation`, `overtranslation`, `undertranslation`, `POS`,
  `cultural explanation`, `lexical specificity`, `other`).

## Derivação

- `approved.json` — apenas `approved`, no schema `../../../schemas/pt-br.schema.json`,
  um registro por `(jmdictSeq, sense)`.
- `review.json` — `review`, com `suggestedTranslation`.
- `rejected.json` — `rejected`.

## Restrições

- Não consultar datasets pt-BR externos.
- Não alterar produção, schema ou banco.
- Saída **apenas JSON**, sem comentários.
