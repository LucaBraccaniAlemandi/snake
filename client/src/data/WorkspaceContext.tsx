import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { seed } from "./seed";
import { uid, type TestCase, type Workspace } from "./model";
import { api, fromTest, toRun } from "./api";

type ContextValue = {
  data: Workspace; setData: React.Dispatch<React.SetStateAction<Workspace>>;
  loading: boolean; notify: (message: string) => void; updateCase: (id: string, patch: Partial<TestCase>) => void;
  addCase: (patch: Partial<TestCase>) => Promise<string>; deleteCase: (id: string) => Promise<void>;
  startRun: (testId: string) => Promise<string | null>;
};
const WorkspaceContext = createContext<ContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Workspace>(() => ({ ...structuredClone(seed), cases: [], runs: [], bugs: [] }));
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dataRef = useRef(data);
  const notify = useCallback((message: string) => { clearTimeout(toastTimer.current); setToast(message); toastTimer.current = setTimeout(() => setToast(""), 4000); }, []);

  const refresh = useCallback(async () => {
    const [tests, runs] = await Promise.all([api.listTests(), api.listRuns()]);
    setData((d) => ({ ...d, cases: tests.map(fromTest), runs: runs.map(toRun) }));
  }, []);

  useEffect(() => {
    let mounted = true;
    void refresh().catch((error) => { if (mounted) setStorageError(`No se pudo conectar con el servidor: ${error instanceof Error ? error.message : String(error)}`); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; saveTimers.current.forEach(clearTimeout); };
  }, [refresh]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const testIds = data.cases.map((test) => test.id).join(",");
  useEffect(() => {
    if (!testIds) return;
    const sources = testIds.split(",").map((id) => {
      const source = new EventSource(`/api/tests/${encodeURIComponent(id)}/events`);
      const sync = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as { type: string; test?: Parameters<typeof fromTest>[0]; run?: Parameters<typeof toRun>[0] };
          if (payload.type === "test-updated" && payload.test) {
            const test = fromTest(payload.test);
            setData((d) => ({ ...d, cases: d.cases.map((old) => old.id === test.id ? test : old) }));
          }
          if ((payload.type === "run-started" || payload.type === "run-finished") && payload.run) {
            const run = toRun(payload.run);
            setData((d) => ({ ...d, runs: [run, ...d.runs.filter((old) => old.id !== run.id)] }));
          }
        } catch { /* HTTP polling below remains the recovery path for malformed or missed events. */ }
      };
      source.addEventListener("run-started", sync as EventListener);
      source.addEventListener("run-finished", sync as EventListener);
      source.addEventListener("test-updated", sync as EventListener);
      return source;
    });
    return () => sources.forEach((source) => source.close());
  }, [testIds]);

  // Reconcile active executions through HTTP so the UI recovers after a reload or lost SSE event.
  const runningIds = data.runs.filter((run) => run.status === "running" || run.status === "queued").map((run) => run.id).join(",");
  useEffect(() => {
    if (!runningIds) return;
    let stopped = false;
    const poll = async () => {
      for (const id of runningIds.split(",")) {
        try {
          const run = toRun(await api.getRun(id));
          if (!stopped) setData((d) => ({ ...d, runs: [run, ...d.runs.filter((old) => old.id !== run.id)] }));
        } catch (error) { if (!stopped) setStorageError(error instanceof Error ? error.message : String(error)); }
      }
    };
    const timer = setInterval(() => void poll(), 1600);
    void poll();
    return () => { stopped = true; clearInterval(timer); };
  }, [runningIds]);

  const updateCase = useCallback((id: string, patch: Partial<TestCase>) => {
    setData((d) => ({ ...d, cases: d.cases.map((test) => test.id === id ? { ...test, ...patch, updatedAt: new Date().toISOString() } : test) }));
    const previous = saveTimers.current.get(id);
    if (previous) clearTimeout(previous);
    saveTimers.current.set(id, setTimeout(async () => {
      const test = dataRef.current.cases.find((candidate) => candidate.id === id);
      if (!test) return;
      try {
        let saved = fromTest(await api.updateTest(id, test));
        if (patch.steps) saved = fromTest(await api.setSteps(id, test.steps));
        setData((d) => ({ ...d, cases: d.cases.map((candidate) => candidate.id === id ? saved : candidate) }));
        setStorageError("");
      } catch (error) { setStorageError(`No se guardaron los cambios: ${error instanceof Error ? error.message : String(error)}`); }
      finally { saveTimers.current.delete(id); }
    }, 350));
  }, []);

  // A ref gives the debounce callback the latest full case rather than a stale render.
  useEffect(() => { dataRef.current = data; }, [data]);

  const addCase = useCallback(async (patch: Partial<TestCase>) => {
    const name = patch.name?.trim() || "Nuevo caso de prueba";
    const url = patch.url || dataRef.current.preferences.baseUrl;
    const metadata = {
      componentId: patch.componentId || "", status: patch.status || "Borrador", priority: patch.priority || "Media",
      preconditions: patch.preconditions || "", jiraId: patch.jiraId || "", testType: patch.testType || "Automatizado",
      release: patch.release || "", notes: patch.notes || "",
    };
    const created = fromTest(await api.createTest({ name, url, ...metadata }));
    setData((d) => ({ ...d, cases: [created, ...d.cases] }));
    if (patch.steps?.length) {
      const saved = fromTest(await api.setSteps(created.id, patch.steps));
      setData((d) => ({ ...d, cases: d.cases.map((test) => test.id === saved.id ? saved : test) }));
    }
    return created.id;
  }, []);

  const deleteCase = useCallback(async (id: string) => {
    await api.deleteTest(id);
    setData((d) => ({ ...d, cases: d.cases.filter((test) => test.id !== id), runs: d.runs.filter((run) => run.testId !== id) }));
  }, []);

  const startRun = useCallback(async (testId: string) => {
    const test = dataRef.current.cases.find((candidate) => candidate.id === testId);
    if (!test?.steps.length) { notify("Agrega al menos un paso antes de ejecutar."); return null; }
    try {
      const { runId } = await api.startRun(testId);
      const run = toRun(await api.getRun(runId));
      setData((d) => ({ ...d, runs: [run, ...d.runs.filter((old) => old.id !== run.id)] }));
      notify("Ejecución real iniciada en el servidor.");
      return runId;
    } catch (error) { notify(`No se pudo iniciar: ${error instanceof Error ? error.message : String(error)}`); return null; }
  }, [notify]);

  const setWorkspaceData: React.Dispatch<React.SetStateAction<Workspace>> = (action) => {
    const previous = dataRef.current;
    const next = typeof action === "function" ? action(previous) : action;
    for (const oldCase of previous.cases) {
      const newCase = next.cases.find((candidate) => candidate.id === oldCase.id);
      if (!newCase) void api.deleteTest(oldCase.id).catch((error) => setStorageError(String(error)));
      else if (JSON.stringify(oldCase) !== JSON.stringify(newCase)) {
        void api.updateTest(newCase.id, newCase).then(() => api.setSteps(newCase.id, newCase.steps)).catch((error) => setStorageError(`No se guardaron los cambios: ${String(error)}`));
      }
    }
    dataRef.current = next;
    setData(next);
  };

  return <WorkspaceContext.Provider value={{ data, setData: setWorkspaceData, loading, notify, updateCase, addCase, deleteCase, startRun }}>
    {storageError && <div className="storage-warning" role="alert">{storageError}</div>}
    {children}{toast && <div className="toast" role="status"><span>✓</span>{toast}<button onClick={() => setToast("")} aria-label="Cerrar notificación">×</button></div>}
  </WorkspaceContext.Provider>;
}

export function useWorkspace() { const context = useContext(WorkspaceContext); if (!context) throw new Error("WorkspaceProvider is required"); return context; }
