import { describe, expect, test } from "bun:test";
import { assertFolderEmpty, moveFolder, type FolderRuleRecord } from "./folder-rules";

const folders: FolderRuleRecord[] = [
  { id: "root", workspaceId: "w1", kind: "test", parentId: null },
  { id: "child", workspaceId: "w1", kind: "test", parentId: "root" },
  { id: "grandchild", workspaceId: "w1", kind: "test", parentId: "child" },
  { id: "other", workspaceId: "w1", kind: "test", parentId: null },
  { id: "other-workspace", workspaceId: "w2", kind: "test", parentId: null },
];

describe("folder hierarchy rules", () => {
  test("moves a folder under a valid parent without mutating the previous hierarchy", () => {
    const next = moveFolder(folders, "grandchild", "other");

    expect(next.find((folder) => folder.id === "grandchild")?.parentId).toBe("other");
    expect(folders.find((folder) => folder.id === "grandchild")?.parentId).toBe("child");
  });

  test.each(["root", "child", "grandchild"])("rejects moving root below itself or a descendant: %s", (parentId) => {
    expect(() => moveFolder(folders, "root", parentId)).toThrow("descendant");
    expect(folders.find((folder) => folder.id === "root")?.parentId).toBeNull();
  });

  test("rejects a parent from another workspace", () => {
    expect(() => moveFolder(folders, "root", "other-workspace")).toThrow("same workspace");
  });

  test("deletes only empty folders", () => {
    expect(() => assertFolderEmpty(0, 0)).not.toThrow();
    expect(() => assertFolderEmpty(1, 0)).toThrow("not empty");
    expect(() => assertFolderEmpty(0, 1)).toThrow("not empty");
  });
});
