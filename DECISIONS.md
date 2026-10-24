# Decisions log

Small choices made while building. Big ones are in `docs/adr/`, terms in `GLOSSARY.md`.

- **Time budget:** 24 hours. If time runs short, cut in this order: deploy → MCP HTTP transport (keep stdio) → Runs history endpoint → `/api/docs/e2e` and `/api/inspect`. The loop chat → steps → run → fix is never cut.
- **Repo layout:** `client/` and `server/` are independent projects. The API types are duplicated in `server/core/src/{schema,api}.ts` and `client/src/types.ts`, kept in sync by hand.
- **Starting URL:** a field on the Test, compiled to `await app.open(url)`. It's never a Step.
- **Expectations:** only "text is visible" (`expect(screen.getByText(value)).toBeVisible()`) and "URL contains" (`target: "url"`, `expect(browser).toHaveURL(...)`).
- **Auth:** none. An optional `ACCESS_TOKEN` env var, when set, is required by the API and MCP.
- **Concurrent writes:** the last write wins, and every write is broadcast over SSE. A Run executes a snapshot of the Steps taken when it starts.
- **Auto-fix:** when a button-started Run fails, the client posts its Run Summary into the chat, which starts diagnose-and-fix with at most 2 re-runs. Runs that end in `error` are never auto-fixed.
- **Chat history:** saved per Test in SQLite. MCP activity appears only as `test-updated` events with `source: "mcp"`.
- **Replay Cache:** never cleared manually, because its key already includes each Step's text.
- **Run queue:** in-process, one Run at a time. `?wait=true` blocks for at most 5 minutes, then kills the process. Asking to run a Test that's already queued or running returns the existing `runId`.
- **Models:** `CHAT_MODEL` and `E2E_MODEL` both default to `claude-sonnet-5-5`.
- **Deploy:** Railway, one container (the Playwright image plus Bun). The API serves `client/dist`, the MCP HTTP server runs as a second process, and a volume holds `data/`.
