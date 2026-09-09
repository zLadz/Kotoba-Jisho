# Kotoba — Filtro multilíngue e camada lexical Português Brasileiro

O projeto Kotoba atualmente importa dados do JMdict, mas a interface está exibindo glosses de vários idiomas simultaneamente.

O próximo objetivo é implementar corretamente:

1. **filtro por idioma**;
2. **Português Brasileiro como idioma padrão da aplicação**;
3. **uma camada lexical própria para português**;
4. preservação integral dos dados originais do JMdict;
5. busca em português;
6. arquitetura preparada para futuras fontes, idiomas e IA.

Leia primeiro:

```text
README.md
docs/architecture.md
docs/development.md
docs/data-sources.md
```

Depois analise:

```text
services/importer
packages/database
packages/types
packages/validation
apps/api
apps/web
```

Não reescreva componentes funcionais sem necessidade.

---

# 1. Problema atual

O JMdict possui glosses em vários idiomas.

Uma entrada como:

```text
車
くるま
kuruma
```

pode conter:

```text
en:
  car
  automobile
  vehicle

dut:
  wiel
  rad

fre:
  véhicule
  voiture

ger:
  Rad
  Wagen
  Auto

spa:
  automóvil
  coche
  vehículo

swe:
  bil
```

Atualmente esses dados estão sendo apresentados juntos.

Isso está incorreto para a experiência inicial do Kotoba.

A interface padrão deve apresentar:

```text
車

くるま

kuruma

Substantivo

Significados

carro
automóvel
veículo
```

quando existirem traduções portuguesas.

---

# 2. Regra fundamental de arquitetura

Existem duas categorias diferentes de dados:

## Dados de fonte

Informações diretamente provenientes do JMdict:

```text
kanji
reading
sense
part of speech
field
dialect
misc
gloss
```

## Dados lexicais do Kotoba

Informações adicionadas ao projeto:

```text
Portuguese translations
Portuguese definitions
Portuguese usage notes
Portuguese synonyms
Portuguese regional information
future AI-generated explanations
```

Essas duas categorias NÃO devem ser misturadas.

O JMdict deve permanecer reproduzível a partir da fonte original.

A camada portuguesa deve poder ser atualizada independentemente.

---

# 3. Não modificar os dados originais

NÃO fazer:

```text
JMdict English:
car

↓ tradução automática

JMdict:
carro
```

Isso destruiria a distinção entre fonte original e dado derivado.

Também não fazer:

```text
gloss.language = "pt"
```

simplesmente porque o texto foi traduzido.

A origem precisa permanecer explícita.

---

# 4. Modelo conceitual

O sistema deve evoluir para algo semelhante a:

```text
Lexical Entry
│
├── Kanji Forms
├── Readings
│
└── Senses
     │
     ├── JMdict Glosses
     │    ├── en
     │    ├── dut
     │    ├── fre
     │    ├── ger
     │    └── ...
     │
     └── Kotoba Translations
          └── pt-BR
               ├── carro
               ├── automóvel
               └── veículo
```

O relacionamento deve ocorrer no nível correto do `sense`.

Uma tradução não deve necessariamente ser ligada apenas à entrada inteira, porque uma mesma palavra pode possuir múltiplos sentidos.

Exemplo conceitual:

```text
車

Sense 1:
  vehicle/car
  → carro
  → automóvel

Sense 2:
  wheel
  → roda
```

Não transformar tudo em:

```text
車 → carro, automóvel, veículo, roda
```

sem preservar os sentidos.

---

# 5. Camada Portuguese Translation

Criar uma estrutura apropriada para traduções próprias do Kotoba.

O modelo deve permitir, no mínimo:

```text
id
sense_id
language
text
source
source_version
confidence
created_at
updated_at
```

Onde:

```text
language = pt-BR
```

é o idioma inicial.

Não usar apenas:

```text
translation_pt
```

como coluna fixa.

O modelo precisa permitir futuramente:

```text
pt-BR
en
es
fr
de
...
```

