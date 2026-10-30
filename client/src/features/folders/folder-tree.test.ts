import { describe, expect, test } from "bun:test";
import type { Folder } from "../../types";
import { buildFolderTree, filterCasesByFolder, flattenFolderTree, getSelectableFolders } from "./folder-tree";

const folder = (id: string, parentId: string | null, position = 0): Folder => ({
  id,
  workspaceId: "default",
  kind: "test",
  name: id,
  parentId,
  position,
  createdAt: "2026-10-26T00:00:00.000Z",
});

const folders = [folder("child", "root", 1), folder("other", null, 2), folder("root", null), folder("grandchild", "child")];

describe("folder tree", () => {
  test("builds nested folders and orders siblings by position", () => {
    const tree = buildFolderTree(folders);

    expect(tree.map((node) => node.id)).toEqual(["root", "other"]);
    expect(tree[0]?.children.map((node) => node.id)).toEqual(["child"]);
    expect(tree[0]?.children[0]?.children.map((node) => node.id)).toEqual(["grandchild"]);
  });

  test("keeps orphan folders visible at root", () => {
    expect(buildFolderTree([folder("orphan", "missing")]).map((node) => node.id)).toEqual(["orphan"]);
  });

  test("flattens nodes with their depth", () => {
    expect(flattenFolderTree(buildFolderTree(folders)).map(({ node, depth }) => [node.id, depth])).toEqual([
      ["root", 0], ["child", 1], ["grandchild", 2], ["other", 0],
    ]);
  });

  test("excludes a moving folder and all its descendants from valid destinations", () => {
    expect(getSelectableFolders(folders, "root").map((item) => item.id)).toEqual(["other"]);
    expect(getSelectableFolders(folders, "child").map((item) => item.id)).toEqual(["root", "other"]);
  });
});

describe("case folder selection", () => {
  const cases = [{ id: "assigned", folderId: "root" }, { id: "child", folderId: "child" }, { id: "unassigned", folderId: null }];

  test("returns every case in the all view", () => {
    expect(filterCasesByFolder(cases, "all")).toHaveLength(3);
  });

  test("returns only unassigned cases", () => {
    expect(filterCasesByFolder(cases, "unassigned").map((item) => item.id)).toEqual(["unassigned"]);
  });

  test("returns direct assignments without implicitly including descendants", () => {
    expect(filterCasesByFolder(cases, "root").map((item) => item.id)).toEqual(["assigned"]);
  });
});
