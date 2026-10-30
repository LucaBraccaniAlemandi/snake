import type { Folder } from "../../types";

export type FolderSelection = "all" | "unassigned" | string;
export type FolderTreeNode = Folder & { children: FolderTreeNode[] };

const byPosition = (a: FolderTreeNode, b: FolderTreeNode) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const nodes = new Map(folders.map((folder) => [folder.id, { ...folder, children: [] as FolderTreeNode[] }]));
  const roots: FolderTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: FolderTreeNode[]): FolderTreeNode[] => {
    items.sort(byPosition);
    items.forEach((item) => sort(item.children));
    return items;
  };
  return sort(roots);
}

export function flattenFolderTree(tree: FolderTreeNode[], depth = 0): Array<{ node: FolderTreeNode; depth: number }> {
  return tree.flatMap((node) => [{ node, depth }, ...flattenFolderTree(node.children, depth + 1)]);
}

export function getSelectableFolders(folders: Folder[], movingFolderId?: string): Folder[] {
  const excluded = new Set<string>();
  if (movingFolderId) {
    excluded.add(movingFolderId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (folder.parentId && excluded.has(folder.parentId) && !excluded.has(folder.id)) {
          excluded.add(folder.id);
          changed = true;
        }
      }
    }
  }
  return flattenFolderTree(buildFolderTree(folders)).map(({ node }) => node).filter((folder) => !excluded.has(folder.id));
}

export function filterCasesByFolder<T extends { folderId: string | null }>(cases: T[], selection: FolderSelection): T[] {
  if (selection === "all") return cases;
  if (selection === "unassigned") return cases.filter((test) => test.folderId === null);
  return cases.filter((test) => test.folderId === selection);
}
