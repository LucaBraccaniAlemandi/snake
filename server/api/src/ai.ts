import { query as claudeQuery } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AiRuntime = "native" | "opencode" | "claude";
export type AiSelection = { runtime?: AiRuntime; agent?: string; model?: string; sessionId?: string };
type CatalogModel = { id: string; name: string; providerId?: string; local?: boolean };
type CatalogAgent = { id: string; name: string; description?: string; mode?: string };
export type AiCatalog = {
  runtimes: Array<{ id: AiRuntime; name: string; available: boolean; error?: string }>;
  e2e: { provider: string; model: string; local: boolean; available: boolean; error?: string };
  opencode: { agents: CatalogAgent[]; models: CatalogModel[] };
  claude: { agents: CatalogAgent[]; models: CatalogModel[] };
  native: { agents: CatalogAgent[]; models: CatalogModel[] };
};

const SERVER_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const OPENCODE_URL = (process.env.OPENCODE_BASE_URL || "http://127.0.0.1:4096").replace(/\/$/, "");
const OPENCODE_USER = process.env.OPENCODE_SERVER_USERNAME || "opencode";
const OPENCODE_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD;

function opencodeHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  if (OPENCODE_PASSWORD) headers.set("authorization", `Basic ${Buffer.from(`${OPENCODE_USER}:${OPENCODE_PASSWORD}`).toString("base64")}`);
  return headers;
}

async function openCodeJson(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (OPENCODE_PASSWORD) headers.set("authorization", `Basic ${Buffer.from(`${OPENCODE_USER}:${OPENCODE_PASSWORD}`).toString("base64")}`);
  const response = await fetch(`${OPENCODE_URL}${path}`, {
    ...init,
    headers,
    signal: init?.signal ?? AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`OpenCode respondió ${response.status} en ${path}`);
  if (response.status === 204) return undefined;
  return response.json() as Promise<any>;
}

function unwrap(value: any): any { return value?.data ?? value; }

function isLocalEndpoint(value: unknown) {
  if (typeof value !== "string") return false;
  try { return ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(new URL(value).hostname); }
  catch { return false; }
}

function directoryAgents(directory: string): CatalogAgent[] {
  if (!existsSync(directory)) return [];
  const output: CatalogAgent[] = [];
  let files;
  try { files = readdirSync(directory, { withFileTypes: true }); } catch { return output; }
  for (const file of files) {
    const path = join(directory, file.name);
    if (file.isDirectory()) { output.push(...directoryAgents(path)); continue; }
    if (!file.isFile() || !file.name.endsWith(".md")) continue;
    let text: string;
    try { text = readFileSync(path, "utf8"); } catch { continue; }
    const frontMatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    const name = frontMatter?.[1].match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1] || file.name.replace(/\.md$/, "");
    const description = frontMatter?.[1].match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1];
    output.push({ id: name.trim(), name: name.trim(), description: description?.trim() });
  }
  return output;
}

function claudeAgents(): CatalogAgent[] {
  const config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const agents = [
    ...directoryAgents(join(config, "agents")),
    ...directoryAgents(join(SERVER_ROOT, ".claude", "agents")),
  ];
  const unique = new Map(agents.map((agent) => [agent.id, agent]));
  return [{ id: "default", name: "Agente principal", description: "Agente Claude configurado por defecto" }, ...unique.values()];
}

