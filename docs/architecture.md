# Arquitetura

O Kotoba é um **monorepo** npm workspaces, modular e com camadas isoladas. Nada de
monólito monstruoso: cada pacote tem uma responsabilidade clara e é consumido pelos
demais por meio de contratos tipados (TypeScript).

## Visão geral

```text
                 +---------------------+       +---------------------+
JMdict (XML) --> | services/importer   |       | apps/web (Next.js)  |
                 | parse + validação + |  SQL  | busca + detalhe     |
                 | persistência        | ----> |  (http://:3001)     |
                 +---------+-----------+       +----------+----------+
                           |                                   |
                           v                                   v GET :3000
                 +---------------------+       +---------------------+
                 | PostgreSQL (Drizzle)|       | apps/api (Fastify)  |
                 | schema + migrations | <---- | REST /api/v1        |
                 +---------------------+       +---------------------+
                           ^
                  +--------+---------+
                  | translations-    |
                  | importer (JSON)  |
                  | camada Kotoba    |
                  +------------------+
```

Fluxo de dados principal:

```text
JMdict → importer → PostgreSQL → API REST → frontend (busca → resultado → detalhe)
traduções pt-BR (JSON) → translations-importer → PostgreSQL → (mesmo caminho da API)
```

## Estrutura do monorepo

```text
apps/
  api/        API REST Fastify (modular monolith)
  web/        Frontend Next.js (App Router) + React + Tailwind CSS
packages/
  config/     Configurações compartilhadas (TS, ESLint, Prettier)
  database/   Schema Drizzle, migrations e seed
  normalize/  Normalização lexical: NFKC + katakana→hiragana + remoção de acentos
  romaji/     Conversão kana → romaji (campo derivado)
  types/      Contratos de domínio (DictionaryEntry, SearchResult, ...)
  validation/ Schemas Zod dos contratos da API (request/response)
services/
  importer/             CLI de importação do JMdict (batch transacional, idempotente)
  translations-importer/ CLI de importação das traduções pt-BR (camada Kotoba)
docs/         Documentação
```

## apps/api (Fastify)

Monolith **modular**: cada domínio é um módulo independente em `src/modules/`.

| Módulo       | Responsabilidade                                                                 |
| ------------ | -------------------------------------------------------------------------------- |
| `health`     | `GET /api/v1/health` (Health check com acesso ao banco)                          |
| `search`     | `GET /api/v1/search` — busca e ranking (SearchService/repository), escopo `lang` |
| `dictionary` | `GET /api/v1/entries/:id` — detalhe de uma entrada, com traduções por `lang`     |

- `src/app.ts` monta a aplicação (CORS, `setNotFoundHandler`, `setErrorHandler`) e registra
  as rotas; `src/server.ts` sube o servidor HTTP (env `HOST`/`PORT`) com graceful shutdown.
- Todos os parâmetros e respostas são validados por schemas Zod de `@kotoba/validation`
  (§15), garantindo contratos estáveis entre a API e o frontend.
- Erros seguem um corpo padronizado `{ error: { code, message } }` (§25).
- A resolução das traduções por `lang` é centralizada em
  `apps/api/src/modules/dictionary/translations.ts`, usada tanto pelo módulo `dictionary`
  quanto pelo `search`.

## apps/web (Next.js)

- App Router; a busca é um componente client (`src/components/search-form.tsx`) com estado
  local (`useState`) — **sem** gerenciamento de estado global (§17).
- A página de detalhe (`src/app/entry/[id]/page.tsx`) é um server component que consome a
  API de forma direta e usa `notFound()` para entradas inexistentes.
- `src/lib/api.ts` reutiliza os tipos de `@kotoba/types` e `@kotoba/validation` para falar
  com a API.

## Decisões relevantes

### Romaji é um campo derivado (§10)

O JMdict não carrega romaji. O Kotoba **não** trata romaji como lexical:

- `packages/romaji` isola o algoritmo (`kanaToRomaji`) — substituível/melhorável depois.
- A coluna `readings.romaji` existe apenas para permitir **busca** eficiente em SQL;
  a **saída** da API sempre deriva romaji de `readings.text` via `@kotoba/romaji`
  (`toDomainEntry`), nunca da coluna persistida.

### Busca e ranking no PostgreSQL (§11–§13)

- `packages/normalize` define a normalização lexical única (NFKC, katakana→hiragana e
  remoção de acentos com NFC final) usada tanto pelo importer (**persistida** em
  `readings.normalized_text`/`glosses.normalized_text`) quanto pela busca (**normalizada em
  tempo de query**).
