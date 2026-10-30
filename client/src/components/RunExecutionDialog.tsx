import { useEffect, useState, type FormEvent } from "react";
import type { ExecutionEngine } from "../types";
import type { TestCase } from "../data/model";
import { api } from "../data/api";
import { Badge, Button, Field, Modal } from "./ui";
import { Icon } from "./Icon";

export function RunExecutionDialog({
  test,
  preferredEngine,
  onClose,
  onStart,
}: {
  test: TestCase;
  preferredEngine: ExecutionEngine;
  onClose: () => void;
  onStart: (engine: ExecutionEngine, code?: string) => Promise<void>;
}) {
  const [engine, setEngine] = useState<ExecutionEngine>(preferredEngine);
  const [code, setCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  async function loadCode() {
    setLoadingCode(true);
    setError("");
    try { setCode((await api.previewRun(test.id, "laya")).code); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo generar el programa Code Mode."); }
    finally { setLoadingCode(false); }
  }

  useEffect(() => { if (engine === "laya" && !code) void loadCode(); }, [engine, test.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (starting || (engine === "laya" && (!code.trim() || loadingCode || error))) return;
    setStarting(true);
    try { await onStart(engine, engine === "laya" ? code : undefined); }
    finally { setStarting(false); }
  }

  return <Modal title={`Ejecutar · ${test.key}`} description="Elige el motor; la IA de Laya Browser se configura por separado en el servidor." onClose={onClose} wide>
    <form className="form-stack run-execution-form" onSubmit={submit}>
      <Field label="Motor de ejecución">
        <select value={engine} onChange={event => { setEngine(event.target.value as ExecutionEngine); setError(""); }}>
          <option value="e2e">e2e · Playwright y TypeScript</option>
          <option value="laya">Laya Browser · Code Mode</option>
        </select>
      </Field>
      {engine === "laya" ? <>
        <div className="info-notice"><Icon name="sparkles" size={17} /><span>Laya Browser usa una IA de decisión (Jev hospedado o Laya local) para observar y controlar el navegador. El programa se ejecuta en su sandbox Code Mode.</span><Badge tone="blue">Code Mode</Badge></div>
        <Field label="Programa JavaScript · solo esta ejecución">
          <textarea className="run-code-editor" aria-label="Programa Code Mode" spellCheck={false} value={code} onChange={event => { setCode(event.target.value); setError(""); }} placeholder={loadingCode ? "Generando Code Mode…" : "El programa generado aparecerá aquí."} rows={20} disabled={loadingCode || starting} />
        </Field>
        <div className="run-code-footer"><span>El programa editado se guarda en el snapshot del Run y no modifica los pasos del caso.</span><Button icon="refresh" disabled={loadingCode || starting} onClick={() => void loadCode()}>{loadingCode ? "Generando…" : "Regenerar desde pasos"}</Button></div>
        {error && <div className="step-error" role="alert">{error}</div>}
      </> : <div className="info-notice"><Icon name="code" size={17} /><span>e2e compilará los pasos a TypeScript y ejecutará el script mediante su runner actual.</span></div>}
      <div className="modal-actions"><Button disabled={starting} onClick={onClose}>Cancelar</Button><Button type="submit" variant="primary" icon="play" disabled={starting || (engine === "laya" && (!code.trim() || loadingCode || Boolean(error)))}>{starting ? "Iniciando…" : `Ejecutar con ${engine === "e2e" ? "e2e" : "Laya Browser"}`}</Button></div>
    </form>
  </Modal>;
}
