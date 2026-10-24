# Agent Tester

Chat-driven agentic e2e tests. The full spec is in [PROMPT.md](./PROMPT.md).

## Setup

Requires Bun ≥ 1.4 and Node ≥ 24 (Node is used later to run the e2e/Playwright tests).

```sh
bun install
cp .env.example .env
bun run dev        # web :5173, server :3000, mcp :3001, demo-shop :3002
bun run dev:web    # frontend only
```

## Layout

```
apps/web        React + Vite + Tailwind SPA (proxies /api and /artifacts to :3000)
apps/server     Bun + Hono backend: REST, chat, SSE, runner   (stub: /api/health)
apps/mcp        MCP server, thin REST client of the server     (stub)
apps/demo-shop  static demo target                             (stub)
packages/shared zod schemas + REST/SSE contract, shared by web, server, mcp
packages/core   compile/parse, storage, runner (server only)   (stub)
```

## Frontend start guide

The contract the UI codes against is in `packages/shared/src/`:

- `schema.ts` defines `Test`, `Step`, `Run`, `StepResult` and `RunSummary`
- `api.ts` lists every REST route with its request body and `TestEvent`, the SSE event union for `/api/tests/:id/events`

Import from `@agent-tester/shared`. The backend isn't built yet, so mock responses with these types until it is. Routes are `/` (tests list, see `src/routes/TestsPage.tsx`) and `/tests/:id` (chat on the left; Steps | Code | Runs tabs on the right; see `src/routes/TestPage.tsx`).
