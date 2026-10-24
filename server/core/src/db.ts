import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(import.meta.dir, "../../data"));
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, "app.db"), { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS tests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    steps TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    step_results TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL
  );
`);

export const newId = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
