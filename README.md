# Agent Tester

Chat-driven agentic e2e tests. The full spec is in [PROMPT.md](./PROMPT.md).

The repository contains two independent projects, each with its own package manifest and dependencies.

## Client

React + Vite + Tailwind. The workspace UI lives in `client/src/routes/WorkspacePages.tsx`; test cases and runs load from the API. Editing, deletion, and execution are persisted by the backend.

```sh
cd client
bun install
bun run dev
```

The Vite dev server runs on :5173 and proxies `/api` and `/artifacts` to the API on :3000.

## Server

Bun workspace. Requires Bun 1.4.2, Node ≥ 24.8 (for e2e/Playwright), and PostgreSQL.

```sh
cd server
bun install
cp .env.example .env         # set ANTHROPIC_API_KEY; DATABASE_URL points at the Docker Postgres
docker compose up -d db      # Postgres only, on 127.0.0.1:5432
bun run dev                  # api :3000 (runs migrations on start), demo-shop :3002
```

Data model: **Workspace → Test → Steps**. Steps and test metadata are stored on each Test; Runs retain a test snapshot and per-step results. Versioned SQL migrations live in `server/core/migrations/`. A "Default" Workspace always exists and backs the compatibility routes used by the client.

```
server/api/        Hono backend: REST, SSE, chat (/api/chat), runs, /artifacts
server/core/       schemas + REST contract, compile, Postgres storage + migrations, runner, tool definitions
server/runner/     the e2e project every Run executes in
server/mcp/        MCP stdio server, thin REST client of api
server/demo-shop/  demo target on :3002
```

### Docker

```sh
cd server
cp .env.example .env         # set ANTHROPIC_API_KEY (and POSTGRES_PASSWORD)
docker compose up -d --build  # api :3000, demo shop :3002, postgres on 127.0.0.1:5432
```

- **Image:** `server/Dockerfile` builds on `node:24` and adds Bun and the Chromium headless shell required by `@e2e-dev/web`.
- **Volumes:** `pg-data` holds Postgres, `server-data` holds screenshots, and `replay-cache` holds e2e's Replay Cache.
- **Postgres:** holds all application state. Compose sets `DATABASE_URL`; SQL migrations run when the server starts.
- **Reachable URLs:** tests run inside the container, so a Starting URL must be reachable from there. `http://localhost:3002` (the demo shop in the same container) and public URLs work. Your host's `localhost` apps don't.

### MCP

`server/.mcp.json` registers the stdio server, so open Claude Code in `server/` with the API running. Tools include workspace and test CRUD, step editing, execution, and run inspection.