sem alteração estrutural.

---

# 6. Source

Toda tradução deve possuir uma origem identificável.

Exemplos:

```text
community
manual
licensed_dataset
machine_translation
ai
```

Não assumir que toda tradução possui a mesma confiabilidade.

Exemplo:

```text
text: "carro"
source: "community"
confidence: 0.95
```

ou:

```text
text: "carro"
source: "machine_translation"
confidence: 0.78
```

Os valores exatos e a escala de `confidence` devem ser definidos de maneira consistente.

Se não houver confiança disponível, permitir `null`.

Não inventar valores de confiança.

---

# 7. Preparar importação de dataset português

O sistema deve ser preparado para importar futuramente um dataset português externo.

Criar uma arquitetura semelhante a:

```text
services/importer/
    jmdict/
    portuguese/
```

ou uma abstração equivalente que faça sentido na arquitetura existente.

Não implementar ainda uma fonte portuguesa específica caso sua licença/origem não esteja definida.

O objetivo desta etapa é preparar o mecanismo.

---

# 8. Importação inicial do português

Caso exista atualmente algum dataset português no projeto, primeiro identifique:

- origem;
- formato;
- licença;
- identificador;
- como as traduções se relacionam às entradas japonesas;
- se a licença permite redistribuição;
- se exige atribuição.

Não assumir que qualquer dataset encontrado na internet pode ser incorporado ao Kotoba.

Registrar essas informações em:

```text
docs/data-sources.md
```

---

# 9. Mapeamento de traduções

Uma tradução portuguesa precisa ser associada ao sentido correto sempre que a fonte permitir.

Prioridade:

```text
JMdict sense
      ↓
external Portuguese translation
      ↓
Kotoba translation
```

Se o dataset português não possuir informação suficiente para determinar o `sense`, não inventar o relacionamento.

Nesse caso, registrar a limitação e utilizar uma associação menos específica somente se a arquitetura justificar.

---

# 10. Idioma padrão

O Kotoba deve assumir:

```text
pt-BR
```

como idioma padrão da interface.

Criar uma configuração centralizada.

Evitar espalhar:

```text
"pt"
```

ou:

```text
"pt-BR"
```

pelo código.

Exemplo conceitual:

```text
DEFAULT_LANGUAGE = "pt-BR"
```

A localização do código pode ser diferente conforme a arquitetura atual.

---

# 11. API

A API deve permitir selecionar o idioma.

Exemplo:

```http
GET /api/v1/search?q=carro&lang=pt-BR
```

e:

```http
GET /api/v1/search?q=car&lang=en
```

Para detalhes:

```http
GET /api/v1/entries/:id?lang=pt-BR
```

Se `lang` não for informado:

```text
pt-BR
```

deve ser utilizado.

---

# 12. API — separação dos dados

A API não deve retornar todos os glosses quando o usuário solicitou apenas um idioma.

Evitar:

```json
{
  "glosses": [
    {"language": "en", "text": "car"},
    {"language": "dut", "text": "wiel"},
    {"language": "fre", "text": "voiture"},
    {"language": "ger", "text": "Wagen"}
  ]
}
```

para uma consulta:

```text
lang=pt-BR
```

Preferir algo como:

```json
{
  "language": "pt-BR",
  "translations": [
    {
      "text": "carro",
      "source": "..."
    },
    {
      "text": "automóvel",
      "source": "..."
    }
  ]
}
```

Os glosses originais do JMdict devem continuar disponíveis internamente.

---

# 13. API — ausência de tradução

Se:

```text
lang=pt-BR
```

e não existir tradução portuguesa para determinado sense:

NÃO traduzir automaticamente durante a requisição.

NÃO utilizar inglês silenciosamente.

NÃO misturar idiomas.

Retornar uma estrutura consistente indicando ausência de tradução.

Exemplo:

```json
{
  "language": "pt-BR",
  "translations": []
}
```

Um fallback para inglês pode ser implementado futuramente como uma funcionalidade explícita.

