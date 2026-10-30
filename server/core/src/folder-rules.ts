import { BadRequest, NotFound } from "./errors";

export type FolderRuleRecord = {
  id: string;
  workspaceId: string;
  kind: "test" | "cycle";
  parentId: string | null;
};

export function moveFolder<T extends FolderRuleRecord>(folders: T[], id: string, parentId: string | null): T[] {
  const folder = folders.find((candidate) => candidate.id === id);
  if (!folder) throw new NotFound(`Folder ${id} not found`);
  if (parentId !== null) {
    const parent = folders.find((candidate) => candidate.id === parentId);
    if (!parent || parent.kind !== folder.kind || parent.workspaceId !== folder.workspaceId) {
      throw new BadRequest("Parent folder must belong to the same workspace and folder kind");
    }
    let current: T | undefined = parent;
    const visited = new Set<string>();
    while (current) {
      if (current.id === id) throw new BadRequest("A folder cannot be moved inside itself or a descendant");
      if (visited.has(current.id)) throw new BadRequest("The existing folder hierarchy contains a cycle");
      visited.add(current.id);
      current = folders.find((candidate) => candidate.id === current?.parentId);
    }
  }
  return folders.map((candidate) => candidate.id === id ? { ...candidate, parentId } : candidate);
}

export function assertFolderEmpty(childFolderCount: number, itemCount: number): void {
  if (childFolderCount > 0 || itemCount > 0) throw new BadRequest("Folder is not empty");
}
