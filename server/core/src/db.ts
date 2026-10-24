import postgres from "postgres";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(import.meta.dir, "../../data"));
mkdirSync(DATA_DIR, { recursive: true });

const connectionString = process.env.DATABASE_URL ?? "postgres://agent:agent@localhost:5432/agent_tester";
export const db = postgres(connectionString, { max: Number(process.env.DB_POOL_SIZE ?? 10), idle_timeout: 20 });

export const ready = (async () => {
  await db`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  const [migration] = await db<{ version: number }[]>`SELECT version FROM schema_migrations WHERE version = 1`;
  if (!migration) {
    await db.begin(async (tx) => {
      await tx`CREATE TABLE IF NOT EXISTS tests (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        steps JSONB NOT NULL DEFAULT '[]'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await tx`CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'passed', 'failed', 'error')),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        step_results JSONB NOT NULL DEFAULT '[]'::jsonb,
        summary JSONB,
        test_snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await tx`CREATE INDEX IF NOT EXISTS runs_test_created_idx ON runs(test_id, created_at DESC)`;
      await tx`CREATE INDEX IF NOT EXISTS runs_status_created_idx ON runs(status, created_at DESC)`;
      await tx`INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING`;
    });
  }
  const [legacyImport] = await db<{ version: number }[]>`SELECT version FROM schema_migrations WHERE version = 2`;
  if (!legacyImport) {
    const legacyPath = join(DATA_DIR, "app.db");
    if (existsSync(legacyPath)) {
      const legacy = new Database(legacyPath, { readonly: true });
      try {
        const tests = legacy.query("SELECT id, name, url, steps, updated_at FROM tests").all() as Array<{ id: string; name: string; url: string; steps: string; updated_at: string }>;
        const runs = legacy.query("SELECT id, test_id, status, started_at, finished_at, step_results, summary, created_at FROM runs").all() as Array<{ id: string; test_id: string; status: string; started_at: string | null; finished_at: string | null; step_results: string; summary: string | null; created_at: string }>;
        await db.begin(async (tx) => {
          for (const test of tests) {
            await tx`INSERT INTO tests (id, name, url, steps, metadata, updated_at)
              VALUES (${test.id}, ${test.name}, ${test.url}, ${tx.json(JSON.parse(test.steps))}, ${tx.json({ key: `TC-${test.id.slice(1).toUpperCase()}` })}, ${test.updated_at}) ON CONFLICT (id) DO NOTHING`;
          }
          const testById = new Map(tests.map((test) => [test.id, test]));
          for (const run of runs) {
            const test = testById.get(run.test_id);
            if (!test) continue;
            const summary = run.summary ? JSON.parse(run.summary) : null;
            await tx`INSERT INTO runs (id, test_id, status, started_at, finished_at, step_results, summary, test_snapshot, created_at)
              VALUES (${run.id}, ${run.test_id}, ${run.status}, ${run.started_at}, ${run.finished_at}, ${tx.json(JSON.parse(run.step_results))}, ${summary ? tx.json(summary) : null}, ${tx.json({ name: test.name, url: test.url, steps: JSON.parse(test.steps), metadata: { key: `TC-${test.id.slice(1).toUpperCase()}` } })}, ${run.created_at}) ON CONFLICT (id) DO NOTHING`;
          }
        });
      } finally { legacy.close(); }
    }
    await db`INSERT INTO schema_migrations (version) VALUES (2) ON CONFLICT DO NOTHING`;
  }
  // Runs in-flight at process shutdown cannot resume; make their persisted state explicit.
  await db`UPDATE runs SET status = 'error', finished_at = now(),
    summary = jsonb_build_object('runId', id, 'status', 'error', 'passed', false,
      'failedStep', null, 'error', 'Server restarted during execution', 'screenshotUrl', null)
    WHERE status IN ('queued', 'running')`;
})();

export const newId = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