Nesta etapa:

```text
sem tradução PT-BR = sem tradução PT-BR
```

---

# 14. Busca em português

A busca:

```http
GET /api/v1/search?q=carro&lang=pt-BR
```

deve procurar na camada portuguesa.

Ela NÃO deve procurar `carro` dentro dos glosses ingleses, alemães, franceses etc.

A busca deve poder trabalhar com:

```text
Japanese
├── Kanji
├── Kana
└── Romaji

Translation
└── Selected language
```

Exemplo:

```text
車
くるま
kuruma
```

deve ser encontrado por:

```text
車
くるま
kuruma
carro
automóvel
```

quando esses dados estiverem disponíveis.

---

# 15. Ranking

Manter a estratégia atual:

```text
Exact
↓
Prefix
↓
Normalized
↓
Fuzzy
```

Mas considerar a origem do resultado.

Para uma consulta:

```text
carro
```

uma correspondência exata:

```text
pt-BR → carro
```

deve ter prioridade sobre correspondências fuzzy.

Não deixar uma tradução em outro idioma competir com a camada portuguesa.

---

# 16. Part of Speech

Corrigir a apresentação da informação gramatical.

O valor:

```text
n
```

do JMdict significa:

```text
noun
```

e NÃO deve aparecer como se fosse parte do significado.

A interface deve transformar:

```text
n
```

em:

```text
Substantivo
```

ou em uma representação adequada ao sistema de localização.

Exemplo:

```text
車

Classe gramatical:
Substantivo

Significados:
• carro
• automóvel
• veículo
```

A classe gramatical pertence ao sense/estrutura lexical, não ao texto da tradução.

---

# 17. Múltiplos sentidos

Preservar a separação entre senses.

Exemplo:

```text
車

1. Substantivo
   carro
   automóvel
   veículo

2. Substantivo
   roda
```

Não juntar todos os glosses em uma lista única.

Isso será importante posteriormente para:

- exemplos;
- explicações contextuais;
- IA;
- sinônimos;
- diferenças semânticas;
- aprendizado.

---

# 18. Ordenação das traduções

Não ordenar traduções alfabeticamente sem necessidade.

Preservar a ordem fornecida pela fonte quando essa ordem tiver significado.

Para traduções próprias do Kotoba, definir posteriormente uma prioridade.

Uma possível estrutura:

```text
priority
```

pode ser adicionada se realmente necessária.

Não adicionar campos especulativos apenas por precaução.

---

# 19. Dados derivados

Manter:

```text
romaji
```

como dado derivado.

Não tratar tradução portuguesa como derivação simples do JMdict.

São categorias diferentes:

```text
Romaji:
derived from reading

Portuguese:
independent lexical data
```

---

# 20. Licenciamento

Antes de importar qualquer dataset português externo:

1. identificar licença;
2. identificar autor/projeto;
3. verificar permissão de redistribuição;
4. verificar obrigação de atribuição;
5. verificar compatibilidade com a licença do projeto;
6. documentar a fonte.

Não copiar conteúdo de sites comerciais simplesmente porque ele aparece em uma página pública.

Não atribuir licença MIT ao conteúdo de terceiros.

Código e dados devem ser tratados separadamente.

---

# 21. Banco de dados

Adicionar constraints para evitar duplicações.

Uma tradução equivalente não deve ser inserida indefinidamente.

Considerar uma identidade baseada em:

```text
sense
language
text
source
```

ou outra composição tecnicamente adequada.

A decisão final deve considerar a capacidade de existir:

```text
carro
carro
carro
```

proveniente de fontes diferentes.

Não eliminar informações de proveniência apenas para evitar duplicações.

---

# 22. Importação idempotente

O importer português deve seguir a mesma regra do JMdict:

```text
importar duas vezes
        ↓
sem duplicação
```

Registrar:

```text
source_imports
```

para a fonte.

Não misturar a execução do importer português com a execução do JMdict.

---

# 23. Frontend

Atualizar a interface para:

