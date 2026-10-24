import type { Run, Step, Test } from "../types";
import type { Bug as ApiBug } from "../types";

// UI-only documentation fields. The REST contract in types.ts remains unchanged.
export const caseStatuses = ["Publicado", "En revisión", "Borrador", "Deprecado"] as const;
export const priorities = ["Alta", "Media", "Baja"] as const;
export type CaseStatus = typeof caseStatuses[number];
export type Priority = typeof priorities[number];
export type CaseStep = Step & { data: string; expected: string };
export type TestCase = Omit<Test, "steps" | "metadata"> & {
  key: string; componentId: string; status: CaseStatus; priority: Priority;
  preconditions: string; jiraId: string; testType: "Manual" | "Automatizado"; release: string;
  notes: string; steps: CaseStep[];
};
export type Component = { id: string; name: string; description: string; systems: string[]; actors: string[]; platforms: string[] };
export type DemoRun = Run & { name: string; testName: string; environment: string; steps: CaseStep[]; demo: boolean };
export type Bug = ApiBug;
export type ChatActivity = { id: string; name: string; status: "running" | "done" | "error"; detail?: string };
export type Message = { id: string; role: "user" | "assistant"; content: string; draft?: { name: string; steps: CaseStep[] }; savedCaseId?: string; activities?: ChatActivity[]; streaming?: boolean; error?: boolean };
export type Conversation = { id: string; title: string; testId: string; messages: Message[]; updatedAt: string };
export type Preferences = { environment: string; projectName: string; baseUrl: string; provider: string; model: string; repo: string; branch: string; jiraUrl: string; jiraProject: string; chrome: boolean; appium: boolean; mcpUrl: string };
export type Workspace = { version: 1; components: Component[]; cases: TestCase[]; runs: DemoRun[]; bugs: Bug[]; conversations: Conversation[]; preferences: Preferences };
export const uid = () => crypto.randomUUID();
export const tones: Record<string, string> = { "Publicado": "green", "En revisión": "blue", "Borrador": "neutral", "Deprecado": "pink", "Alta": "red", "Media": "amber", "Baja": "green", "passed": "green", "failed": "red", "running": "blue", "queued": "amber", "error": "red", "Abierto": "red", "En análisis": "blue", "Resuelto": "green", "Cerrado": "neutral", "pending": "neutral", "skipped": "neutral" };
export const runLabels: Record<string, string> = { passed: "Aprobada", failed: "Fallida", running: "En progreso", queued: "En cola", error: "Interrumpida", pending: "Pendiente", skipped: "Omitido" };
export const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export function scriptPreview(test: TestCase) {
  return test.script;
}
export function caseMarkdown(test: TestCase) {
  return `# ${test.key} · ${test.name}\n\nEstado: ${test.status}\nPrioridad: ${test.priority}\nJira: ${test.jiraId || "—"}\n\n## Precondiciones\n${test.preconditions || "Sin precondiciones"}\n\n## Pasos\n${test.steps.map((s, i) => `${i + 1}. ${s.text}\n   - Datos: ${s.data || "—"}\n   - Resultado esperado: ${s.expected || "—"}`).join("\n")}\n\n## Notas\n${test.notes}\n`;
}