function nativeCatalog() {
  const model = (process.env.CHAT_MODEL || "inception/mercury-2.5").replace(/^openrouter\//, "");
  const hasKey = Boolean(process.env.OPENROUTER_API_KEY?.trim() || process.env.API_KEY?.trim());
  return {
    agents: [{ id: "agent-tester", name: "Asistente de QA", description: "Chat de Agent Tester con MCP" }],
    models: [{ id: model, name: `${model}${hasKey ? " · OpenRouter" : " · requiere API key"}`, providerId: "openrouter" }],
    available: hasKey,
    error: hasKey ? undefined : "Configura OPENROUTER_API_KEY para usar el runtime integrado.",
  };
}

export async function getAiCatalog(): Promise<AiCatalog> {
  const native = nativeCatalog();
  const e2eEndpoint = process.env.E2E_BASE_URL?.trim() || "";
  const e2eLocal = isLocalEndpoint(e2eEndpoint);
  const e2eKey = Boolean(process.env.OPENROUTER_API_KEY?.trim() || process.env.API_KEY?.trim());
  const e2eModel = (process.env.E2E_MODEL?.trim() || "inception/mercury-2.5").replace(/^openrouter\//, "");
  const configuredClaudeModel = process.env.CLAUDE_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim();
  const claudeModels: CatalogModel[] = [
    { id: "", name: "Modelo predeterminado de Claude Code" },
    ...(configuredClaudeModel ? [{ id: configuredClaudeModel, name: `${configuredClaudeModel} · configurado` }] : []),
    { id: "sonnet", name: "Sonnet" }, { id: "haiku", name: "Haiku" }, { id: "opus", name: "Opus" },
  ];
  const result: AiCatalog = {
    runtimes: [],
    e2e: {
      provider: e2eEndpoint ? "OpenAI-compatible" : "OpenRouter",
      model: e2eModel,
      local: e2eLocal,
      available: Boolean(e2eEndpoint) || e2eKey,
      error: e2eEndpoint || e2eKey ? undefined : process.env.E2E_API_KEY?.trim()
        ? "E2E_API_KEY se usa junto con E2E_BASE_URL; configura también el endpoint compatible."
        : "Configura una clave OpenRouter o un endpoint E2E_BASE_URL compatible.",
    },
    native: { agents: native.agents, models: native.models },
    opencode: { agents: [], models: [] },
    claude: {
      agents: claudeAgents(),
      models: claudeModels.filter((model, index) => claudeModels.findIndex((other) => other.id === model.id) === index),
    },
  };
  let opencodeAvailable = false;
  let opencodeError: string | undefined;
  try {
    const [agentsResponse, providersResponse] = await Promise.all([openCodeJson("/agent"), openCodeJson("/config/providers")]);
    const agents = unwrap(agentsResponse) as any[];
    const providers = unwrap(providersResponse)?.providers ?? [];
    result.opencode.agents = agents.map((agent) => ({
      id: agent.name ?? agent.id,
      name: agent.name ?? agent.id,
      description: agent.description,
      mode: agent.mode,
    })).filter((agent) => Boolean(agent.id));
    result.opencode.models = providers.flatMap((provider: any) => Object.entries(provider.models ?? {}).map(([id, model]: [string, any]) => ({
      id: `${provider.id}/${model.id ?? id}`,
      name: `${model.name ?? id} · ${provider.name ?? provider.id}`,
      providerId: provider.id,
      local: /local/i.test(`${provider.name ?? ""} ${provider.id}`) || isLocalEndpoint(provider.options?.baseURL),
    })));
    opencodeAvailable = true;
  } catch (error) {
    opencodeError = error instanceof Error ? error.message : String(error);
  }

  const claudeAvailable = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  result.runtimes = [
    { id: "native", name: "Agent Tester", available: native.available, error: native.error },
    { id: "opencode", name: "OpenCode", available: opencodeAvailable, error: opencodeError },
    { id: "claude", name: "Claude Agent", available: claudeAvailable, error: claudeAvailable ? undefined : "Configura ANTHROPIC_API_KEY en el entorno del servidor." },
  ];
  return result;
}

function jsonSse(event: Record<string, unknown>) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function sseResponse(produce: (send: (event: Record<string, unknown>) => void) => Promise<void>, abortSignal?: AbortSignal) {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      const send = (event: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(jsonSse(event))); } catch { /* client disconnected */ }
      };
      void produce(send).then(() => {
        send({ type: "finish" });
        try { controller.close(); } catch { /* already cancelled */ }
      }).catch((error) => {
        send({ type: "error", errorText: error instanceof Error ? error.message : String(error) });
        try { controller.close(); } catch { /* already cancelled */ }
      });
    },
    cancel() { /* The request AbortSignal closes or cancels the active runtime. */ },
  });
  abortSignal?.addEventListener("abort", () => { try { controllerRef?.close(); } catch { /* already closed */ } }, { once: true });
  return new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}

