import { rmSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, iso, newId, sql } from "./db";
import type { Workspace } from "./schema";
import { BadRequest, NotFound } from "./errors";

type WorkspaceRow = { id: string; name: string; created_at: Date };
const toWorkspace = (r: WorkspaceRow): Workspace => ({ id: r.id, name: r.name, createdAt: iso(r.created_at)! });

export const DEFAULT_WORKSPACE_ID = "default";

export async function listWorkspaces(): Promise<Workspace[]> {
  return (await sql`SELECT * FROM workspaces ORDER BY created_at`).map(toWorkspace);
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const [row] = await sql`SELECT * FROM workspaces WHERE id = ${id}`;
  if (!row) throw new NotFound(`Workspace ${id} not found`);
  return toWorkspace(row);
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const [row] = await sql`INSERT INTO workspaces (id, name) VALUES (${newId("w")}, ${name}) RETURNING *`;
  return toWorkspace(row);
}

export async function renameWorkspace(id: string, name: string): Promise<Workspace> {
  const [row] = await sql`UPDATE workspaces SET name = ${name} WHERE id = ${id} RETURNING *`;
  if (!row) throw new NotFound(`Workspace ${id} not found`);
  return toWorkspace(row);
}

export async function deleteWorkspace(id: string) {
  await getWorkspace(id);
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM workspaces`;
  if (count <= 1) throw new BadRequest("Can't delete the last Workspace");
  const runs = await sql`SELECT r.id FROM runs r JOIN tests t ON t.id = r.test_id WHERE t.workspace_id = ${id}`;
  await sql`DELETE FROM workspaces WHERE id = ${id}`; // cascades to tests and runs
  removeArtifacts(runs.map((r: { id: string }) => r.id));
}

export function removeArtifacts(runIds: string[]) {
  for (const runId of runIds) rmSync(join(DATA_DIR, "runs", runId), { recursive: true, force: true });
}
