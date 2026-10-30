import { iso, newId, sql } from "./db";
import { BadRequest, NotFound } from "./errors";
import { assertFolderEmpty, moveFolder } from "./folder-rules";
import type { Folder, FolderKind } from "./schema";
import { getWorkspace } from "./workspaces";

type FolderRow = {
  id: string;
  workspace_id: string;
  kind: FolderKind;
  name: string;
  parent_id: string | null;
  position: number;
  created_at: Date | string;
};

const toFolder = (row: FolderRow): Folder => ({
  id: row.id,
  workspaceId: row.workspace_id,
  kind: row.kind,
  name: row.name,
  parentId: row.parent_id,
  position: row.position,
  createdAt: iso(row.created_at)!,
});

export async function listFolders(workspaceId: string, kind: FolderKind): Promise<Folder[]> {
  await getWorkspace(workspaceId);
  const rows = await sql`SELECT * FROM folders WHERE workspace_id = ${workspaceId} AND kind = ${kind} ORDER BY position, created_at, id`;
  return rows.map((row: FolderRow) => toFolder(row));
}

export async function getFolder(id: string): Promise<Folder> {
  const [row] = await sql`SELECT * FROM folders WHERE id = ${id}`;
  if (!row) throw new NotFound(`Folder ${id} not found`);
  return toFolder(row as FolderRow);
}

export async function getFolderForWorkspace(workspaceId: string, id: string, kind: FolderKind): Promise<Folder> {
  const folder = await getFolder(id);
  if (folder.workspaceId !== workspaceId || folder.kind !== kind) {
    throw new BadRequest("Folder must belong to the same workspace and folder kind");
  }
  return folder;
}

export async function createFolder(workspaceId: string, input: { kind: FolderKind; name: string; parentId?: string | null; position?: number }): Promise<Folder> {
  await getWorkspace(workspaceId);
  const parentId = input.parentId ?? null;
  if (parentId) await getFolderForWorkspace(workspaceId, parentId, input.kind);
  const id = newId("f");
  const position = input.position ?? (await sql`SELECT COALESCE(MAX(position) + 1, 0)::int AS position FROM folders WHERE workspace_id = ${workspaceId} AND kind = ${input.kind}`)[0].position;
  const [row] = await sql`INSERT INTO folders (id, workspace_id, kind, name, parent_id, position)
    VALUES (${id}, ${workspaceId}, ${input.kind}, ${input.name}, ${parentId}, ${position}) RETURNING *`;
  return toFolder(row as FolderRow);
}

export async function updateFolder(id: string, patch: { name?: string; parentId?: string | null; position?: number }): Promise<Folder> {
  const current = await getFolder(id);
  if (patch.parentId !== undefined) {
    const folders = await listFolders(current.workspaceId, current.kind);
    moveFolder(folders, id, patch.parentId);
  }
  const [row] = await sql`UPDATE folders SET name = ${patch.name ?? current.name},
    parent_id = ${patch.parentId === undefined ? current.parentId : patch.parentId},
    position = ${patch.position ?? current.position} WHERE id = ${id} RETURNING *`;
  return toFolder(row as FolderRow);
}

export async function deleteFolder(id: string): Promise<void> {
  const folder = await getFolder(id);
  const [{ count: childFolderCount }] = await sql`SELECT count(*)::int AS count FROM folders WHERE parent_id = ${id}`;
  const itemCount = folder.kind === "test"
    ? (await sql`SELECT count(*)::int AS count FROM tests WHERE folder_id = ${id}`)[0].count
    : 0;
  assertFolderEmpty(childFolderCount, itemCount);
  await sql`DELETE FROM folders WHERE id = ${id}`;
}
