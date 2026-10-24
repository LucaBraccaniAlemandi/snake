import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Postgres holds all state; DATA_DIR only holds run artifacts and an optional legacy SQLite database.
export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(import.meta.dir, "../../data"));
mkdirSync(DATA_DIR, { recursive: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Start Postgres with `docker compose up -d db` (in server/) and set DATABASE_URL in server/.env");
}
export const sql = new SQL(process.env.DATABASE_URL);

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations");

// Applies core/migrations/*.sql in name order, each once and in its own transaction.
export async function migrate() {
  const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schema_migrations'`;
  const columnNames = new Set(columns.map((column: { column_name: string }) => column.column_name));
  if (columnNames.has("version") && !columnNames.has("name")) {
    const [legacyTable] = await sql`SELECT to_regclass('public.schema_migrations_legacy') AS table_name`;
    if (legacyTable?.table_name) throw new Error("Both legacy and current schema_migrations tables exist; resolve the migration history before starting the API.");
    await sql`ALTER TABLE schema_migrations RENAME TO schema_migrations_legacy`;
  }
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const applied = new Set((await sql`SELECT name FROM schema_migrations`).map((r: { name: string }) => r.name));
  for (const name of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    console.log(`migrated ${name}`);
  }
  await importLegacySqlite();
  await sql`UPDATE runs SET status = 'error', finished_at = now(),
    summary = jsonb_build_object('runId', id, 'status', 'error', 'passed', false,
      'failedStep', null, 'error', 'Server restarted during execution', 'screenshotUrl', null, 'videos', '[]'::jsonb)
    WHERE status IN ('queued', 'running')`;
}

async function importLegacySqlite() {
  const marker = "legacy_sqlite_import";
  const [done] = await sql`SELECT name FROM schema_migrations WHERE name = ${marker}`;
  if (done) return;
  const legacyPath = join(DATA_DIR, "app.db");
  if (existsSync(legacyPath)) {
    const legacy = new Database(legacyPath, { readonly: true });
    try {
      const tests = legacy.query("SELECT id, name, url, steps, updated_at FROM tests").all() as Array<{ id: string; name: string; url: string; steps: string; updated_at: string }>;
      const runs = legacy.query("SELECT id, test_id, status, started_at, finished_at, step_results, summary, created_at FROM runs").all() as Array<{ id: string; test_id: string; status: string; started_at: string | null; finished_at: string | null; step_results: string; summary: string | null; created_at: string }>;
      await sql.begin(async (tx) => {
        for (const test of tests) {
          const steps = JSON.parse(test.steps);
          const metadata = { key: `TC-${test.id.slice(1).toUpperCase()}` };
          await tx`INSERT INTO tests (id, workspace_id, name, url, steps, metadata, updated_at)
            VALUES (${test.id}, 'default', ${test.name}, ${test.url}, ${JSON.stringify(steps)}::jsonb, ${JSON.stringify(metadata)}::jsonb, ${test.updated_at}) ON CONFLICT (id) DO NOTHING`;
        }
        const testById = new Map(tests.map((test) => [test.id, test]));
        for (const run of runs) {
          const test = testById.get(run.test_id);
          if (!test) continue;
          const steps = JSON.parse(test.steps);
          const stepResults = JSON.parse(run.step_results).map((result: { stepId: string; text?: string }) => ({
            ...result, text: result.text ?? steps.find((step: { id: string }) => step.id === result.stepId)?.text ?? "",
          }));
          const metadata = { key: `TC-${test.id.slice(1).toUpperCase()}` };
          const summary = run.summary ? JSON.stringify(JSON.parse(run.summary)) : null;
          await tx`INSERT INTO runs (id, test_id, status, started_at, finished_at, step_results, summary, test_snapshot, created_at)
            VALUES (${run.id}, ${run.test_id}, ${run.status}, ${run.started_at}, ${run.finished_at}, ${JSON.stringify(stepResults)}::jsonb,
              ${summary}::jsonb,
              ${JSON.stringify({ name: test.name, url: test.url, steps, metadata })}::jsonb, ${run.created_at}) ON CONFLICT (id) DO NOTHING`;
        }
      });
    } finally { legacy.close(); }
  }
  await sql`INSERT INTO schema_migrations (name) VALUES (${marker}) ON CONFLICT DO NOTHING`;
}

export const newId = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
export const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());