function systemPrompt(test: { name: string; id: string; url: string; steps: Array<{ id: string; type: string; text: string; value?: string; target?: string }> } | null, baseUrl: string) {
  const steps = test?.steps.length
    ? test.steps.map((step, i) => `${i + 1}. [${step.id}] ${step.type}: ${step.text}${step.value ? ` (value: ${step.value})` : ""}${step.target ? ` (target: ${step.target})` : ""}`).join("\n")
    : "(sin pasos)";
  const context = test
    ? `Caso actual: "${test.name}" (id: ${test.id}). URL inicial: ${test.url}.\nPasos actuales:\n${steps}`
    : `No hay un caso seleccionado. Para crear uno, usa create_test con un nombre claro y la URL indicada por el usuario; si no indica una, usa ${baseUrl}. Después escribe sus pasos con set_steps.`;
  return `Ayudas a un tester a diseñar, corregir y ejecutar pruebas e2e web. Responde siempre en español y de forma breve.\nUsa las herramientas de Agent Tester para consultar, modificar y ejecutar casos; no inventes ejecuciones ni resultados. Si el usuario pide probar un flujo completo, crea o actualiza los pasos y ejecuta run_test. Si solo pide diseño o documentación, no ejecutes. No repitas la lista de pasos en tu respuesta. Tras un fallo, explica la causa brevemente, corrige y reintenta como máximo 2 veces.\n${context}`;
}

function initialTranscript(messages: Array<{ role: string; parts?: Array<{ text?: string }> }> | undefined, fallback: string) {
  if (!messages?.length) return fallback;
  return messages.map((message) => {
    const text = message.parts?.map((part) => part.text ?? "").join("\n").trim();
    return text ? `${message.role === "assistant" ? "Asistente" : "Usuario"}: ${text}` : "";
  }).filter(Boolean).join("\n\n") || fallback;
}

function openCodeBasePath() { return OPENCODE_URL; }

