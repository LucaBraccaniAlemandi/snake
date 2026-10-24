# e2e API notes

These notes cover `e2e@0.21.3` and `@e2e-dev/web@0.15.3` by TesterArmy (github.com/tester-army/e2e). They were checked against the installed docs, the `.d.ts` files, `schema/report-v1.schema.json` and real runs on 2026-10-24. Nightlies ship every day, so **pin the versions**.

## Runtime

- Node `^22.22.3 || >=24.8.0`. e2e always runs under Node, even when started with `bunx`.
- `@e2e-dev/web` pins `playwright-core@1.64.1`. On the first run it downloads Chrome Headless Shell into `~/Library/Caches/ms-playwright`.
- Peer deps: `ai@^7` and `@ai-sdk/openai@^4`. OpenRouter is configured through the OpenAI-compatible provider at `https://openrouter.ai/api/v1` and reads `OPENROUTER_API_KEY`.
- Disable telemetry with `E2E_TELEMETRY_DISABLED=1`. `DO_NOT_TRACK=1` also works.
- e2e does not load `.env`. Call `process.loadEnvFile()` in the config if you need it.

## Writing a test

```ts
import { test } from "@e2e-dev/web";   // types the `browser` fixture
import { expect } from "e2e";

test("Checkout with coupon", async ({ app, browser, agent, screen }) => {
  await app.open("http://localhost:3002");          // or a path relative to the target url
  await agent.act("Add the first product to the cart");
  await agent.assert("The cart shows 1 item");
  await expect(screen.getByText("Order confirmed")).toBeVisible();
  await expect(browser).toHaveURL(/\/confirmation/);
});
```

- **Fixtures:** `agent`, `app`, `screen` and `platform`. The web engine adds `browser`. There is **no `test.step`**: each awaited call is already a step in the report.
- **Signatures:**
  - `agent.act(instruction, { params?, timeout?, maxSteps?, maxModelCalls? }) -> ActResult`
  - `agent.assert(assertion, { timeout? (default 30000), screenshot?, vision? }) -> void`
  - `agent.waitFor(condition, ...)`
  - `agent.extract(instruction, { schema })`
- **Params:** `agent.act("invite {email}", { params: { email } })`.
- **Deterministic checks:**
  - Locators: `screen.getByRole(role, name)`, `getByLabel`, `getByTestId` and `getByText`, plus `browser.locator(css)`.
  - Matchers: `expect(locator).toBeVisible()`, `.toHaveText()` and `.toHaveCount()`, plus `expect(browser).toHaveURL()`.

## Config (`e2e.config.ts`)

The config is found from the cwd upward, or set with `--config`. Its directory is the project root, and an unknown key gives `INVALID_CONFIG`.

```ts
import { createOpenAI } from "@ai-sdk/openai";
const openrouter = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY });
export default {
  agents: { default: { model: openrouter.chat((process.env.E2E_MODEL ?? "openrouter/inception/mercury-2.5").replace(/^openrouter\//, "")) } },
  targets: [{ engine: web(), app: { url: "http://localhost:3002" } }],
  tests: "tests/**/*.e2e.ts",   // files outside this glob -> exit 2 NO_TESTS
  timeout: 120000, retries: 0, output: ".e2e", trace: "retain-on-failure", video: "off",
  cache: "read-write",          // { mode, dir, strict }; defaults to read-only when CI is set
} satisfies E2EConfig;
```

Opus 5.5 and Sonnet 5.5 reject a forced tool choice, and e2e falls back to `auto` on its own.

The application shares provider configuration in `server/core/src/model.ts`. Use Chat Completions explicitly for OpenRouter. Unit tests in `model.test.ts` use a simulated HTTP transport and never send real credentials. A live text-generation smoke check from the rebuilt server container returned `OK` with `inception/mercury-2.5` on 2026-10-24; a full browser-agent run is a separate check.

## CLI: `e2e run [files...]`

- **Flags:**
  - `--config`, `--grep`, `--tag`, `--retries`, `--max-duration`
  - `--reporter list|json|junit|markdown` (you can't combine `json` with `list`)
  - `--output <dir>`, `--cache-dir <dir>`, `--no-cache`, `--trace`, `--headed`
- **Missing flags:** there is no cwd flag (set the spawn cwd) and no per-test timeout flag.
- **Exit codes:**
  - 0: passed
  - 1: a test failed
  - 2: CLI or config error
  - 3: engine, app or model-provider error (for example, no API key)
  - 4: internal error
  - 130: interrupted
- **In-process runner:** `import { run } from "e2e/runner"` takes `files`, `cwd`, `config`, `onEvent` and `signal`. It is unverified under Bun.

## Output

- `<output>/report.json` is always written (`schemaVersion: "report-1"`). `--reporter json` prints the same document to stdout.
- Each run clears `<output>/results/`, so **give each run its own `--output`**. That directory must be inside the project root, and it can't be the root or the cache dir.
- On failure: `<output>/results/<file>-<title>-<hash>/attempt-1/screenshots/001-failure.png`, plus `screen-at-failure.txt` and `trace.md`. Passing steps get no screenshots.

### report.json shape

- `run`: `{ status: passed|failed|blocked|error|interrupted, exitCode, results[], errors[], summary{passed, failed, skipped, ...} }`
- `results[]`: `{ testId: "tests/x.e2e.ts::<title>", file, titlePath, selected, status, attempts[] }`
- `attempts[]`: `{ status, error{category, code, message}, artifacts[{kind, path}], steps[] }`. Artifact paths are relative to `<output>/results`.
- `steps[]`: `{ index, kind, api: "app.open"|"agent.act"|"agent.assert"|"expect.toHaveText"|..., label, status, durationMs, source{file, line, column}, error?, cache?{mode, reason, entry, write} }`

**Mapping back to our steps:** use `source.line`, the line of the awaited call. One statement can produce several report steps. Steps after a failure are **not recorded**.

## Replay cache

- **Files:** one file per `agent.act`, at `<cache-dir>/<sha256>.json`. Only `act` is cached: `assert`, `waitFor` and `extract` always call the model.
- **Key:** test file path, test title, instruction, params, agent, target, engine and project id. Changing the model does **not** cause a miss. Editing a step's text therefore misses on its own, with no manual invalidation needed.
- **When an entry is saved:** only if a *later* check passes (a locator `expect` or `agent.assert`).
- **Clearing:** `e2e cache clear` deletes everything. To clear per test, give each test its own `--cache-dir`.

## Not verified yet

These still need a real `OPENROUTER_API_KEY`:
- a live `agent.act`/`agent.assert` run and its full step fields
- the cache entry format
- the runner API under Bun
