# e2e runs under Node as a child process of the Bun server

The backend runs on Bun, but every e2e run is a Node child process working in a single e2e project at `server/runner/`. e2e requires Node (`^22.22.3 || >=24.8.0`) and runs under Node even when started with `bunx`, and Playwright's support under Bun isn't something to bet a demo on. A small Node script calls e2e's in-process `run()` with `onEvent` and prints JSON lines, which Bun turns into live per-step SSE events. If that proves unreliable, the fallback is `e2e run --reporter json` with results arriving at the end of the run. The deployment image therefore needs both Bun and Node.

Each Test has a stable file (`tests/<testId>.e2e.ts`, titled by testId) and its own `--cache-dir`, so renaming a Test keeps its Replay Cache. Each Run gets its own `--output`, because e2e clears its results directory on every run.
