import type { CreateBugBody, UpdateBugBody } from "./api";
import { sql, iso } from "./db";
import { NotFound } from "./errors";
import { DEFAULT_WORKSPACE_ID, getWorkspace } from "./workspaces";
import type { Bug } from "./schema";

type BugRow = {
  id: string;
  run_id: string;
  test_id: string;
  title: string;
  severity: Bug["severity"];
  status: Bug["status"];
  expected: string;
  actual: string;
  notes: string;
  ticket: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toBug(row: BugRow): Bug {
  return {
    id: row.id,
    runId: row.run_id,
    testId: row.test_id,
    title: row.title,
    severity: row.severity,
    status: row.status,
    expected: row.expected,
    actual: row.actual,
    notes: row.notes,
    ticket: row.ticket,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

export async function listBugs(workspaceId = DEFAULT_WORKSPACE_ID): Promise<Bug[]> {
  await getWorkspace(workspaceId);
  const rows = await sql`SELECT b.id, b.run_id, r.test_id, b.title, b.severity, b.status,
      b.expected, b.actual, b.notes, b.ticket, b.created_at, b.updated_at
    FROM bugs b JOIN runs r ON r.id = b.run_id JOIN tests t ON t.id = r.test_id
    WHERE t.workspace_id = ${workspaceId} ORDER BY b.created_at DESC, b.id DESC`;
  return rows.map((row: BugRow) => toBug(row));
}

export async function getBug(id: string): Promise<Bug> {
  const [row] = await sql`SELECT b.id, b.run_id, r.test_id, b.title, b.severity, b.status,
      b.expected, b.actual, b.notes, b.ticket, b.created_at, b.updated_at
    FROM bugs b JOIN runs r ON r.id = b.run_id WHERE b.id = ${id}`;
  if (!row) throw new NotFound(`Bug ${id} not found`);
  return toBug(row as BugRow);
}

export async function createBug(runId: string, input: CreateBugBody): Promise<Bug> {
  const [run] = await sql`SELECT id FROM runs WHERE id = ${runId}`;
  if (!run) throw new NotFound(`Run ${runId} not found`);
  const [sequence] = await sql`SELECT nextval('bug_id_seq') AS value`;
  const id = `BUG-${String(sequence.value).padStart(3, "0")}`;
  const ticket = input.ticket?.trim() || null;
  await sql`INSERT INTO bugs (id, run_id, title, severity, expected, actual, notes, ticket)
    VALUES (${id}, ${runId}, ${input.title}, ${input.severity}, ${input.expected}, ${input.actual}, ${input.notes}, ${ticket})`;
  return getBug(id);
}

export async function updateBug(id: string, patch: UpdateBugBody): Promise<Bug> {
  const current = await getBug(id);
  const status = patch.status ?? current.status;
  const ticket = patch.ticket === undefined ? current.ticket : patch.ticket?.trim() || null;
  await sql`UPDATE bugs SET status = ${status}, ticket = ${ticket}, updated_at = now() WHERE id = ${id}`;
  return getBug(id);
}
