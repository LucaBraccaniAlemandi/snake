import { SQL } from "bun";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Postgres holds all state; DATA_DIR only holds run artifacts (screenshots).
export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(import.meta.dir, "../../data"));
mkdirSync(DATA_DIR, { recursive: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Start Postgres with `docker compose up -d db` (in server/) and add\n" +
      "DATABASE_URL=postgres://agent:agent@127.0.0.1:5432/agent_tester to server/.env",
  );
}
export const sql = new SQL(process.env.DATABASE_URL);

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations");

// Applies core/migrations/*.sql in name order, each once, each in its own transaction.
export async function migrate() {
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
}

export const newId = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
export const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());
