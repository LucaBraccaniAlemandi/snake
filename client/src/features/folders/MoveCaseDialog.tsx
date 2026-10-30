import { useState, type FormEvent } from "react";
import { IconButton, Button, Field, Modal } from "../../components/ui";
import { useWorkspace } from "../../data/WorkspaceContext";
import type { TestCase } from "../../data/model";
import { buildFolderTree, flattenFolderTree } from "./folder-tree";

export function MoveCaseDialog({ test, onClose }: { test: TestCase; onClose: () => void }) {
  const { data, moveCaseToFolder, notify } = useWorkspace();
  const [folderId, setFolderId] = useState(test.folderId);
  const [saving, setSaving] = useState(false);
  const destinations = flattenFolderTree(buildFolderTree(data.folders));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await moveCaseToFolder(test.id, folderId);
      notify(folderId ? "Caso movido a la carpeta seleccionada." : "Caso movido a Sin asignar.");
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo mover el caso.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={`Mover ${test.key}`} description="Selecciona una carpeta del árbol de casos." onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <Field label="Destino"><select autoFocus value={folderId ?? ""} onChange={(event) => setFolderId(event.target.value || null)}><option value="">Sin asignar</option>{destinations.map(({ node, depth }) => <option key={node.id} value={node.id}>{`${"— ".repeat(depth)}${node.name}`}</option>)}</select></Field>
      <div className="modal-actions"><Button onClick={onClose}>Cancelar</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "Moviendo…" : "Mover caso"}</Button></div>
    </form>
  </Modal>;
}

export function MoveCaseButton({ test }: { test: TestCase }) {
  const [open, setOpen] = useState(false);
  return <><IconButton icon="folder" label={`Mover ${test.key} a carpeta`} onClick={() => setOpen(true)} />{open && <MoveCaseDialog test={test} onClose={() => setOpen(false)} />}</>;
}
