# Desenvolvimento

Guia para rodar e desenvolver o Kotoba localmente.

## Requisitos

- Node.js >= 20 (desenvolvido com Node 24)
- npm
- Docker (para o PostgreSQL via `docker compose`)

## Setup rápido

```bash
docker compose up -d          # sobe o PostgreSQL
npm install
npm run db:migrate            # aplica as migrations
npm run db:seed               # semeia o dataset de desenvolvimento
npm run dev                   # API (:3000) + frontend (:3001)
```

Frontend: <http://localhost:3001> · API: <http://localhost:3000> ·
Health: <http://localhost:3000/api/v1/health>

## Configuração de ambiente

Copie `.env.example` para `.env` (na raiz) e ajuste quando necessário. O `.env` da raiz é
carregado localmente por `@kotoba/database` e pelo config do Drizzle. Variáveis:

| Variável              | Padrão                                                          | Descrição                       |
| --------------------- | --------------------------------------------------------------- | ------------------------------- |
| `DATABASE_URL`        | `postgresql://kotoba:kotoba_dev_password@localhost:5432/kotoba` | String de conexão do PostgreSQL |
| `POSTGRES_*`          | (docker compose)                                                | Configuração do container       |
| `HOST` / `PORT`       | `0.0.0.0` / `3000`                                              | Bind da API                     |
| `LOG_LEVEL`           | `info`                                                          | Nível do logger pino da API     |
| `CORS_ORIGIN`         | `true` (permite qualquer origem)                                | Origem permitida no CORS        |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000`                                         | URL da API usada pelo frontend  |

Se `DATABASE_URL` já estiver definida no ambiente, o `.env` não é carregado (o ambiente tem
prioridade).

## Comandos

| Comando                               | Descrição                                        |
| ------------------------------------- | ------------------------------------------------ |
| `npm run dev`                         | API + frontend em desenvolvimento (concurrently) |
| `npm run dev:api` / `npm run dev:web` | Apenas um dos processos                          |
| `npm run build`                       | Build de produção (Next.js)                      |
| `npm run typecheck`                   | TypeScript em todos os workspaces                |
| `npm run lint`                        | ESLint                                           |
| `npm run test`                        | Vitest (unitários + integração)                  |
| `npm run format:check`                | Prettier (check)                                 |
| `npm run format:write`                | Prettier (formata)                               |
| `npm run db:generate`                 | Gera migrations a partir do schema Drizzle       |
| `npm run db:migrate`                  | Aplica migrations pendentes                      |
| `npm run db:seed`                     | Semear o dataset de desenvolvimento              |
| `npm run import:jmdict`               | Importa o JMdict (ver abaixo)                    |
| `npm run benchmark:search`            | Benchmark de latência da busca por tier          |

## Migrations

O schema vive em `packages/database/src/schema.ts`.

- Após alterar o schema, gere uma migration: `npm run db:generate`.
- Aplique: `npm run db:migrate`.
- Migrations ficam versionadas em `packages/database/migrations`.
- Para **busca fuzzy**, a extensão PostgreSQL `pg_trgm` e os índices GIN estão na
  migration `0002`. Em ambientes não Docker (ou com usuário sem permissão), `db:migrate`
  cuida da extensão — `pg_trgm` é uma extensão _trusted_ e pode ser criada pelo dono do
  banco.

## Seeds

`npm run db:seed` insere o dataset curado em `packages/database/src/seed/data.ts`
(subconjunto do JMdict com traduções pt-BR), usado como base de desenvolvimento e pelo
fluxo end-to-end dos testes de integração.

## Importar o JMdict

Duas formas (detalhes sobre a fonte em [`docs/data-sources.md`](data-sources.md)):

```bash
# 1) Arquivo local (XML ou .gz) — recomendado para usar um snapshot já baixado
npm run import:jmdict -- --file caminho/para/JMdict.xml.gz

# 2) Download automático da versão oficial (pode demorar, arquivo grande)
npm run import:jmdict

