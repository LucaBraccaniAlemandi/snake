import type { CaseStep, TestCase, Workspace } from "./model";

const steps: CaseStep[] = [
  { id: "s1", type: "act", text: "Agregar una taza al carrito", data: "Tienda Demo Shop abierta en http://localhost:3002", expected: "El contador del carrito muestra 1 y la taza aparece en el carrito" },
  { id: "s2", type: "act", text: "Aplicar el cupón SAVE10", data: "Abrir carrito y desplegar Have a code?", expected: "Se aplica un descuento del 10% al subtotal" },
  { id: "s3", type: "assert", text: "Completar la compra", data: "Carrito con un producto y cupón aplicado", expected: "Se muestra la confirmación del pedido con el total descontado" },
];
const titles = ["Cliente compra una taza con el cupón SAVE10", "Cliente agrega varios productos al carrito", "El carrito calcula subtotal y total correctamente", "Cliente continúa comprando desde el carrito", "Compra muestra la confirmación con el total", "Aplicar un cupón inválido no descuenta el precio"];
const cases: TestCase[] = titles.map((name, i) => ({
  id: `tc${i + 1}`, key: `TC-00${i + 1}`, name, url: "http://localhost:3002", script: "", componentId: i < 3 ? "c1" : "c2",
  status: (["Publicado", "Publicado", "En revisión", "Borrador", "Borrador", "Deprecado"] as const)[i], priority: i < 2 ? "Alta" : i < 4 ? "Media" : "Baja",
   preconditions: i === 0 ? "Demo Shop disponible en http://localhost:3002; carrito vacío." : "Tienda Demo Shop abierta en el navegador.",
   jiraId: `SHOP-${101 + i}`, testType: i < 2 ? "Automatizado" : "Manual", release: "demo", notes: i === 2 ? "Comprobar los importes después de modificar el contenido del carrito." : "",
   steps: i === 0 ? steps : [{ id: `s${i + 1}-1`, type: "act", text: i === 1 ? "Agregar una taza y una camiseta al carrito" : name, data: "Productos disponibles en Demo Shop", expected: i === 1 ? "El carrito muestra ambos productos y el contador indica 2" : "La tienda completa la operación y muestra el resultado esperado" }],
  updatedAt: "2026-10-24T10:30:00Z",
}));
export const seed: Workspace = {
  version: 1,
  components: [
     { id: "c1", name: "Catálogo y carrito", description: "Productos, contador del carrito, subtotal y total de la compra.", systems: ["Demo Shop"], actors: ["Cliente"], platforms: ["Web-Desktop", "Web-Mobile"] },
     { id: "c2", name: "Cupones y checkout", description: "Aplicación de descuentos y confirmación del pedido.", systems: ["Demo Shop"], actors: ["Cliente"], platforms: ["Web-Desktop", "Web-Mobile"] },
  ],
  cases,
  runs: [
     { id: "run-demo-14", testId: "tc1", name: "Compra con cupón — Demo Shop", testName: titles[0], environment: "Local", status: "failed", startedAt: "2026-10-24T10:00:00Z", finishedAt: "2026-10-24T10:01:23Z", demo: true, steps, stepResults: [{ stepId: "s1", status: "passed" }, { stepId: "s2", status: "passed" }, { stepId: "s3", status: "failed", error: "La confirmación muestra un total que no refleja el descuento. Resultado de ejemplo." }] },
     { id: "run-demo-13", testId: "tc2", name: "Smoke test — Carrito", testName: titles[1], environment: "Local", status: "passed", startedAt: "2026-10-23T15:30:00Z", finishedAt: "2026-10-23T15:30:42Z", demo: true, steps: cases[1].steps, stepResults: [{ stepId: cases[1].steps[0].id, status: "passed" }] },
  ],
  bugs: [
      { id: "BUG-001", runId: "run-demo-14", testId: "tc1", title: "El total del pedido no refleja el descuento del cupón", severity: "Alta", status: "Abierto", expected: "El total descuenta el 10% aplicado por SAVE10.", actual: "La confirmación muestra el subtotal sin aplicar el descuento.", notes: "Incidencia de ejemplo del mockup.", ticket: null, createdAt: "2026-10-24T10:01:23Z", updatedAt: "2026-10-24T10:01:23Z" },
      { id: "BUG-002", runId: "run-demo-14", testId: "tc1", title: "El contador del carrito no se actualiza al agregar un producto", severity: "Media", status: "En análisis", expected: "El contador aumenta al agregar cada producto.", actual: "El producto aparece en el carrito pero el contador queda desactualizado.", notes: "Revisar actualización del estado del carrito. Datos de ejemplo.", ticket: null, createdAt: "2026-10-24T10:00:00Z", updatedAt: "2026-10-24T10:00:00Z" },
  ],
  conversations: [],
   preferences: { environment: "Local", projectName: "Demo Shop", baseUrl: "http://localhost:3002", provider: "Anthropic", model: "Claude Sonnet", repo: "", branch: "main", jiraUrl: "", jiraProject: "SHOP", chrome: true, appium: false, mcpUrl: "http://localhost:3001/mcp" },
};
