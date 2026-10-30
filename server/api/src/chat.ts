import { createModel } from "@agent-tester/core/model";
import { getTest, type Test } from "@agent-tester/core";
import { claudeChat, openCodeChat, type AiSelection, type AiRuntime } from "./ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { convertToModelMessages, jsonSchema, stepCountIs, streamText, tool, type ToolSet, type UIMessage } from "ai";
import { fileURLToPath } from "node:url";

type McpTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];
type McpResult = Awaited<ReturnType<Client["callTool"]>>;

const contextTools = new Set(["get_test", "set_steps", "edit_step", "run_test", "get_run"]);
const newTestTools = new Set([...contextTools, "list_tests", "create_test"]);

function system(test: Test | null, baseUrl: string) {
  const steps = test?.steps.length
    ? test.steps.map((s, i) => `${i + 1}. [${s.id}] ${s.type}: ${s.text}${s.value ? ` (value: ${s.value})` : ""}${s.target ? ` (target: ${s.target})` : ""}`).join("\n")
    : "(sin pasos)";
  const context = test
    ? `Caso actual: "${test.name}" (id: ${test.id}). URL inicial: ${test.url}.\nPasos actuales:\n${steps}`
    : `No hay un caso seleccionado. Para crear uno, usa create_test con un nombre claro y la URL indicada por el usuario; si no indica una, usa ${baseUrl}. Después escribe sus pasos con set_steps.`;
  return `Ayudas a un tester a diseñar, corregir y ejecutar pruebas e2e web. Responde siempre en español y de forma breve.
Las herramientas disponibles pertenecen al MCP Agent Tester. Úsalas para consultar o cambiar casos y para ejecutarlos; nunca simules una ejecución ni un resultado.
Cuando el usuario pida probar un flujo de principio a fin, crea o actualiza los pasos y ejecuta run_test. Si solo pide diseño o documentación, no ejecutes el caso.
No repitas la lista de pasos en la respuesta porque ya se muestra en la interfaz.
Después de una ejecución failed, revisa el paso y el error, explica la causa en una o dos frases, corrige los pasos y reintenta como máximo 2 veces. Si el estado es error, informa el problema sin cambiar los pasos.
${context}`;
}
function resultText(result: McpResult) {
  const value = result as { content?: { type: string; text?: string }[]; isError?: boolean; toolResult?: unknown };
  if (!value.content) return JSON.stringify(value.toolResult);
  const text = value.content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
  if (value.isError) throw new Error(text || "La herramienta MCP falló");
  return text;
}

function schemaFor(definition: McpTool, bindTest: boolean) {
  const schema = { ...definition.inputSchema };
  if (bindTest && schema.properties?.testId) {
    const properties = { ...schema.properties };
    delete properties.testId;
    schema.properties = properties;
    schema.required = schema.required?.filter((name) => name !== "testId");
  }
  return jsonSchema(schema as Parameters<typeof jsonSchema>[0]);
}

async function mcpTools(client: Client, testId?: string): Promise<ToolSet> {
  const allowed = testId ? contextTools : newTestTools;
  const definitions = (await client.listTools()).tools.filter((definition) => allowed.has(definition.name));
  return Object.fromEntries(definitions.map((definition) => {
    const bindTest = Boolean(testId) && definition.name !== "get_run";
    return [definition.name, tool({
      description: definition.description,
      inputSchema: schemaFor(definition, bindTest),
      execute: async (input, { abortSignal }) => {
        const args = input as Record<string, unknown>;
        const result = await client.callTool({
          name: definition.name,
          arguments: bindTest ? { ...args, testId } : args,
        }, undefined, { signal: abortSignal, timeout: definition.name === "run_test" ? 300_000 : 30_000 });
        return resultText(result);
      },
    })];
  }));
}

export async function chat(body: { messages: UIMessage[]; testId?: string; baseUrl?: string; selection?: AiSelection }, abortSignal?: AbortSignal): Promise<Response> {
  const test = body.testId ? await getTest(body.testId) : null;
  const selection = body.selection ?? { runtime: "native" as const };
  const runtime: AiRuntime = selection.runtime ?? "native";
  const prompt = [...body.messages].reverse().find((message) => message.role === "user")?.parts
    .map((part) => part.type === "text" ? part.text : "").join("\n").trim();
  if (!prompt) return Response.json({ error: "Escribe un mensaje antes de iniciar el chat." }, { status: 400 });
  const baseUrl = body.baseUrl?.trim() || "http://localhost:3002";
  const systemPrompt = system(test, baseUrl);
  try {
    if (runtime === "opencode") return await openCodeChat({ selection, prompt, messages: body.messages as any, system: systemPrompt }, abortSignal);
    if (runtime === "claude") return await claudeChat({ selection, prompt, system: systemPrompt, messages: body.messages as any }, abortSignal);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar el runtime de IA seleccionado.";
    return Response.json({ error: message }, { status: 503 });
  }
  if (runtime !== "native") return Response.json({ error: `Runtime no soportado: ${runtime}` }, { status: 400 });
  const client = new Client({ name: "agent-tester-chat", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../../mcp/src/stdio.ts", import.meta.url))],
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: {
      SERVER_URL: process.env.SERVER_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`,
      WEB_URL: process.env.WEB_URL ?? "http://localhost:5173",
    },
  });
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= client.close().catch(() => undefined);
    return closing;
  };
  try {
    const model = createModel("chat");
    await client.connect(transport);
    const tools = await mcpTools(client, test?.id);
    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(body.messages, { tools }),
      tools,
      abortSignal,
      stopWhen: stepCountIs(20),
    });
    return result.toUIMessageStreamResponse({
      keepAliveMs: 15_000,
      onEnd: close,
      onError: (error) => error instanceof Error ? error.message : "No se pudo completar la respuesta",
    });
  } catch (error) {
    await close();
    const message = error instanceof Error ? error.message : "No se pudo conectar con el servicio de IA o MCP";
    return Response.json({ error: message }, { status: 503 });
  }
}
