import type { Bug, CreateBug, CreateFolderInput, ExecutionEngine, Folder, Run, Test, TestListItem, BugStatus, UpdateFolderInput } from "../types";
import type { CaseStep, DemoRun, TestCase } from "./model";
import type { TestMetadata } from "../types";
import type { JiraAnalysis, JiraConnection, JiraIssue, JiraIssuePage } from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `Solicitud fallida (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const metadata = (test: Pick<TestCase, "key" | "componentId" | "status" | "priority" | "preconditions" | "jiraId" | "testType" | "release" | "notes">) => ({ ...test });

export type ChatInputMessage = { id: string; role: "user" | "assistant"; parts: { type: "text"; text: string }[] };
export type AiRuntime = "native" | "opencode" | "claude";
export type AiCatalogModel = { id: string; name: string; providerId?: string; local?: boolean };
export type AiCatalogAgent = { id: string; name: string; description?: string; mode?: string };
export type AiCatalog = {
  runtimes: Array<{ id: AiRuntime; name: string; available: boolean; error?: string }>;
  e2e: { provider: string; model: string; local: boolean; available: boolean; error?: string };
  native: { agents: AiCatalogAgent[]; models: AiCatalogModel[] };
  opencode: { agents: AiCatalogAgent[]; models: AiCatalogModel[] };
  claude: { agents: AiCatalogAgent[]; models: AiCatalogModel[] };
};
export type ChatSelection = { runtime: AiRuntime; agent?: string; model?: string; sessionId?: string };
export type ChatStreamEvent = {
  type: string; delta?: string; toolCallId?: string; toolName?: string; input?: unknown;
  output?: unknown; errorText?: string; sessionId?: string; runtime?: AiRuntime;
};

export const getAiCatalog = () => request<AiCatalog>("/api/ai/catalog");

export async function streamChat(
  input: { messages: ChatInputMessage[]; testId?: string; baseUrl?: string; selection?: ChatSelection },
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `No se pudo iniciar el chat (${response.status})`);
  }
  if (!response.body) throw new Error("El servidor no devolvió un stream de respuesta");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const processLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trimStart();
    if (payload && payload !== "[DONE]") onEvent(JSON.parse(payload) as ChatStreamEvent);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    lines.forEach(processLine);
  }
  buffer += decoder.decode();
  if (buffer) processLine(buffer);
}

export function fromTest(test: Test | TestListItem): TestCase {
  const fields = test.metadata ?? {};
  return {
    id: test.id,
    folderId: test.folderId,
    key: fields.key || test.id.toUpperCase(),
    name: test.name,
    url: test.url,
    script: "script" in test ? test.script : "",
    steps: test.steps.map((step) => ({ ...step, data: step.data || "", expected: step.expected || "" })),
    updatedAt: test.updatedAt,
    componentId: fields.componentId || "",
    status: (fields.status as TestCase["status"]) || "Borrador",
    priority: (fields.priority as TestCase["priority"]) || "Media",
    preconditions: fields.preconditions || "",
    jiraId: fields.jiraId || "",
    testType: (fields.testType as TestCase["testType"]) || "Automatizado",
    release: fields.release || "",
    notes: fields.notes || "",
  };
}

export function toRun(run: Run & { summary?: Run["summary"] }): DemoRun {
  const legacy = run as Partial<DemoRun>;
  const snapshot = run.testSnapshot ?? { name: legacy.testName || run.id, url: "", steps: legacy.steps || [], metadata: {} as TestMetadata };
  return {
    id: run.id,
    testId: run.testId,
    engine: run.engine ?? "e2e",
    name: `Ejecución · ${snapshot.metadata.key || run.testId}`,
    testName: snapshot.name,
    environment: "PostgreSQL",
    status: run.status,
    startedAt: run.startedAt || run.createdAt || new Date().toISOString(),
    finishedAt: run.finishedAt,
    steps: snapshot.steps.map((step): CaseStep => ({ ...step, data: step.data || "", expected: step.expected || "" })),
    stepResults: run.stepResults,
    codeSnapshot: run.codeSnapshot,
    demo: false,
    summary: run.summary ?? null,
  };
}

export const api = {
  listTests: () => request<TestListItem[]>("/api/tests"),
  createTest: (test: Partial<TestCase>) => request<Test>("/api/tests", { method: "POST", body: JSON.stringify({ name: test.name, url: test.url, metadata: metadata(test as TestCase) }) }),
  updateTest: (id: string, test: Partial<TestCase>) => request<Test>(`/api/tests/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name: test.name, url: test.url, folderId: test.folderId, metadata: metadata(test as TestCase), steps: test.steps }) }),
  deleteTest: (id: string) => request<void>(`/api/tests/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setSteps: (id: string, steps: TestCase["steps"]) => request<Test>(`/api/tests/${encodeURIComponent(id)}/steps`, { method: "PUT", body: JSON.stringify({ steps }) }),
  listTestFolders: (workspaceId = "default") => request<Folder[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/folders?kind=test`),
  createFolder: (input: CreateFolderInput, workspaceId = "default") => request<Folder>(`/api/workspaces/${encodeURIComponent(workspaceId)}/folders`, { method: "POST", body: JSON.stringify({ ...input, kind: "test" }) }),
  updateFolder: (id: string, patch: UpdateFolderInput) => request<Folder>(`/api/folders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteFolder: (id: string) => request<void>(`/api/folders/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listRuns: () => request<(Run & { summary?: Run["summary"] })[]>("/api/runs"),
  getRun: (id: string) => request<Run & { summary?: Run["summary"] }>(`/api/runs/${encodeURIComponent(id)}`),
  previewRun: (id: string, engine: ExecutionEngine) => request<{ engine: ExecutionEngine; code: string }>(`/api/tests/${encodeURIComponent(id)}/run/preview`, { method: "POST", body: JSON.stringify({ engine }) }),
  startRun: (id: string, input: { engine: ExecutionEngine; code?: string }) => request<{ runId: string }>(`/api/tests/${encodeURIComponent(id)}/run`, { method: "POST", body: JSON.stringify(input) }),
  listBugs: (workspaceId = "default") => request<Bug[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/bugs`),
  getBug: (id: string) => request<Bug>(`/api/bugs/${encodeURIComponent(id)}`),
  createBug: (runId: string, bug: CreateBug) => request<Bug>(`/api/runs/${encodeURIComponent(runId)}/bugs`, { method: "POST", body: JSON.stringify(bug) }),
  updateBug: (id: string, patch: { status?: BugStatus; ticket?: string | null }) => request<Bug>(`/api/bugs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  getJiraConnection: (workspaceId = "default") => request<JiraConnection>(`/api/workspaces/${encodeURIComponent(workspaceId)}/jira/connection`),
  testJiraConnection: (input: { baseUrl: string; email: string; apiToken?: string; projectKey: string }, workspaceId = "default") => request<{ ok: true; projectKey: string }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/jira/connection/test`, { method: "POST", body: JSON.stringify(input) }),
  saveJiraConnection: (input: { baseUrl: string; email: string; apiToken?: string; projectKey: string }, workspaceId = "default") => request<JiraConnection>(`/api/workspaces/${encodeURIComponent(workspaceId)}/jira/connection`, { method: "PUT", body: JSON.stringify(input) }),
  deleteJiraConnection: (workspaceId = "default") => request<void>(`/api/workspaces/${encodeURIComponent(workspaceId)}/jira/connection`, { method: "DELETE" }),
  listJiraIssues: (options: { query?: string; pageToken?: string; pageSize?: number } = {}, workspaceId = "default") => {
    const params = new URLSearchParams();
    if (options.query) params.set("query", options.query);
    if (options.pageToken) params.set("pageToken", options.pageToken);
    if (options.pageSize) params.set("pageSize", String(options.pageSize));
    return request<JiraIssuePage>(`/api/workspaces/${encodeURIComponent(workspaceId)}/jira/issues${params.size ? `?${params}` : ""}`);
  },
  getJiraIssue: (key: string, workspaceId = "default") => request<JiraIssue>(`/api/workspaces/${encodeURIComponent(workspaceId)}/jira/issues/${encodeURIComponent(key)}`),
  analyzeJiraIssue: (key: string, workspaceId = "default") => request<JiraAnalysis>(`/api/workspaces/${encodeURIComponent(workspaceId)}/jira/issues/${encodeURIComponent(key)}/analyze`, { method: "POST" }),
};
