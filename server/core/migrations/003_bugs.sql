CREATE SEQUENCE IF NOT EXISTS bug_id_seq;

CREATE TABLE IF NOT EXISTS bugs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('Alta', 'Media', 'Baja')),
  status TEXT NOT NULL DEFAULT 'Abierto' CHECK (status IN ('Abierto', 'En análisis', 'Resuelto', 'Cerrado')),
  expected TEXT NOT NULL,
  actual TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  ticket TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bugs_created_at_id ON bugs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS bugs_run_id ON bugs (run_id);
