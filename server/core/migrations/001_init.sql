CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Steps are the Test's source of truth (ADR-0001), stored as one ordered JSON array (ADR-0004).
CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tests ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;
INSERT INTO workspaces (id, name) VALUES ('default', 'Default') ON CONFLICT (id) DO NOTHING;
UPDATE tests SET workspace_id = 'default' WHERE workspace_id IS NULL;
ALTER TABLE tests ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS tests_workspace_id ON tests(workspace_id);

-- step_results keep each Step's text as it was when the Run executed.
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  step_results JSONB NOT NULL DEFAULT '[]',
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_test_id_created_at ON runs(test_id, created_at DESC);

INSERT INTO workspaces (id, name) VALUES ('default', 'Default') ON CONFLICT (id) DO NOTHING;
