# Kotoba

> **Open-source Japanese multilingual dictionary platform, initially focused on Brazilian
> Portuguese, built with TypeScript, Node.js, Fastify, Next.js and PostgreSQL.**

Kotoba é um dicionário Japonês → Português Brasileiro. Pesquise por **kanji** (食べる),
**kana** (たべる), **romaji** (taberu) ou **tradução** (comer) e abra a página detalhada de
cada palavra, com leituras, romaji, classe gramatical e acepções.

## Stack

| Camada    | Tecnologia                                                                       |
| --------- | -------------------------------------------------------------------------------- |
| Linguagem | TypeScript (strict)                                                              |
| Banco     | PostgreSQL 17 + [Drizzle ORM](https://orm.drizzle.team) (migrations versionadas) |
| API       | Fastify (monolith modular, `apps/api`)                                           |
| Frontend  | Next.js (App Router) + React + Tailwind CSS (`apps/web`)                         |
| Testes    | Vitest (unitários + integração)                                                  |
| Qualidade | ESLint, Prettier                                                                 |
| CI        | GitHub Actions                                                                   |

## Arquitetura

Monorepo npm workspaces com camadas isoladas:

```text
apps/
  api/        Fastify — módulos health, search e dictionary (/api/v1)
  web/        Next.js — busca (client) e detalhe (server component)
packages/
  database/   Schema Drizzle, migrations e seed
  romaji/     Conversão kana → romaji (campo derivado)
  types/      Contratos de domínio
  validation/ Schemas Zod dos contratos da API
  config/     Configurações compartilhadas
services/
  importer/   CLI de importação do JMdict
docs/
```

Decisões-chave: romaji é um **campo derivado** (nunca fonte de verdade), busca e ranking
vivem no `SearchService` sobre SQL PostgreSQL, dados multilíngue sem colunas fixas por
idioma e o modelo preparado para adicionar IA/recursos no futuro.
Detalhes em [`docs/architecture.md`](docs/architecture.md).

## Como executar localmente

Quickstart:

```bash
git clone <repository>
cd kotoba

docker compose up -d

npm install

npm run db:migrate
npm run db:seed

npm run dev
```

Frontend: <http://localhost:3001> · API: <http://localhost:3000> ·
Health check: <http://localhost:3000/api/v1/health>

### Uso

1. Abra o Kotoba em <http://localhost:3001>.
2. Pesquise `食べる`.
3. Encontre a entrada.
4. Veja a leitura `たべる`.
5. Veja o romaji `taberu`.
6. Veja a tradução em português.
7. Abra a página detalhada.
8. Veja as informações lexicais (kanji, leituras, classes gramaticais e acepções).

Guia completo de desenvolvimento (ambiente, migrations, seeds, testes, importação e
troubleshooting): [`docs/development.md`](docs/development.md).

## Comandos

| Comando                 | Descrição                                 |
| ----------------------- | ----------------------------------------- |
| `npm run dev`           | API (`:3000`) + frontend (`:3001`) juntos |
| `npm run build`         | Build de produção (Next.js)               |
| `npm run typecheck`     | TypeScript em todos os workspaces         |
| `npm run lint`          | ESLint                                    |
| `npm test`              | Vitest (unitários + integração)           |
| `npm run format:check`  | Prettier (check)                          |
| `npm run db:generate`   | Gera migrations a partir do schema        |
| `npm run db:migrate`    | Aplica as migrations                      |
| `npm run db:seed`       | Insere o dataset de desenvolvimento       |
| `npm run import:jmdict` | Importa o JMdict (ver abaixo)             |

## API REST

API Fastify versionada em `/api/v1`.

| Método | Rota                       | Descrição                                                                                        |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/v1/health`           | Health check (verifica a conexão com o banco)                                                    |
| `GET`  | `/api/v1/search?q=&limit=` | Busca por japonês, kana, romaji ou tradução (`q` obrigatório; `limit` opcional, 1–50, padrão 20) |
| `GET`  | `/api/v1/entries/:id`      | Detalhe de uma entrada por `id` (UUID interno)                                                   |

### Exemplo

```http
GET /api/v1/search?q=taberu
```

```json
{
  "query": "taberu",
  "results": [
    {
      "id": "433eee2c-7140-42d3-98c7-d8d98c00da7e",
      "kanji": ["食べる"],
      "readings": ["たべる"],
      "romaji": ["taberu"],
      "glosses": [{ "language": "pt", "text": "comer" }]
    }
  ]
}
```

### Erros

Erros seguem um corpo consistente, com `code` e `message`:

```json
{ "error": { "code": "ENTRY_NOT_FOUND", "message": "Entry not found" } }
```

Códigos: `VALIDATION_ERROR` (400), `ENTRY_NOT_FOUND` (404), `NOT_FOUND` (404, rota
inexistente), `DATABASE_UNAVAILABLE` (503) e `INTERNAL_ERROR` (500).

### Configuração da API

Variáveis: `HOST`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN` e `DATABASE_URL` (ver
[`.env.example`](.env.example)).

## Frontend

Aplicação Next.js da busca e do detalhe em `apps/web`. O comando `npm run dev` sobe API e
frontend juntos via [`concurrently`](https://www.npmjs.com/package/concurrently). Para
apontar para outra instância da API, defina `NEXT_PUBLIC_API_URL` (padrão
`http://localhost:3000`).

## Importar o JMdict

```bash
# Arquivo local (XML ou .gz)
npm run import:jmdict -- --file caminho/para/JMdict.xml.gz

# Download automático da versão oficial
npm run import:jmdict
```

O importer valida entradas, preserva os identificadores/metadados do JMdict e registra
versão, checksum e data em `source_imports`.

## Fontes de dados e licenças

- **JMdict** (EDRDG / Electronic Dictionary Research and Development Group, originalmente
  coordenado por Jim Breen): licenciado sob **Creative Commons Attribution-ShareAlike 4.0
  (CC BY-SA 4.0)**. Projeto: <https://www.edrdg.org/jmdict/j_jmdict.html>.
- A versão exata utilizada e as responsabilidades de atribuição estão em
  [`docs/data-sources.md`](docs/data-sources.md).

## Roadmap

```text
Kanji → Examples → User accounts → Favorites → Study lists → SRS → AI explanations →
AI tutor → Premium features → Additional languages
```

## Documentação

- [`docs/architecture.md`](docs/architecture.md) — arquitetura e decisões
- [`docs/development.md`](docs/development.md) — como desenvolver, testar e importar dados
- [`docs/data-sources.md`](docs/data-sources.md) — fontes de dados e licenças
