# Decisions log

Small choices made while building. Big ones are in `docs/adr/`, terms in `GLOSSARY.md`.

- **Time budget:** 3 hours (revised down from 24). The loop chat → steps → run → fix is never cut. Cut for this budget:
  - **No script parser** (no `save_test_script`, `PUT /script` or ts-morph). The chat edits Steps directly with `edit_step`/`set_steps`.
  - **No live per-step status.** `e2e run --reporter json`, with all Step Results arriving when the Run ends. This supersedes the onEvent plan in ADR-0002.
  - **Chat history lives only in the browser**, not in the database.
  - **Not built:** deploy, MCP HTTP transport, `/api/inspect`, `/api/docs/e2e`, runs history endpoint, `ACCESS_TOKEN`. MCP stdio was built.
  - **Build order:** tests CRUD + SSE → runner → chat → (MCP stdio). `client/` is owned by the partner and the backend never edits it.
- **Storage:** Postgres only, via `Bun.sql`. The model is Workspace → Test → Steps (Steps as JSON), see ADR-0004. A "Default" Workspace is created by the first migration, and the last Workspace can't be deleted. Deletes cascade to Tests, Runs and screenshots. JSON goes into Postgres as `${JSON.stringify(x)}::text::jsonb`, because Bun 1.4.2 has no `sql.json`, and plain `::jsonb` would store a JSON string. `bun-types` is pinned to 1.4.2 to match the runtime.
- **Repo layout:** `client/` and `server/` are independent projects. The API types are duplicated in `server/core/src/{schema,api}.ts` and `client/src/types.ts`, kept in sync by hand.
- **Starting URL:** a field on the Test, compiled to `await app.open(url)`. It's never a Step.
- **Expectations:** only "text is visible" (`expect(screen.getByText(value)).toBeVisible()`) and "URL contains" (`target: "url"`, `expect(browser).toHaveURL(...)`).
- **Docker:** a single image, `node:24` plus Bun plus a pinned Chromium, runs as the non-root `node` user and runs the API and the demo shop together, so tests can open `http://localhost:3002`. `server/docker-compose.yml` (with `server/.mcp.json`; the repo root holds no server files) runs Postgres bound to 127.0.0.1.
- **Extra routes:** `PATCH /api/tests/:id` (rename or change the Starting URL) and `DELETE /api/tests/:id`.
- **Run results:** `POST /run` returns 202 `{ runId }`. The UI follows the run through the `run-started` and `run-finished` SSE events. `run-finished` carries every Step Result, with `skipped` for steps after a failure.
- **Concurrent writes:** the last write wins, and every write is broadcast over SSE. A Run executes a snapshot of the Steps taken when it starts.
- **Auto-fix:** when a button-started Run fails, the client posts its Run Summary into the chat, which starts diagnose-and-fix with at most 2 re-runs. Runs that end in `error` are never auto-fixed.
- **MCP activity:** appears only as `test-updated` events with `source: "mcp"`.
- **Replay Cache:** never cleared manually, because its key already includes each Step's text.
- **Run queue:** in-process, one Run at a time. `?wait=true` blocks for at most 5 minutes, then kills the process. Asking to run a Test that's already queued or running returns the existing `runId`.
- **Models:** `CHAT_MODEL` and `E2E_MODEL` both default to `claude-sonnet-5-5`.
- **Deploy:** Railway, one container (the Playwright image plus Bun). The API serves `client/dist`, the MCP HTTP server runs as a second process, and a volume holds `data/`.
