CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('test', 'cycle')),
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES folders(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS folders_workspace_kind ON folders(workspace_id, kind);
CREATE INDEX IF NOT EXISTS folders_parent_id ON folders(parent_id);

ALTER TABLE tests ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES folders(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS tests_folder_id ON tests(folder_id);
