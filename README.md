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
cp .env.example .env         # DATABASE_URL points at the Docker Postgres
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

### AI runtimes

The Settings page discovers agents and models from three runtimes:

- **OpenCode**: start its local HTTP server in a separate terminal with `opencode serve --hostname 127.0.0.1 --port 4096`. Agent Tester connects to `OPENCODE_BASE_URL`, reads the configured agents/models, and registers its own MCP tools for the chat session. OpenCode uses its existing provider configuration and authentication, so a local model configured there does not require an Agent Tester API key.
- **Claude Agent**: the Claude Agent SDK loads user/project/local Claude Code configuration, agents and MCP servers. Configure `ANTHROPIC_API_KEY` for remote model access; it stays server-side and is never stored in the browser. Agent Tester does not reuse Claude Code subscription login tokens.
- **Agent Tester**: the existing direct OpenRouter chat remains available as a fallback and requires `OPENROUTER_API_KEY` or `API_KEY`.

Chat conversations retain their runtime, agent and session ID in browser storage. The selected runtime/model is shown in the chat header.

The E2E runner uses the AI SDK directly rather than starting an interactive coding agent. By default it uses OpenRouter (`E2E_MODEL` and `OPENROUTER_API_KEY`/`API_KEY`). For a generic OpenAI-compatible endpoint, set `E2E_BASE_URL` and `E2E_MODEL`; set `E2E_API_KEY` only if that endpoint requires one. With `E2E_BASE_URL` and no `E2E_API_KEY`, the runner sends no Authorization header. The endpoint must support streaming and tool calling; browser assertions may also require vision.

Laya Browser runs use its MCP `browser_execute` Code Mode tool and a separate decision-model configuration. Configure `LAYA_MCP_COMMAND` and `LAYA_MCP_ARGS` in `server/.env` to launch `laya-browser-mcp.mjs`; for example, use `node` as the command and the absolute path to that MCP entrypoint as the single JSON-array argument. The MCP command and its installed dependencies must be accessible from the API process (a Windows host path will not be accessible from the Docker container unless the project/runtime is installed or mounted there). The API starts an isolated MCP/browser session for each Run. `JEV_BACKEND`, `JEV_API_URL`, `JEV_MODEL`, `TYPESAFE_API_KEY`, and `OPENROUTER_API_KEY` are passed to the MCP process; override these with `LAYA_MCP_ENV` when needed. `JEV_BACKEND=jev` uses hosted Jev, while `JEV_BACKEND=laya` connects to the configured local Laya inference server. Configure `JEV_BROWSER_VIDEO_DIR` for recorded Run evidence. The Laya Code Mode program is generated from the case steps, editable before execution, and snapshotted on that Run; edits do not change the case or later Runs.

### Docker

```sh
docker compose -f server/docker-compose.yml up --build
```

This single Compose stack starts PostgreSQL, the API, Demo Shop, the web client, and an OpenCode server inside the API container. The API and OpenCode share a container so OpenCode can launch the Agent Tester MCP stdio process. No `.env` file is required for the stack to start; copy `server/.env.example` to `server/.env` only when you need to set credentials or change configuration. Leave the host OpenCode server stopped when using the Docker stack; the container listens privately on its own loopback port 4096.

OpenCode reads `server/opencode-config` by default. Put the agents/provider configuration needed by Docker there, or set `OPENCODE_CONFIG_PATH` in `server/.env` to a host config directory. OpenCode's auth and runtime data persist in the `server-data` volume under `/data/opencode-home`. To authenticate from the container, run `docker compose -f server/docker-compose.yml exec server opencode auth login`. A host config can contain MCP commands and paths that do not exist inside Linux; copy only the agents/provider settings needed by this stack when those host MCPs are not required. Configure local inference endpoints so they are reachable from the container (for example, use `host.docker.internal` instead of host `localhost`).

- Run detached with `docker compose -f server/docker-compose.yml up --build -d`; follow output with `docker compose -f server/docker-compose.yml logs -f`.
- **Frontend:** http://localhost:5173 — Vite dev server with HMR; source is bind-mounted so saved code changes appear without rebuilding.
- **API:** http://localhost:3000.
- **Demo shop:** http://localhost:3002.
- **Postgres:** localhost:5432; application data lives in the `pg-data` volume.
- **Image:** `server/Dockerfile` builds on `node:24` and adds Bun and the Chromium headless shell required by `@e2e-dev/web`.
- **Volumes:** `pg-data` holds Postgres, `server-data` holds screenshots, `replay-cache` holds e2e's Replay Cache, and `client-node-modules` holds frontend dependencies.
- **Postgres:** holds all application state. Compose sets `DATABASE_URL`; SQL migrations run when the server starts.
- **Reachable URLs:** tests run inside the container, so a Starting URL must be reachable from there. `http://localhost:3002` (the demo shop in the same container) and public URLs work. Your host's `localhost` apps don't.
- **Claude Agent:** set `ANTHROPIC_API_KEY` in `server/.env` if you want to use Claude from this container.
- Use `docker compose -f server/docker-compose.yml down` to stop the stack. Named volumes are preserved; add `-v` only to intentionally delete persisted data.

### MCP

`server/.mcp.json` registers the stdio server for Claude Code. OpenCode receives the same Agent Tester MCP tools dynamically when the chat starts. Both runtimes use their configured agents and sessions; the web chat streams text and tool activity through the API. API keys remain server-side.

### Jira Cloud integration

Configure Jira from **Configuración → Jira** in the web app. Create an Atlassian API token with read access to the target project, then enter the Jira Cloud site URL, Atlassian email, token, and project key. The token is encrypted with AES-256-GCM in Postgres; it is never returned to the browser or saved in browser storage.

Before saving the first Jira connection, set `JIRA_ENCRYPTION_KEY` in `server/.env` to a stable 32-byte key encoded as base64. Generate one with:

```sh
openssl rand -base64 32
```

Keep this key backed up and private: changing or losing it makes existing encrypted Jira tokens unreadable. Jira tickets are fetched live when opening **Generación IA** or pressing **Actualizar**; the app does not persist ticket copies. If Jira is disconnected, the generator shows no tickets. Ticket analysis uses the server's configured `CHAT_MODEL` and `OPENROUTER_API_KEY` (or `API_KEY`); without an available model, it displays the actual error instead of sample suggestions.

The application does not yet provide user authentication. Run the Jira-connected app only on a trusted local/network environment; do not expose its API to untrusted users until workspace access controls are added.
