import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Button, IconButton } from "../../components/ui";
import { useWorkspace } from "../../data/WorkspaceContext";
import type { Folder } from "../../types";
import { FolderFormDialog } from "./FolderFormDialog";
import { buildFolderTree, type FolderSelection, type FolderTreeNode } from "./folder-tree";

type Props = { selection: FolderSelection; onSelect: (selection: FolderSelection) => void };
type Dialog = { mode: "create" | "rename" | "move"; folder?: Folder; parentId?: string | null } | null;

export function FolderTree({ selection, onSelect }: Props) {
  const { data, deleteFolder, updateFolder, refreshWorkspace, notify } = useWorkspace();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState(false);
  const tree = useMemo(() => buildFolderTree(data.folders), [data.folders]);
  const selectedFolder = data.folders.find((folder) => folder.id === selection);

  useEffect(() => {
    if (selection !== "all" && selection !== "unassigned" && !selectedFolder) onSelect("all");
  }, [onSelect, selectedFolder, selection]);

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(folder: Folder) {
    if (!window.confirm(`¿Eliminar la carpeta «${folder.name}»? Solo se permite si está vacía.`)) return;
    setDeleting(true);
    try {
      await deleteFolder(folder.id);
      notify("Carpeta eliminada.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo eliminar la carpeta.");
    } finally {
      setDeleting(false);
    }
  }

  async function reorder(folder: Folder, delta: -1 | 1) {
    const siblings = data.folders.filter((candidate) => candidate.parentId === folder.parentId && candidate.kind === folder.kind)
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const index = siblings.findIndex((candidate) => candidate.id === folder.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target]!, siblings[index]!];
    try {
      for (const [position, sibling] of siblings.entries()) {
        if (sibling.position !== position) await updateFolder(sibling.id, { position });
      }
      notify("Orden de carpetas actualizado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo reordenar la carpeta.");
      try { await refreshWorkspace(); } catch { }
    }
  }

  function renderNodes(nodes: FolderTreeNode[], depth = 0) {
    return nodes.map((node) => <div key={node.id} role="treeitem" aria-expanded={node.children.length ? !collapsed.has(node.id) : undefined}>
      <div className={`folder-tree-row ${selection === node.id ? "selected" : ""}`} style={{ paddingLeft: 8 + depth * 16 }}>
        {node.children.length ? <button className="folder-tree-toggle" aria-label={`${collapsed.has(node.id) ? "Expandir" : "Contraer"} ${node.name}`} onClick={() => toggle(node.id)}><Icon name={collapsed.has(node.id) ? "chevron" : "down"} size={13} /></button> : <span className="folder-tree-spacer" />}
        <button className="folder-tree-select" onClick={() => onSelect(node.id)}><Icon name="folder" size={15} /><span>{node.name}</span><small>{data.cases.filter((test) => test.folderId === node.id).length}</small></button>
      </div>
      {!collapsed.has(node.id) && node.children.length > 0 && <div role="group">{renderNodes(node.children, depth + 1)}</div>}
    </div>);
  }

  return <aside className="folder-sidebar" aria-label="Carpetas de casos">
    <div className="folder-sidebar-heading"><div><strong>Carpetas</strong><small>{data.folders.length} en el catálogo</small></div><IconButton icon="plus" label="Nueva carpeta raíz" onClick={() => setDialog({ mode: "create", parentId: null })} /></div>
    <div className="folder-special-views"><button className={selection === "all" ? "selected" : ""} onClick={() => onSelect("all")}><Icon name="cases" size={15} />Todos<span>{data.cases.length}</span></button><button className={selection === "unassigned" ? "selected" : ""} onClick={() => onSelect("unassigned")}><Icon name="file" size={15} />Sin asignar<span>{data.cases.filter((test) => test.folderId === null).length}</span></button></div>
    <div className="folder-tree" role="tree">{tree.length ? renderNodes(tree) : <p className="folder-tree-empty">No hay carpetas. Crea la primera para organizar el catálogo.</p>}</div>
    {selectedFolder && <div className="folder-selected-actions"><div className="folder-selected-name"><Icon name="folder" size={15} /><span>{selectedFolder.name}</span></div><div className="folder-action-row"><Button icon="plus" onClick={() => setDialog({ mode: "create", parentId: selectedFolder.id })}>Subcarpeta</Button><IconButton icon="edit" label="Renombrar carpeta" onClick={() => setDialog({ mode: "rename", folder: selectedFolder })} /><IconButton icon="folder" label="Mover carpeta" onClick={() => setDialog({ mode: "move", folder: selectedFolder })} /><IconButton icon="up" label="Subir carpeta" onClick={() => void reorder(selectedFolder, -1)} /><IconButton icon="down" label="Bajar carpeta" onClick={() => void reorder(selectedFolder, 1)} /><IconButton icon="trash" label="Eliminar carpeta" disabled={deleting} onClick={() => void remove(selectedFolder)} /></div></div>}
    {dialog && <FolderFormDialog mode={dialog.mode} folder={dialog.folder} parentId={dialog.parentId} onClose={() => setDialog(null)} />}
  </aside>;
}
