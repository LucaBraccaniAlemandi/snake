CREATE TABLE IF NOT EXISTS jira_connections (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  email TEXT NOT NULL,
  project_key TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_tag TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_validated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
