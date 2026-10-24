import type { CaseStep, TestCase, Workspace } from "./model";

const steps: CaseStep[] = [
  { id: "s1", type: "act", text: "Ingresar con credenciales válidas de médico", data: "Usuario de prueba con rol Médico", expected: "Dashboard principal visible sin errores" },
  { id: "s2", type: "act", text: "Hacer clic en Iniciar guardia", data: "Médico habilitado", expected: "Se abre el modal de confirmación" },
  { id: "s3", type: "assert", text: "Confirmar que la guardia está activa y el timer iniciado", data: "Confirmación de inicio", expected: "Guardia activa con timer en marcha" },
];
const titles = ["Usuario realiza la guardia exitosamente", "Sistema valida credenciales del médico correctamente", "Guardia se registra en el historial del paciente", "Paciente puede ver el médico asignado a su guardia", "Notificación enviada al médico al iniciar guardia", "Flujo de guardia de urgencias (legado)"];
const cases: TestCase[] = titles.map((name, i) => ({
  id: `tc${i + 1}`, key: `TC-00${i + 1}`, name, url: "http://localhost:3002", script: "", componentId: i < 3 ? "c1" : "c2",
  status: (["Publicado", "Publicado", "En revisión", "Borrador", "Borrador", "Deprecado"] as const)[i], priority: i < 2 ? "Alta" : i < 4 ? "Media" : "Baja",
  preconditions: i === 0 ? "Usuario con rol Médico activo y habilitado para realizar guardias." : "Sesión de prueba activa en el entorno Staging.",
  jiraId: `DOC-${248 + i}`, testType: i < 2 ? "Automatizado" : "Manual", release: "v2.0", notes: i === 2 ? "Verificar persistencia con conexión lenta." : "",
  steps: i === 0 ? steps : [{ id: `s${i + 1}-1`, type: "act", text: i === 1 ? "Ingresar credenciales incorrectas tres veces" : name, data: "Datos de prueba del entorno", expected: i === 1 ? "Se informa el bloqueo temporal de la cuenta" : "El sistema completa la operación correctamente" }],
  updatedAt: "2026-10-24T10:30:00Z",
}));
export const seed: Workspace = {
  version: 1,
  components: [
    { id: "c1", name: "Flujo principal de guardia", description: "Cubre el flujo feliz desde el inicio hasta el cierre exitoso de la guardia.", systems: ["DOC24", "WEHEALTHY"], actors: ["Médico", "Paciente"], platforms: ["Web-Desktop", "Web-Mobile"] },
    { id: "c2", name: "Notificaciones y asignación", description: "Comunicación entre médico y paciente durante la guardia activa.", systems: ["DOC24"], actors: ["Médico", "Paciente"], platforms: ["Android", "iOS"] },
  ],
  cases,
  runs: [
    { id: "run-demo-14", testId: "tc1", name: "Regresión Sprint 14 — Guardias", testName: titles[0], environment: "Staging", status: "failed", startedAt: "2026-10-24T10:00:00Z", finishedAt: "2026-10-24T10:01:23Z", demo: true, steps, stepResults: [{ stepId: "s1", status: "passed" }, { stepId: "s2", status: "passed" }, { stepId: "s3", status: "failed", error: "La guardia se creó, pero el contador permanece en 00:00. Resultado de ejemplo." }] },
    { id: "run-demo-13", testId: "tc2", name: "Smoke test — Autenticación", testName: titles[1], environment: "QA", status: "passed", startedAt: "2026-10-23T15:30:00Z", finishedAt: "2026-10-23T15:30:42Z", demo: true, steps: cases[1].steps, stepResults: [{ stepId: cases[1].steps[0].id, status: "passed" }] },
  ],
  bugs: [
    { id: "BUG-001", runId: "run-demo-14", testId: "tc1", title: "El timer no se inicia al confirmar la guardia", severity: "Alta", status: "Abierto", expected: "El contador comienza al confirmar el inicio de guardia.", actual: "La guardia está activa, pero el contador permanece en 00:00.", notes: "Incidencia de ejemplo del mockup." },
    { id: "BUG-002", runId: "run-demo-14", testId: "tc3", title: "El historial muestra la hora con un desfase de una hora", severity: "Media", status: "En análisis", expected: "Fecha y hora local del paciente.", actual: "La hora registrada tiene un desfase de una hora.", notes: "Revisar conversión de zona horaria. Datos de ejemplo." },
  ],
  conversations: [],
  preferences: { environment: "Staging", projectName: "Guardias", baseUrl: "http://localhost:3002", provider: "Anthropic", model: "Claude Sonnet", repo: "", branch: "main", jiraUrl: "", jiraProject: "DOC24", chrome: true, appium: false, mcpUrl: "http://localhost:3001/mcp" },
};
