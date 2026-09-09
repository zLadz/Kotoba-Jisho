# LadJisho

Jisho em Português

## API REST

A API é um **Modular Monolith** em Fastify, versionada em `/api/v1`.

Iniciar em modo de desenvolvimento (requer PostgreSQL via `docker compose up -d`):

```bash
npm run dev
```

### Endpoints

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

Códigos: `VALIDATION_ERROR` (400), `ENTRY_NOT_FOUND` (404), `NOT_FOUND` (404,
rota inexistente), `DATABASE_UNAVAILABLE` (503) e `INTERNAL_ERROR` (500).

### Configuração

Variáveis de ambiente: `HOST`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN` e `DATABASE_URL`
(ver [`.env.example`](.env.example)).

## Frontend

Aplicação Next.js (App Router) + React + Tailwind CSS em `apps/web`.

```bash
npm run dev
```

Subir API e frontend juntos em desenvolvimento: `npm run dev` usa
[`concurrently`](https://www.npmjs.com/package/concurrently) — API em
`http://localhost:3000` e frontend em `http://localhost:3001`.

A busca é feita contra `GET /api/v1/search` e o detalhe contra
`GET /api/v1/entries/:id`. Para apontar o frontend para outra instância da API,
defina `NEXT_PUBLIC_API_URL` (padrão `http://localhost:3000`).