```text
Japanese word

Kanji
Reading
Romaji

Part of speech

Portuguese meanings
```

Exemplo:

```text
車

くるま

kuruma

Substantivo

• carro
• automóvel
• veículo
```

Se houver múltiplos senses:

```text
1. Substantivo
   • carro
   • automóvel
   • veículo

2. Substantivo
   • roda
```

Não exibir glosses de outros idiomas na interface padrão.

---

# 24. Seletor de idioma

Prepare a interface para futuramente possuir:

```text
Português Brasileiro
English
Español
Français
Deutsch
```

Porém, não é necessário implementar todos os idiomas agora.

O primeiro estado deve ser:

```text
Português Brasileiro
```

com arquitetura preparada para expansão.

---

# 25. Testes obrigatórios

Adicionar testes para:

### Filtro

```text
lang=pt-BR
→ somente PT-BR

lang=en
→ somente EN
```

### Busca

```text
carro
→ procura PT-BR

car
→ procura EN
```

### Entrada

Verificar:

```text
kanji
reading
romaji
POS
senses
translations
```

### Múltiplos sentidos

Garantir que traduções não sejam misturadas entre senses.

### Proveniência

Garantir que:

```text
source
source_version
```

sejam preservados.

### Idempotência

Executar o mesmo importer duas vezes.

Resultado esperado:

```text
sem duplicação
```

---

# 26. Teste de aceitação

Para:

```text
車
```

a aplicação padrão deve apresentar algo próximo de:

```text
車
くるま
kuruma

Substantivo

1.
carro
automóvel
veículo

2.
roda
```

e NÃO:

```text
car
automobile
vehicle
wiel
rad
voiture
Wagen
автомобиль
automóvil
bil
...
```

---

# 27. O que NÃO implementar

Nesta tarefa NÃO implementar:

- tradução por IA;
- tradução automática durante busca;
- AI tutor;
- explicações geradas por IA;
- embeddings;
- RAG;
- chatbot;
- Elasticsearch;
- Redis;
- microservices;
- autenticação;
- pagamentos;
- SRS;
- gamificação.

O objetivo é construir corretamente a **camada lexical portuguesa e o mecanismo multilíngue**.

---

# 28. Ordem de implementação

Execute em etapas.

## Milestone 1

Auditar schema e código atual.

## Milestone 2

Separar claramente:

```text
JMdict source data
Portuguese lexical data
```

## Milestone 3

Implementar filtro de idioma.

## Milestone 4

Implementar modelo de traduções PT-BR.

## Milestone 5

Implementar importer português genérico, sem assumir uma fonte específica sem licença definida.

## Milestone 6

Implementar busca PT-BR.

## Milestone 7

Corrigir representação de POS e múltiplos senses.

## Milestone 8

Atualizar frontend.

## Milestone 9

Adicionar testes.

## Milestone 10

Atualizar documentação.

---

# 29. Resultado arquitetural esperado

Ao final:

```text
                    ┌─────────────┐
                    │   JMdict    │
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
                    │ JMdict Data │
                    └──────┬──────┘
                           │
                           │ senses
                           ↓
                 ┌───────────────────┐
                 │ Lexical Structure │
                 └─────────┬─────────┘
                           │
              ┌────────────┴────────────┐
              ↓                         ↓
       JMdict Glosses            Kotoba Lexical Layer
       en / de / fr / ...              pt-BR
              │                         │
              └────────────┬────────────┘
                           ↓
                    ┌─────────────┐
                    │ SearchService│
                    └──────┬──────┘
                           ↓
                     API / Next.js
```

A regra principal é:

```text
JMdict permanece fiel à fonte.
Português pertence à camada lexical do Kotoba.
A API seleciona o idioma.
O frontend mostra somente o idioma selecionado.
```

Essa separação deve permitir posteriormente adicionar:

```text
Português
     ↓
Exemplos
     ↓
Sinônimos
     ↓
Notas de uso
     ↓
IA contextual
```

sem precisar reconstruir a base lexical.