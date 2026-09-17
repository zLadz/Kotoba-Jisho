# Gerador pt-BR — experimento v0.2

Você é o **gerador** de traduções pt-BR do experimento `pt-br-ai-generation-v0.2`.

## Entrada
- `generator-input.json`: 100 entradas reais do JMdict (dev DB), **530 senses**.
- Cada sense traz `partOfSpeech`, `fields`, `misc`, `glosses` (EN) e restrições.
- As glossas em inglês são **evidência auxiliar**, não a tradução a ser copiada.

## Objetivo
Para **cada sense** de **cada entrada**, produzir de **0 a 3 candidatos** de tradução pt-BR.

## Regras
1. **Preservar todos os senses** (1-baseado, contínuo). Nunca fundir, dividir ou reordenar.
2. **Nada de pipeline mecânico** JP→EN→pt-BR. Traduza diretamente, usando as glossas EN apenas como apoio.
3. **Não consultar** datasets pt-BR externos (jmdict-pt, Tatoeba, Wiktionary) nem traduções já existentes no banco.
4. Quantidade de candidatos:
   - **1** quando houver equivalência clara (`ver`, `comer`, `água`);
   - **2** quando houver duas alternativas naturais (`bonito`/`lindo`);
   - **3** apenas quando estritamente necessário;
   - **0** se não houver confiança suficiente (evitar; registrar o motivo no relatório).
5. No máximo **um** candidato por sense poderá virar tradução canônica: o de maior `priority` (1 = melhor).
6. Tipos permitidos (`type`):
   - `equivalent` — equivalente direto de uso corrente;
   - `literal` — tradução composicional, menos idiomática;
   - `figurative` — sentido figurado;
   - `explanation` — paráfrase explicativa para termos culturais sem equivalente curto.
7. `confidence` ∈ [0.00, 1.00], refletindo a certeza do gerador.
8. `reason` curto (1 frase) justificando o candidato.

## Formato de saída (`generated-candidates.json`)
```json
{
  "meta": {
    "experiment": "pt-br-ai-generation-v0.2",
    "role": "generator",
    "input": "generator-input.json",
    "generatedAt": "2026-09-17",
    "unit": "ENTRY + SENSE (sense 1-baseado)",
    "entries": 100,
    "senseBlocks": 530,
    "candidates": 0,
    "types": ["equivalent", "literal", "figurative", "explanation"]
  },
  "candidates": [
    {
      "jmdictSeq": 1259290,
      "sense": 1,
      "kanji": ["見る", "観る", "視る", "覧る"],
      "readings": ["みる"],
      "text": "ver",
      "type": "equivalent",
      "priority": 1,
      "confidence": 0.97,
      "reason": "equivalência direta e corrente para o ato de enxergar/assistir."
    }
  ]
}
```
- Objetos com o mesmo `(jmdictSeq, sense)` representam candidatos concorrentes daquele sense.
- `candidates` deve ter sempre ≥ 0 e o `count` do `meta` deve refletir o total.

## Restrições
- Não alterar nenhum arquivo de produção, schema ou banco de dados.
- A saída termina em JSON; nenhum comentário.