async function addAgentTesterMcp() {
  try {
    const configured = unwrap(await openCodeJson("/mcp"));
    if (configured?.["agent-tester-webchat"] && configured["agent-tester-webchat"].status !== "failed") return;
  } catch { /* Register below when this OpenCode server has no status response. */ }
  const mcpPath = fileURLToPath(new URL("../../mcp/src/stdio.ts", import.meta.url));
  const response = await fetch(`${openCodeBasePath()}/mcp`, {
    method: "POST",
    headers: opencodeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      name: "agent-tester-webchat",
      config: {
        type: "local", command: [process.execPath, mcpPath], cwd: SERVER_ROOT,
        environment: {
          SERVER_URL: process.env.SERVER_URL || `http://127.0.0.1:${process.env.PORT || "3000"}`,
          WEB_URL: process.env.WEB_URL || "http://localhost:5173",
        },
        enabled: true,
      },
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`No se pudo registrar el MCP de Agent Tester en OpenCode (${response.status}).`);
}

function decodeSseFrames(buffer: string) {
  const frames = buffer.split(/\r?\n\r?\n/);
  const rest = frames.pop() ?? "";
  return { rest, events: frames.map((frame) => {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return null;
    try { return JSON.parse(data) as any; } catch { return null; }
  }).filter(Boolean) };
}

function openCodeEvent(event: any) {
  return event?.payload ?? event;
}

export async function openCodeChat(input: {
  selection: AiSelection; prompt: string; messages?: Array<{ role: string; parts?: Array<{ text?: string }> }>; system: string;
}, abortSignal?: AbortSignal): Promise<Response> {
  const catalog = await getAiCatalog();
  if (!catalog.runtimes.find((runtime) => runtime.id === "opencode")?.available) throw new Error("OpenCode no está disponible. Ejecuta `opencode serve --hostname 127.0.0.1 --port 4096` o configura OPENCODE_BASE_URL.");
  const agents = catalog.opencode.agents;
  if (input.selection.agent && !agents.some((agent) => agent.id === input.selection.agent)) throw new Error("El agente seleccionado ya no está disponible en OpenCode.");
  if (input.selection.model && !catalog.opencode.models.some((model) => model.id === input.selection.model)) throw new Error("El modelo seleccionado ya no está disponible en OpenCode.");
  await addAgentTesterMcp();

  let sessionId = input.selection.sessionId;
  if (!sessionId) {
    const response = unwrap(await openCodeJson("/session", { method: "POST", body: JSON.stringify({ title: "Agent Tester · QA" }), signal: abortSignal }));
    sessionId = response.id;
  }
  if (!sessionId) throw new Error("OpenCode no devolvió un identificador de sesión.");

  const eventsResponse = await fetch(`${openCodeBasePath()}/event`, { headers: opencodeHeaders({ accept: "text/event-stream" }), signal: abortSignal });
  if (!eventsResponse.ok || !eventsResponse.body) throw new Error("No se pudo abrir el stream de eventos de OpenCode.");
  const reader = eventsResponse.body.getReader();
  const promptBody: Record<string, unknown> = {
    parts: [{ type: "text", text: input.selection.sessionId ? input.prompt : initialTranscript(input.messages, input.prompt) }], system: input.system,
  };
  if (input.selection.agent) promptBody.agent = input.selection.agent;
  if (input.selection.model) {
    const slash = input.selection.model.indexOf("/");
    promptBody.model = { providerID: input.selection.model.slice(0, slash), modelID: input.selection.model.slice(slash + 1) };
  }
  await openCodeJson(`/session/${encodeURIComponent(sessionId)}/prompt_async`, { method: "POST", body: JSON.stringify(promptBody), signal: abortSignal });

  return sseResponse(async (send) => {
    send({ type: "session-info", sessionId, runtime: "opencode" });
    let buffer = "";
    let ended = false;
    const toolCalls = new Set<string>();
    const lastText = new Map<string, string>();
    const deadline = setTimeout(() => { void reader.cancel(); }, 300_000);
    const onAbort = () => {
      void reader.cancel();
      void fetch(`${openCodeBasePath()}/session/${encodeURIComponent(sessionId!)}/abort`, { method: "POST", headers: opencodeHeaders(), signal: AbortSignal.timeout(3_000) }).catch(() => undefined);
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    try {
      while (!ended && !abortSignal?.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += new TextDecoder().decode(value, { stream: true });
        const parsed = decodeSseFrames(buffer);
        buffer = parsed.rest;
        for (const raw of parsed.events) {
          const event = openCodeEvent(raw);
          const props = event?.properties ?? {};
          const session = props.sessionID ?? props.sessionId ?? props.info?.id;
          if (session && session !== sessionId) continue;
          if (event?.type === "session.idle") { ended = true; break; }
          if (event?.type === "session.error") {
            const error = props.error?.data?.message ?? props.error?.message ?? "OpenCode terminó la sesión con error.";
            send({ type: "error", errorText: String(error) }); ended = true; break;
          }
          if (event?.type !== "message.part.updated") continue;
          const part = props.part ?? {};
          const key = part.id ?? part.callID ?? `${props.messageID ?? "message"}-${part.type}`;
          if (part.type === "text" && typeof part.text === "string") {
            const previous = lastText.get(key) ?? "";
            const delta = part.text.startsWith(previous) ? part.text.slice(previous.length) : part.text;
            lastText.set(key, part.text);
            if (delta) send({ type: "text-delta", delta });
          }
          if (part.type === "tool") {
            const callId = String(part.callID ?? part.id ?? key);
            const state = part.state ?? {};
            if (state.input && !toolCalls.has(callId)) {
              toolCalls.add(callId);
              send({ type: "tool-input-available", toolCallId: callId, toolName: part.tool ?? "MCP", input: state.input });
            }
            if (state.status === "completed") send({ type: "tool-output-available", toolCallId: callId, output: state.output });
            if (state.status === "error") send({ type: "tool-output-error", toolCallId: callId, errorText: String(state.error ?? "Falló la herramienta") });
          }
        }
      }
      if (!ended && !abortSignal?.aborted) send({ type: "error", errorText: "La conexión de eventos de OpenCode terminó antes de completar la respuesta." });
    } finally {
      clearTimeout(deadline);
      abortSignal?.removeEventListener("abort", onAbort);
      reader.releaseLock();
    }
  }, abortSignal);
}

export async function claudeChat(input: {
  selection: AiSelection; prompt: string; system: string; messages?: Array<{ role: string; parts?: Array<{ text?: string }> }>;
}, abortSignal?: AbortSignal): Promise<Response> {
  const catalog = await getAiCatalog();
  if (!catalog.runtimes.find((runtime) => runtime.id === "claude")?.available) throw new Error("Claude Agent requiere ANTHROPIC_API_KEY configurada en el servidor.");
  const validAgent = catalog.claude.agents.some((agent) => agent.id === input.selection.agent);
  if (input.selection.agent && !validAgent) throw new Error("El agente de Claude seleccionado no está disponible.");
  if (input.selection.model && !catalog.claude.models.some((model) => model.id === input.selection.model)) throw new Error("El modelo de Claude seleccionado no está disponible; configura CLAUDE_MODEL si usas un ID personalizado.");
  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  abortSignal?.addEventListener("abort", onAbort, { once: true });
  const options: Record<string, unknown> = {
    cwd: SERVER_ROOT,
    settingSources: ["user", "project", "local"],
    env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: undefined },
    systemPrompt: { type: "preset", preset: "claude_code", append: input.system },
    permissionMode: "default",
    maxTurns: 20,
    includePartialMessages: true,
    abortController,
    canUseTool: async (toolName: string, toolInput: Record<string, unknown>, permission: { mcpServer?: { name: string } }) => {
      if (permission.mcpServer?.name === "agent-tester") return { behavior: "allow" as const, updatedInput: toolInput };
      return { behavior: "deny" as const, message: `Agent Tester no puede aprobar automáticamente la herramienta ${toolName}.` };
    },
  };
  if (input.selection.agent && input.selection.agent !== "default") options.agent = input.selection.agent;
  if (input.selection.model) options.model = input.selection.model;
  if (input.selection.sessionId) options.resume = input.selection.sessionId;

  const prompt = input.selection.sessionId ? input.prompt : initialTranscript(input.messages, input.prompt);
  const query = claudeQuery({ prompt, options: options as Parameters<typeof claudeQuery>[0]["options"] });
  return sseResponse(async (send) => {
    let sessionId: string | undefined;
    send({ type: "runtime-info", runtime: "claude" });
    try {
      for await (const rawMessage of query) {
        const message = rawMessage as any;
        if (message.type === "system" && message.subtype === "init") {
          sessionId = message.session_id;
          if (sessionId) send({ type: "session-info", sessionId, runtime: "claude" });
        }
        if (message.type === "stream_event") {
          const delta = message.event?.delta;
          if (delta?.type === "text_delta" && typeof delta.text === "string") send({ type: "text-delta", delta: delta.text });
        }
        if (message.type === "assistant") {
          const content = message.message?.content ?? [];
          for (const block of content) if (block.type === "tool_use") {
            const toolName = String(block.name ?? "tool");
            const isMcp = toolName.startsWith("mcp__agent-tester");
            if (!isMcp) continue;
            send({ type: "tool-input-available", toolCallId: block.id, toolName: toolName.split("__").at(-1), input: block.input });
          }
        }
        if (message.type === "user") {
          const content = message.message?.content ?? [];
          for (const block of content) if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
            if (block.is_error) send({ type: "tool-output-error", toolCallId: block.tool_use_id, errorText: String(block.content ?? "Falló la herramienta") });
            else send({ type: "tool-output-available", toolCallId: block.tool_use_id, output: block.content });
          }
        }
        if (message.type === "result" && message.subtype !== "success") {
          send({ type: "error", errorText: message.result ?? `Claude terminó con estado ${message.subtype}.` });
        }
      }
    } finally {
      abortSignal?.removeEventListener("abort", onAbort);
      query.close();
    }
  }, abortSignal);
}
