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

Bun workspace. Requires Bun ≥ 1.4 and Node ≥ 24 (Node runs the e2e/Playwright tests).

```sh
cd server
bun install
cp .env.example .env
bun run dev        # api :3000, mcp :3001, demo-shop :3002
```

```
server/api/        Hono backend: REST, chat, SSE, runner   (stub: /api/health)
server/mcp/        MCP server, thin REST client of api     (stub)
server/core/       zod schemas + REST contract, compile/parse, storage, runner
server/demo-shop/  static demo target                      (stub)
```

The REST/SSE types live in `server/core/src/schema.ts` and `api.ts`, and `client/src/types.ts` mirrors them. **Keep the two in sync by hand.**

PROMPT.md still uses the old layout: `apps/web` is now `client/`, and the other `apps/*` and `packages/*` now live under `server/`. Notes on the real e2e API are in [docs/e2e-api-notes.md](./docs/e2e-api-notes.md).