- `search.repository` executa consultas em 4 camadas — exata, **token** (comparação sobre
  `normalized_text`), prefixo e **fuzzy** (`pg_trgm`, operador `%`) — sobre leitura, kanji,
  romaji, tradução da camada Kotoba (`translations`) e gloss do JMdict, nos textos brutos e
  normalizados. Para `pt-BR` a busca lê `translations` (6 tiers: exata/token/prefixo/token-
  prefixo/fuzzy/token-fuzzy, pontuados **acima** dos gloss do JMdict); para os demais
  idiomas lê os glosses do JMdict filtrados pelo idioma (`source: "jmdict"`). Isso dá
  tolerância a katakana, kana half-width e acentos em português sem tocar nos dados
  originais. Aceleradas por índices GIN (`gin_trgm_ops`, migration `0002`) + índices
  btree/GIN em `normalized_text`.
- `SearchService.search(query, limit, offset, lang)` agrega a melhor pontuação por entrada,
  desempatando por prioridade (`ichi1`/`news1`) e `jmdict_seq`, aplica **offset antes do
  limite** (paginação) e devolve resultados hidratados.
- A camada de busca é isolada: um mecanismo dedicado (ex.: OpenSearch) pode substituir o
  SQL no futuro sem alterar a API.
- `npm run benchmark:search` mede a latência (p50/p95) por tier contra o banco real.

### Importação idempotente e proveniência (§35)

- O importer processa o JMdict em streaming por linhas, agrupando em **lotes transacionais**
  (`flushEntryBatch`): dentro de uma transação, faz DELETE dos `ent_seq` existentes e
  re-insere entradas + filhos, com `RETURNING` para preservar as relações e `insertChunked`
  para ultrapassar o limite de parâmetros do PostgreSQL.
- `source_imports` registra o ciclo de vida de cada importação (`status` pending/running/
  completed/failed), versão da fonte, checksum, contadores, erro e `duration_ms`. A
  `source+version` é única: reexecutar o mesmo arquivo **atualiza** o registro sem duplicar
  linhas; falhas podem ser retomadas na mesma versão.
- Romaji e `normalized_text` são **derivados** — sempre regenerados a partir de `text` na
  importação, nunca tratados como fonte de verdade (consistente com §10).

### Verificação de integridade (§23)

As migrations evoluem o schema apenas com `ADD COLUMN` compatíveis (migration `0003`);
testes de banco em `storage.test.ts` verificam constraints (unicidade de `source+version` e
`jmdict_seq`, FKs em cascata, defaults NOT NULL) e a presença de todos os índices de busca.

### Dados multilingue (§32)

O modelo guarda uma linha de tradução por idioma, sem colunas fixas `pt`/`en`. Novos idiomas
são adicionados sem mudança de schema.

### Camada lexical própria (traduções Kotoba)

As traduções **curadas** do Kotoba (hoje `pt-BR`) vivem na tabela `translations` (migration
`0004`), apontando para a acepção via `sense_id`, com `position`, `language`, `text`,
`normalized_text`, `source`, `source_version`, `confidence` e unicidade por
(`sense_id, language, text, source, source_version`). Diferente dos glosses do JMdict, essa
camada é **dados próprios**, com o ciclo de vida registrado em `source_imports`
(`source = kotoba-translations`).

Regra de resolução (`resolveSenseTranslations`):

- **`pt-BR`** (`DEFAULT_LANGUAGE`): apenas a camada Kotoba; sem fallback para o JMdict
  (acepção sem tradução curada fica vazia, protegendo a etapa de curadoria);
- **demais idiomas**: camada Kotoba se existir para o idioma; senão, glosses do JMdict
  filtrados pelo idioma (`source: "jmdict"`), sempre com proveniência explícita no payload
  (`source`/`sourceVersion`).

A busca é **escopada por `lang`**: `isKotobaOwned(lang) || hasKotobaTranslations(lang)`
determina se o termo pesquisa as traduções da camada Kotoba ou os glosses JMdict do idioma.

### Testes de integração (§23)

Os testes de integração (`apps/api/src/integration/integration.test.ts`) criam um banco
isolado (`kotoba_test`, derivado de `DATABASE_URL`), aplicam as migrations, importam o
fixture real do JMdict e exercitam API → busca → detalhe (fluxo E2E), incluindo o cenário de
aceitação de uma entrada com **múltiplas acepções** (車/くるま: veículo e roda) com
traduções por acepção, POS e busca topo em `pt-BR` (§26). O teste de storage do
`translations-importer` cobre mapeamento `jmdict_seq + sense_position`, proveniência e
idempotência (reescrever o mesmo lote não duplica).

### Preparada para IA (§31)

As camadas são isoladas e os contratos tipados, permitindo adicionar futuramente features
(explicações, tutor) sem reescrever o núcleo. Ver `# 37. Resultado esperado` no especificação.
