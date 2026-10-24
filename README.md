# Agent Tester

Chat-driven agentic e2e tests. The full spec is in [PROMPT.md](./PROMPT.md).

Two independent projects, each with its own `package.json`, lockfile and `node_modules`.

## client/ (frontend)

React + Vite + Tailwind. Dev server on :5173, which proxies `/api` and `/artifacts` to the server on :3000.

```sh
cd client
bun install
bun run dev
```

- Routes: `/` lists tests (`src/routes/TestsPage.tsx`). `/tests/:id` has the chat on the left and Steps | Code | Runs tabs on the right (`src/routes/TestPage.tsx`).
- API types and the full route list are in `src/types.ts`. The backend isn't built yet, so mock responses with these types until it is.

## server/ (backend)

Bun workspace. Requires Bun 1.4.2 and Node ≥ 24.8 (Node runs the e2e/Playwright tests), plus Postgres.

```sh
cd server
bun install
cp .env.example .env         # set ANTHROPIC_API_KEY; DATABASE_URL points at the Docker Postgres
docker compose up -d db      # Postgres only, on 127.0.0.1:5432
bun run dev                  # api :3000 (runs migrations on start), demo-shop :3002
```

Data model: **Workspace → Test → Steps**. Steps are a JSON array on the Test, and Runs keep per-Step results as JSON (ADR-0004). Migrations live in `server/core/migrations/`. A "Default" Workspace always exists.

```
server/api/        Hono backend: REST, SSE, chat (/api/chat), runs, /artifacts
server/core/       zod schemas + REST contract, compile, Postgres storage + migrations, runner, tool definitions
server/runner/     the e2e project every Run executes in (e2e@0.21.3, @e2e-dev/web@0.15.3)
server/mcp/        MCP stdio server, thin REST client of api
server/demo-shop/  demo target on :3002 (coupon field hidden behind "Have a code?")
```

The full route list is at the top of `server/core/src/api.ts`. The REST/SSE types live in `server/core/src/schema.ts` and `api.ts`, and `client/src/types.ts` mirrors them. **Keep the two in sync by hand.**

### Docker

```sh
cd server
cp .env.example .env         # set ANTHROPIC_API_KEY (and POSTGRES_PASSWORD)
docker compose up -d --build  # api :3000, demo shop :3002, postgres on 127.0.0.1:5432
```

- **Image:** `server/Dockerfile` builds on `node:24` and adds Bun and the Chromium headless shell at the exact version `@e2e-dev/web` pins.
- **Volumes:** `pg-data` holds Postgres, `server-data` holds screenshots, and `replay-cache` holds e2e's Replay Cache.
- **Postgres:** holds all state. The server gets `DATABASE_URL` from compose and runs migrations on start.
- **Reachable URLs:** tests run inside the container, so a Starting URL must be reachable from there. `http://localhost:3002` (the demo shop in the same container) and public URLs work. Your host's `localhost` apps don't.

### MCP (Claude Code)

`server/.mcp.json` registers the stdio server, so open Claude Code in `server/` with the API running. To add it to Claude Code manually:

```sh
claude mcp add agent-tester -e SERVER_URL=http://localhost:3000 -e WEB_URL=http://localhost:5173 -- bun server/mcp/src/stdio.ts
```

Tools: `list_workspaces`, `create_workspace`, `list_tests`, `create_test`, `get_test`, `set_steps`, `edit_step`, `run_test` and `get_run`. Edits made over MCP show up live in the web UI.

PROMPT.md still uses the old layout: `apps/web` is now `client/`, and the other `apps/*` and `packages/*` now live under `server/`. Notes on the real e2e API are in [docs/e2e-api-notes.md](./docs/e2e-api-notes.md).
