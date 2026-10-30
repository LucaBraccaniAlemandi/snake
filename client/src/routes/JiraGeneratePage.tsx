import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../data/api";
import { useWorkspace } from "../data/WorkspaceContext";
import { priorities, tones, uid } from "../data/model";
import type { JiraAnalysis, JiraConnection, JiraIssue, JiraIssuePage, JiraSuggestion } from "../types";
import { Badge, Button, EmptyState, PageHeading, Tabs } from "../components/ui";
import { Icon } from "../components/Icon";

export function JiraGeneratePage() {
  const { data, addCase, notify } = useWorkspace();
  const navigate = useNavigate();
  const [connection, setConnection] = useState<JiraConnection | null>(null);
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<JiraAnalysis | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("cases");
  const analysisRequest = useRef<AbortController | null>(null);
  const pageTokenRef = useRef<string | null>(null);
  const activeQueryRef = useRef("");
  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;
  const selected = issues.find((issue) => issue.key === selectedKey) ?? null;
  const visibleIssues = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return issues.filter((issue) => !needle || `${issue.key} ${issue.title}`.toLowerCase().includes(needle));
  }, [issues, search]);

  const loadIssues = useCallback(async (append = false, query = "") => {
    const effectiveQuery = append ? activeQueryRef.current : query;
    if (!append) activeQueryRef.current = query;
    const page: JiraIssuePage = await api.listJiraIssues({ query: effectiveQuery, pageToken: append ? pageTokenRef.current ?? undefined : undefined, pageSize: 25 });
    setIssues((current) => {
      const combined = append ? [...current, ...page.issues] : page.issues;
      return [...new Map(combined.map((issue) => [issue.key, issue])).values()];
    });
    pageTokenRef.current = page.nextPageToken;
    setNextPageToken(page.nextPageToken);
    if (!append) {
      setSelectedKey(page.issues[0]?.key ?? "");
      setAnalysis(null);
      setChosen([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void api.getJiraConnection().then(async (value) => {
      if (!active) return;
      setConnection(value);
      if (!value.configured) { setIssues([]); setSelectedKey(""); return; }
      try { await loadIssues(); }
      catch (cause) { if (active) { setError(cause instanceof Error ? cause.message : "No se pudieron consultar los tickets."); setIssues([]); } }
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "No se pudo consultar el estado de Jira.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; analysisRequest.current?.abort(); };
  }, [loadIssues]);

  useEffect(() => {
    analysisRequest.current?.abort();
    setAnalysis(null);
    setChosen([]);
  }, [selectedKey]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true); setError("");
    try { await loadIssues(false, search); }
    catch (cause) { setIssues([]); setSelectedKey(""); setError(cause instanceof Error ? cause.message : "No se pudieron actualizar los tickets."); }
    finally { setRefreshing(false); }
  }

  async function analyze() {
    if (!selected || analyzing) return;
    const key = selected.key;
    const controller = new AbortController();
    analysisRequest.current?.abort(); analysisRequest.current = controller;
    setAnalyzing(true); setError(""); setAnalysis(null); setChosen([]);
    try {
      const result = await api.analyzeJiraIssue(key);
      if (controller.signal.aborted || selectedKeyRef.current !== key || result.ticketKey !== key) return;
      setAnalysis(result);
      setChosen(result.suggestions.map((suggestion) => suggestion.id));
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo analizar el ticket.");
    } finally { if (analysisRequest.current === controller) { analysisRequest.current = null; setAnalyzing(false); } }
  }

  function toggleSuggestion(suggestion: JiraSuggestion, checked: boolean) {
    setChosen((current) => checked ? [...current, suggestion.id] : current.filter((id) => id !== suggestion.id));
  }

  async function saveSuggestions() {
    if (!selected || !analysis || analysis.ticketKey !== selected.key || saving) return;
    const chosenSuggestions = analysis.suggestions.filter((suggestion) => chosen.includes(suggestion.id));
    if (!chosenSuggestions.length) { notify("Selecciona al menos un escenario."); return; }
    setSaving(true);
    const created: string[] = [];
    try {
      for (const suggestion of chosenSuggestions) {
        const id = await addCase({
          name: suggestion.title, jiraId: selected.key, priority: suggestion.priority,
          preconditions: suggestion.pre, status: "Borrador", componentId: data.components[0]?.id ?? "",
          notes: `Generado desde ${selected.key} · ${selected.url}`,
          steps: [{ id: uid(), type: "act", text: suggestion.title, data: suggestion.pre, expected: suggestion.expected }],
        });
        created.push(id);
      }
      notify(`${created.length} caso${created.length === 1 ? "" : "s"} guardado${created.length === 1 ? "" : "s"} desde ${selected.key}.`);
      navigate(`/tests/${created[0]}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudieron guardar todos los casos.";
      notify(created.length ? `${created.length} caso(s) guardado(s); ocurrió un error: ${message}` : message);
    } finally { setSaving(false); }
  }

  const suggestions = analysis?.ticketKey === selectedKey ? analysis.suggestions : [];
  return <div className="page-content generate-page">
    <PageHeading eyebrow="ASISTENTE DE QA" title="Generación inteligente" description="Sincroniza incidencias de Jira y analiza sus requisitos con IA." actions={<Link className="btn btn-secondary" to="/settings">Configuración Jira</Link>} />
    {loading ? <div className="loading-state">Consultando la conexión Jira…</div> : !connection?.configured ? <EmptyState title="Jira no está conectado" description="Configura una conexión Jira para consultar y analizar tickets. No se muestran tickets de ejemplo." icon="link"><Link className="btn btn-primary" to="/settings">Configurar Jira</Link></EmptyState> : <div className="generate-workspace jira-real-workspace">
      <aside className="ticket-browser"><div className="ticket-browser-header"><span className="eyebrow">FUENTE · JIRA</span><div className="ticket-browser-title"><h2>Tickets de trabajo</h2><Badge>{issues.length}</Badge></div>
        <label className="search-field"><Icon name="search" size={15} /><input placeholder="Buscar por key o título" aria-label="Buscar tickets" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void refresh(); }} /></label>
        <div className="jira-sync-row"><span className="connected-indicator jira-connected"><i /> Conectado · {connection.projectKey}</span><Button icon="refresh" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "Actualizando…" : "Actualizar"}</Button></div>
      </div><div className="ticket-browser-list">
        {visibleIssues.map((issue) => <button key={issue.key} className={`ticket-card ${selectedKey === issue.key ? "selected" : ""}`} onClick={() => setSelectedKey(issue.key)}>
          <div><span className="jira-key">{issue.key}</span><span className="ticket-priority">{issue.priority}</span></div><strong>{issue.title}</strong><small><i className="legend-dot legend-blue" />{issue.status} · {issue.assignee}</small><Badge>{issue.type}</Badge>
        </button>)}
        {!visibleIssues.length && <p className="context-copy jira-list-empty">{issues.length ? "No hay tickets que coincidan con la búsqueda." : "El proyecto conectado no tiene tickets visibles."}</p>}
        {nextPageToken && !search && <Button className="btn-full" disabled={refreshing} onClick={async () => { setRefreshing(true); try { await loadIssues(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar la siguiente página."); } finally { setRefreshing(false); } }}>Cargar más tickets</Button>}
      </div></aside>
      <main className="ticket-detail">
        {error && <div className="info-notice jira-error" role="alert"><Icon name="shield" size={18} /><span>{error}</span></div>}
        {selected ? <><div className="ticket-detail-head"><div><div className="detail-meta-line"><a className="jira-key" href={selected.url} target="_blank" rel="noreferrer">{selected.key}<Icon name="external" size={12} /></a><Badge tone="blue">{selected.status}</Badge><Badge>{selected.type}</Badge><Badge tone={tones[selected.priority]}>{selected.priority}</Badge></div><h2>{selected.title}</h2><p className="jira-description">{selected.description || "El ticket no incluye descripción."}</p></div><Button variant="primary" icon="sparkles" disabled={analyzing} onClick={() => void analyze()}>{analyzing ? <><span className="spinner spinner-white" /> Analizando…</> : "Analizar ticket"}</Button></div>
          <div className="ticket-meta-strip"><div><small>Responsable</small><strong>{selected.assignee}</strong></div><div><small>Tipo</small><strong>{selected.type}</strong></div><div><small>Actualizado</small><strong>{selected.updatedAt ? new Date(selected.updatedAt).toLocaleString("es-AR") : "—"}</strong></div><div><small>Ticket padre</small><strong>{selected.parent || "—"}</strong></div></div>
          {analyzing && <div className="analysis-empty"><span className="spinner large-spinner" /><h3>Analizando ticket real…</h3><p>Se están generando escenarios a partir de la descripción disponible.</p></div>}
          {!analysis && !analyzing && <div className="analysis-empty"><span className="assistant-spark large"><Icon name="sparkles" size={22} /></span><h3>Listo para analizar {selected.key}</h3><p>El análisis usará la descripción y los metadatos reales de Jira.</p><Button variant="primary" icon="sparkles" onClick={() => void analyze()}>Analizar {selected.key}</Button></div>}
          {analysis?.ticketKey === selected.key && <section className="generated-results"><div className="generated-summary"><span className="assistant-spark"><Icon name="sparkles" size={17} /></span><div><strong>Análisis de {analysis.ticketKey} · {suggestions.length} escenarios</strong><p>Propuesta generada con IA a partir de la incidencia.</p></div><Button variant="primary" disabled={saving || !chosen.length} onClick={() => void saveSuggestions()}>{saving ? "Guardando…" : `Guardar ${chosen.length} casos`}</Button></div>
            <Tabs active={tab} onChange={setTab} items={[{ id: "cases", label: "Casos sugeridos", count: suggestions.length }, { id: "docs", label: "Análisis" }]} />
            {tab === "cases" && <div className="suggestion-list">{suggestions.map((suggestion) => <label className={`suggestion-card ${chosen.includes(suggestion.id) ? "suggestion-selected" : ""}`} key={suggestion.id}><input type="checkbox" checked={chosen.includes(suggestion.id)} onChange={(event) => toggleSuggestion(suggestion, event.target.checked)} /><span className="suggestion-copy"><strong>{suggestion.title}</strong><small>{suggestion.pre}</small><span><Badge>{suggestion.type}</Badge><Badge tone={tones[suggestion.priority]}>{suggestion.priority}</Badge></span></span><span className="suggestion-expect"><small>RESULTADO ESPERADO</small>{suggestion.expected}</span></label>)}</div>}
            {tab === "docs" && <div className="analysis-document"><h3>Análisis · {analysis.ticketKey}</h3><p>{analysis.documentation}</p></div>}
          </section>}
        </> : !error && <EmptyState title="Selecciona un ticket" description="Elige una incidencia del proyecto Jira conectado." icon="cases" />}
      </main>
    </div>}
  </div>;
}
