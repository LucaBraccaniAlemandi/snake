import { useState, type FormEvent } from "react";
import { Button, Field, Modal } from "../../components/ui";
import { useWorkspace } from "../../data/WorkspaceContext";
import type { Folder } from "../../types";
import { buildFolderTree, flattenFolderTree, getSelectableFolders } from "./folder-tree";

type Props = {
  mode: "create" | "rename" | "move";
  folder?: Folder;
  parentId?: string | null;
  onClose: () => void;
};

export function FolderFormDialog({ mode, folder, parentId, onClose }: Props) {
  const { data, createFolder, updateFolder, notify } = useWorkspace();
  const [name, setName] = useState(folder?.name ?? "");
  const [selectedParentId, setSelectedParentId] = useState(folder?.parentId ?? parentId ?? null);
  const [saving, setSaving] = useState(false);
  const selectable = new Set(getSelectableFolders(data.folders, mode === "move" ? folder?.id : undefined).map((item) => item.id));
  const destinations = flattenFolderTree(buildFolderTree(data.folders)).filter(({ node }) => selectable.has(node.id));
  const title = mode === "create" ? "Nueva carpeta" : mode === "rename" ? "Renombrar carpeta" : "Mover carpeta";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || (mode !== "move" && !name.trim())) return;
    setSaving(true);
    try {
      if (mode === "create") await createFolder({ name: name.trim(), parentId: selectedParentId });
      if (mode === "rename" && folder) await updateFolder(folder.id, { name: name.trim() });
      if (mode === "move" && folder) await updateFolder(folder.id, { parentId: selectedParentId });
      notify(mode === "create" ? "Carpeta creada." : mode === "rename" ? "Carpeta renombrada." : "Carpeta movida.");
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo guardar la carpeta.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={title} description="La jerarquía se guarda en el workspace actual." onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      {mode !== "move" && <Field label="Nombre"><input required autoFocus maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Regresión de checkout" /></Field>}
      {mode !== "rename" && <Field label="Carpeta padre"><select value={selectedParentId ?? ""} onChange={(event) => setSelectedParentId(event.target.value || null)}><option value="">Raíz</option>{destinations.map(({ node, depth }) => <option key={node.id} value={node.id}>{`${"— ".repeat(depth)}${node.name}`}</option>)}</select></Field>}
      <div className="modal-actions"><Button onClick={onClose}>Cancelar</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button></div>
    </form>
  </Modal>;
}
