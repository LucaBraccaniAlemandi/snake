# Agent Tester

Chat-driven agentic e2e tests. The full spec is in [PROMPT.md](./PROMPT.md).

## Setup

Requires Bun ≥ 1.4 and Node ≥ 24 (Node is used later to run the e2e/Playwright tests).

```sh
bun install
cp .env.example .env
bun run dev          # everything: client :5173, api :3000, mcp :3001, demo-shop :3002
bun run dev:client   # frontend only
bun run dev:server   # backend only (api, mcp, demo-shop)
```

## Layout

```
client/            React + Vite + Tailwind SPA (proxies /api and /artifacts to :3000)
server/api/        Bun + Hono backend: REST, chat, SSE, runner   (stub: /api/health)
server/mcp/        MCP server, thin REST client of server/api    (stub)
server/core/       compile/parse, storage, runner (used by api)  (stub)
server/demo-shop/  static demo target                            (stub)
shared/            zod schemas + REST/SSE contract, used by client and server
```

PROMPT.md still uses the old names: `apps/web` is now `client/`, `apps/server` is now `server/api/`, and `packages/*` and the other `apps/*` now live under `server/`. The one exception is `packages/shared`, which is now `shared/`.

## Frontend start guide

Work in `client/`. The contract the UI codes against is in `shared/src/`:

- `schema.ts` defines `Test`, `Step`, `Run`, `StepResult` and `RunSummary`
- `api.ts` lists every REST route with its request body and `TestEvent`, the SSE event union for `/api/tests/:id/events`

Import from `@agent-tester/shared`. The backend isn't built yet, so mock responses with these types until it is. Routes are `/` (tests list, see `client/src/routes/TestsPage.tsx`) and `/tests/:id` (chat on the left; Steps | Code | Runs tabs on the right; see `client/src/routes/TestPage.tsx`).