# tamanho de lote customizado (padrão 1000 entradas por transação)
npm run import:jmdict -- --batch-size 2000
```

O importer:

- faz streaming (readline + gunzip), sem carregar o arquivo inteiro em memória;
- valida cada entrada e registra falhas/avisos no log; entradas inválidas são contadas e
  ignoradas, sem abortar a importação;
- importa em **lotes transacionais** — um lote com erro faz rollback atômico e a execução
  termina com status `failed` em `source_imports`;
- é **idempotente**: reimportar a mesma `source+version` substitui as entradas existentes
  (UPDATE/exclusão de crianças) sem duplicar;
- grava em `source_imports` a proveniência (versão derivada do cabeçalho, checksum SHA-256,
  `imported_at`), o ciclo de vida (`status` pending/running/completed/failed), contadores
  (processed/inserted/updated/skipped/errors) e `duration_ms`; o resumo final sai no log com
  entradas/s e RSS;
- deriva `romaji` (`@kotoba/romaji`) e `normalized_text` (`@kotoba/normalize`, NFKC +
  katakana→hiragana + sem acentos) para cada leitura/tradução.

Nesta versão não são importados `lsource`, `xref`/`ant` e `s_inf` (evolução futura).

Para substituir o dataset inteiro já importado, o importer detecta a nova versão e mantém o
histórico em `source_imports` (uma linha por `source+version`).

## Testes

```bash
npm test
```

- **Unitários**: parser do JMdict (incluindo entradas inválidas/malformadas), validação,
  romaji, normalização, validações (schemas), ranking, busca, DTOs, services.
- **Integração** (`apps/api/src/integration/integration.test.ts`): exige o PostgreSQL em
  `localhost:5432`. O teste cria um banco isolado `kotoba_test` (derivado de
  `DATABASE_URL`), aplica as migrations, importa o fixture e exercita busca e detalhe
  através da aplicação real — incluindo o fluxo end-to-end seed → banco → API → busca →
  resultado, paginação com `offset` e busca por variantes kana.
- **Repositório de busca** (`apps/api/src/modules/search/search.repository.test.ts`): contra
  o mesmo `kotoba_test`, cobre os 18 tiers (exata/token/prefixo/fuzzy × leitura/kanji/
  romaji/gloss, nos textos brutos e normalizados).
- **Banco** (`services/importer/src/storage.test.ts`): idempotência de reimportação,
  rollback atômico, ciclo de vida de `source_imports`, constraints (§15 — unicidades e FKs)
  e presença dos índices de busca.

> Se o banco não estiver disponível, os testes de integração falham (esperado). Suba o
> container com `docker compose up -d` antes de rodar `npm test`. Os arquivos de
> integração rodam em série (`fileParallelism: false`), cada um recriando `kotoba_test`.

## CI

`.github/workflows/ci.yml` roda em push para `main` e em pull requests:
PostgreSQL service → `install` → `db:migrate` → `db:seed` → `typecheck` → `lint` →
`test` → `build`.

## Docker (imagem da API)

O backend também possui uma imagem Docker (`apps/api/Dockerfile`, node:24-alpine —
build com `npm ci` no monorepo). Para criar e rodar conectado ao PostgreSQL local:

```bash
docker build -f apps/api/Dockerfile -t kotoba-api .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://kotoba:kotoba_dev_password@host.docker.internal:5432/kotoba \
  kotoba-api
```

O `docker compose` (somente PostgreSQL) continua sendo o ambiente padrão para
desenvolvimento; a imagem é uma opção para executar a API fora do processo local.

## Problemas comuns

- **`DATABASE_URL is required`**: defina a variável ou copie `.env.example` para `.env`.
- **Porta ocupada**: a API usa `3000` e o frontend `3001` (alteráveis via env).
- **`npm run test` falha**: confirme que o container do banco está no ar (`docker compose
ps`) — os testes de integração precisam do PostgreSQL.
