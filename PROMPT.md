# Build: Agent Tester — chat-driven agentic e2e tests (hackathon project)

You are building a hackathon project with me. Optimize for a **working end-to-end demo**, not for completeness. Prefer simple, boring solutions. Ask me only if something truly blocks you; otherwise make a reasonable choice and note it in `DECISIONS.md`.

## The idea

A tester chats with an LLM ("test that a user can check out with coupon SAVE10"). The LLM writes an agentic e2e test using the open-source **`e2e` framework by TesterArmy** (npm package `e2e`, web engine `@e2e-dev/web`, built on Playwright). The test appears in a web UI as an **editable list of plain-English steps**. The tester can edit/add/delete/reorder steps by hand or by chatting. Pressing **Run** executes the test; results (pass/fail per step, error, screenshot) go back into the chat, and the LLM can **diagnose and fix** the test.

The same capabilities are exposed as a separate **MCP server**, so external coding agents (Claude Code, Cursor) can create, run and fix tests, and humans see them live in the web UI.

Design principle (from Anthropic's "code execution with MCP"): the agent writes **code** (the `.e2e.ts` script) against the e2e API instead of making many small tool calls, reads API docs **on demand**, and gets back **compact summaries** of run results rather than full logs.

## IMPORTANT: verify the e2e API first

Do NOT guess the e2e API. Before writing the compiler or runner:
1. Check the Node version e2e requires (the repo docs/CLI reference ask for Node 24.8+ or 22.22.3+; the landing page says 22.12+ — trust the package). e2e itself runs under **Node**, even though our backend runs on Bun (see Runtime notes).
2. In a scratch dir, run `npx e2e init` (choose the web engine) and read the generated config, example test and the bundled skill (`.agents/skills/e2e/SKILL.md`; `npx e2e guide <topic>` prints references).
3. Read the docs shipped in `node_modules/e2e/docs` (writing tests, agent steps `agent.act` / `agent.assert`, locators/`expect`, config, models, reporters, artifacts, caching/replay in `.e2e/cache`, CLI flags, `e2e mcp`, telemetry).
4. Write a short summary of the real API (fixture names, how to navigate to a URL, how to configure the model, where reports/artifacts/cache are written, how to get machine-readable results — e.g. `npx e2e run --reporter list,junit` and `.e2e/report.json`) into `docs/e2e-api-notes.md`. Everything else must follow those notes.

Disable telemetry in all runs (`E2E_TELEMETRY_DISABLED=1`).

## Architecture: 3 apps + shared packages

```
apps/
  web/      React + Vite SPA                      :5173 (dev)
  server/   Bun backend: REST, chat, SSE, runner  :3000
  mcp/      Bun MCP server (stdio + HTTP)         :3001
  demo-shop/ static demo target                   :3002
packages/
  core/     step schema, compile/parse, storage, runner   (used by server only)
  shared/   zod schemas, API types, tool names + descriptions (used by web, server, mcp)
```

- **Bun workspaces** (`"workspaces": ["apps/*", "packages/*"]` in root `package.json`), TypeScript everywhere, `bun install`, `bun run dev` starts all apps (e.g. with `concurrently` or a small Bun script).
- **The backend owns all state and runs.** The **MCP server is a thin adapter**: it does not touch the database or spawn runs; every MCP tool calls the backend's REST API (`SERVER_URL`, default `http://localhost:3000`). That keeps them truly separate, and because every change goes through the server, the web UI gets live updates for free.
- Tool names, input schemas and descriptions live in `packages/shared`, so the web chat's tools (in the server) and the MCP tools stay identical.

## Runtime notes (Bun)

- Server: **Hono** on Bun (`export default { port, fetch: app.fetch }` or `Bun.serve`). Use Hono's `streamSSE` for SSE.
- Database: **`bun:sqlite`** (built in) — not `better-sqlite3`. Single file `data/app.db`.
- Tests: **`bun test`**.
- Child processes: `Bun.spawn`.
- **Anything that runs Playwright/e2e runs under Node as a child process** (`npx e2e run`, and a small `node` script for `inspect_page`), not inside the Bun process — Playwright's support under Bun is not something to bet a demo on. So the machine needs both Bun and Node.
- Vite and React run fine with Bun (`bun run dev` / `bunx vite`).

## Backend REST API (`apps/server`)

```
GET    /api/tests                     list (id, name, url, last run status)
POST   /api/tests                     { name, url } -> test
GET    /api/tests/:id                 test (script + steps)
PUT    /api/tests/:id/steps           { steps } -> recompile script, save, broadcast
PUT    /api/tests/:id/script          { script } -> parse, normalize, save, broadcast; 400 with parse error
POST   /api/tests/:id/steps/edit      { op: add|update|delete|move, step, afterId? }
POST   /api/tests/:id/run             -> { runId }; with ?wait=true blocks and returns the compact summary
GET    /api/tests/:id/runs            run history
GET    /api/runs/:runId               run details + step results
GET    /api/tests/:id/events          SSE: test-updated, run-started, step-status, run-finished
GET    /api/docs/e2e[?topic=]         list doc files / return one page from node_modules/e2e/docs
POST   /api/inspect                   { url } -> page summary (title, truncated text, interactive elements, ≤4k chars)
POST   /api/chat                      { messages, testId } -> AI SDK UI message stream
GET    /artifacts/*                   files from data/runs/
```

Enable CORS for the web origin (or use the Vite proxy for `/api` and `/artifacts` in dev — preferred). In production the server also serves `apps/web/dist` as static files with SPA fallback.

Chat: AI SDK `streamText` (`ai`, `@ai-sdk/anthropic`, model id from env `CHAT_MODEL`) with the tools below bound to the current testId, calling `packages/core` directly; return with `toUIMessageStreamResponse()` (or the equivalent for the installed AI SDK version). Include the current steps in the system prompt each turn.

Live updates: an in-process event emitter in `packages/core`; the SSE route subscribes to it. All writes (UI, chat, MCP-via-REST) go through the server, so every change is broadcast.

## Data model

```ts
// packages/shared/src/schema.ts (zod)
Step = { id: string; type: "act" | "assert" | "expect"; text: string; target?: string; value?: string }
//  act    -> agent.act(text)         agentic action
//  assert -> agent.assert(text)      agentic check
//  expect -> deterministic check (exact text/value/URL); use target/value as the real API allows
Test = { id; name; url; script: string; steps: Step[]; updatedAt }
Run  = { id; testId; status: "queued"|"running"|"passed"|"failed"; startedAt; finishedAt;
         stepResults: { stepId; status; error?; screenshotPath? }[]; reportPath? }
```

## Script <-> steps (the core trick)

The **script is the source of truth**; steps are a view of it. To make parsing reliable, the compiler emits a constrained format: **one statement per step, each tagged with a step-id comment**:

```ts
import { test } from "e2e";            // adjust to real API

test("Checkout with coupon", async ({ /* real fixtures */ }) => {
  await /* navigate to */ ("https://shop.example.com");
  await agent.act("Add the first product to the cart"); // step:s1
  await agent.act("Open the cart and apply coupon SAVE10"); // step:s2
  await agent.assert("The order total shows a 10% discount"); // step:s3
});
```

Implement in `packages/core`:
- `compile(test: {name,url,steps}): string` — steps -> script (uses the real API from the notes; JSON.stringify all strings).
- `parseSteps(script): Step[]` — script -> steps. Use **`ts-morph`** to walk call expressions inside the test body; map `agent.act`/`agent.assert`/`expect...` to step types; read ids from `// step:<id>` comments, generate ids for untagged lines.
- Round-trip tests (`bun test`): `parseSteps(compile(x))` equals `x` for several cases, including quotes and newlines in text.
- When the LLM/agent saves a free-form script, parse it, then **re-compile** to normalize it (so it always stays editable as steps). If parsing fails, return a clear error so the agent can fix the script.

## Runner (`packages/core`, called by the server)

`runTest(testId): Promise<RunSummary>`:
1. Write the script to `data/workspaces/<testId>/tests/<testId>.e2e.ts` alongside an e2e config generated from the notes (model from env `E2E_MODEL`, API key from env). Install e2e deps once in a shared runner workspace (e.g. `data/runner/` with its own `package.json`) and point test workspaces at it, or run all tests from that one workspace — whichever is simpler with the real CLI.
2. **Persist e2e's replay cache per test** (`.e2e/cache`; it replays recorded agent actions without model calls until the app changes). When a step's text changes, invalidate the cache for that test (simplest: delete it).
3. `Bun.spawn(["npx", "e2e", "run", ...])` with a machine-readable reporter (timeout ~5 min, kill on timeout). Stream stdout lines as SSE progress events.
4. Parse the report (e.g. `.e2e/report.json`) into `stepResults`, map failures back to step ids (by order or step-id comment), copy screenshots/trace into `data/runs/<runId>/`.
5. Return a **compact summary**: `{ status, passed, failedStep: {id, text}, error (≤500 chars), screenshotUrl }`. Never return full logs to the model.

Run tests one at a time (a simple in-process queue is fine).

## Tools (defined in `packages/shared`; implemented by server chat and by MCP via REST)

| Tool | Input | Behavior (REST call used by MCP) |
|---|---|---|
| `list_tests` | — | `GET /api/tests` |
| `get_test` | testId | `GET /api/tests/:id` |
| `create_test` | name, url | `POST /api/tests` |
| `save_test_script` | testId, script | `PUT /api/tests/:id/script` — returns step list or parse error |
| `edit_step` | testId, op, step, afterId? | `POST /api/tests/:id/steps/edit` |
| `read_e2e_docs` | topic? | `GET /api/docs/e2e` (progressive disclosure) |
| `inspect_page` | url | `POST /api/inspect` |
| `run_test` | testId | `POST /api/tests/:id/run?wait=true` — compact summary |
| `get_run` | runId | `GET /api/runs/:runId` |

Tool descriptions must tell the model to: call `inspect_page` before writing steps for an unseen page; keep each step to a single user action or check; use `assert`/`expect` for verification and `expect` for exact values; after a failure, look at the failed step + screenshot, explain the cause in one or two sentences, fix with `edit_step` or `save_test_script`, and re-run at most 2 times before asking the tester. MCP tool results must include a link to the test in the web UI (`WEB_URL/tests/:id`).

## MCP server (`apps/mcp`, Bun)

- `@modelcontextprotocol/sdk`, registering the tools from `packages/shared`, each implemented as a `fetch` to `SERVER_URL`.
- `bun run mcp:stdio` — stdio transport (for Claude Code locally).
- Streamable HTTP at `http://localhost:3001/mcp` (for remote agents).
- Add a `.mcp.json` at the repo root that runs `bun apps/mcp/src/stdio.ts` with `SERVER_URL` set, and a README section showing how to add it to Claude Code.

## Web app (`apps/web`, React + Vite)

Routes (React Router): `/` lists tests with a "New test" form (name + URL); `/tests/:id` is the main screen. Tailwind for styling.

- **Left: Chat** (`@ai-sdk/react` `useChat`, pointed at `/api/chat`, sending `{ testId }` in the body; streaming). Show tool calls as compact chips ("Inspected page", "Updated 4 steps", "Run failed at step 3").
- **Right: Steps panel** — numbered list; each row shows a type badge (act / assert / expect), inline-editable text, delete, drag to reorder (`@dnd-kit`), "+ Add step". Edits call `PUT /api/tests/:id/steps` (debounced).
- The page opens an `EventSource` on `/api/tests/:id/events` and refreshes steps/run state on events, so changes from chat or MCP appear instantly.
- **Tabs on the right**: *Steps* | *Code* (read-only generated script, copy button) | *Runs* (history; click to see per-step status and screenshot).
- **Run button** in the header; while running, each step row shows live status (pending / running / passed / failed) and the failed row shows the error and a screenshot thumbnail.
- Vite dev proxy: `/api` and `/artifacts` → `http://localhost:3000`.
- Clean, minimal UI. It's a demo; polish the main flow, not settings.

## Deploy

- One **Dockerfile** based on the official Playwright image (`mcr.microsoft.com/playwright`, version matching the installed `playwright`, Node version matching e2e's requirement), with **Bun installed** on top. Build the web app; the server serves the SPA, API and artifacts on `PORT`; the MCP HTTP server runs as a second process (simple start script) or a second service — pick the simpler one for the host. Volume for `data/`.
- Target Railway or Fly.io; include notes in README. Not serverless (runs need browsers and long processes).
- `.env.example`: `ANTHROPIC_API_KEY`, `CHAT_MODEL`, `E2E_MODEL`, `E2E_TELEMETRY_DISABLED=1`, `PORT`, `MCP_PORT`, `SERVER_URL`, `WEB_URL`.

## Demo target

Add `apps/demo-shop`: a tiny static shop (product list, cart, coupon field that applies 10% for `SAVE10` behind a "Have a code?" link, checkout confirmation), served with `Bun.serve` on port 3002. It's the reliable target for the live demo, and the hidden coupon link gives the LLM a realistic failure to self-fix.

## Milestones (do them in order; commit after each)

1. Bun workspace scaffold (web, server, mcp, core, shared, demo-shop), `docs/e2e-api-notes.md` from the real package, demo shop running.
2. `packages/shared` + `packages/core`: schemas, compile, parseSteps + round-trip tests, `bun:sqlite` storage.
3. Runner: run a hand-written test against the demo shop and get a compact summary + screenshot. **Prove this works before building UI.**
4. Server REST + SSE, then the React UI: tests list, steps panel with editing, Code tab, Run with live status.
5. Chat with tools; full loop: describe → steps appear → edit → run → failure → auto-fix → pass.
6. MCP server (stdio + HTTP) as a REST client, `.mcp.json`; verify Claude Code can create and run a test that appears live in the browser.
7. Dockerfile + deploy notes + README with a 60-second demo script.

## Definition of done

From a fresh clone: `bun install && bun run dev` starts the web app (5173), the server (3000), the MCP HTTP server (3001) and the demo shop (3002). In the browser I can type "test that I can buy the first product with coupon SAVE10 on http://localhost:3002", see steps appear, edit one, run it, watch per-step status, see a failure explained and fixed by the chat, and see it pass. From Claude Code with the MCP server, I can do the same and see the test update live in the web UI.