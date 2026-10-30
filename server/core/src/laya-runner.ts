import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import { DATA_DIR } from "./db";
import type { RunStatus, StepResult, Test, VideoEvidence } from "./schema";

type LayaResult = {
  status: RunStatus;
  stepResults: StepResult[];
  error: string | null;
  videos: VideoEvidence[];
  aiSnapshot: { provider: string; model: string; local: boolean };
};

type McpToolResult = {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  [key: string]: unknown;
};

function jsonEnv(name: string, fallback: unknown): any {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { throw new Error(`${name} must contain valid JSON`); }
}

function childEnv() {
  const allowed = new Set(["PATH", "HOME", "USERPROFILE", "SystemRoot", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA"]);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && (allowed.has(key) || key.startsWith("JEV_") || ["TYPESAFE_API_KEY", "OPENROUTER_API_KEY"].includes(key))) env[key] = value;
  }
  const overrides = jsonEnv("LAYA_MCP_ENV", {});
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides) || Object.values(overrides).some(value => typeof value !== "string")) {
    throw new Error("LAYA_MCP_ENV must be a JSON object of string values");
  }
  return { ...env, ...overrides };
}

function parseToolContent(response: McpToolResult): any {
  if (response.isError) {
    const detail = response.content?.filter(item => item.type === "text").map(item => item.text).join("\n");
    throw new Error(detail || "Laya Browser MCP tool failed");
  }
  if (response.structuredContent && typeof response.structuredContent === "object") return response.structuredContent;
  const text = response.content?.filter(item => item.type === "text").map(item => item.text ?? "").join("\n").trim();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new Error(`Laya Browser MCP returned non-JSON content: ${text.slice(0, 400)}`); }
}

function stepResultsFrom(value: any, test: Test): StepResult[] | null {
  const rows = Array.isArray(value?.stepResults) ? value.stepResults : Array.isArray(value?.step_results) ? value.step_results : null;
  if (!rows) return null;
  const byId = new Map<string, any>(rows.filter((row: any) => row && typeof row.stepId === "string").map((row: any) => [row.stepId, row]));
  return test.steps.map((step, index) => {
    const row = byId.get(step.id) ?? rows[index];
    const status = row?.status;
    return {
      stepId: step.id,
      text: step.text,
      status: status === "passed" || status === "failed" || status === "skipped" || status === "running" || status === "pending" ? status : "skipped",
      ...(typeof row?.error === "string" ? { error: row.error.slice(0, 500) } : {}),
    };
  });
}

function saveVideos(value: any, runId: string): VideoEvidence[] {
  const recording = value?.recording ?? value?.videos ?? value;
  const rows = Array.isArray(recording?.videos) ? recording.videos : [];
  const runDir = resolve(DATA_DIR, "runs", runId);
  const results: VideoEvidence[] = [];
  for (const video of rows) {
    if (video?.status !== "completed" || typeof video.path !== "string") continue;
    const source = resolve(video.path);
    if (!existsSync(source)) continue;
    const filename = basename(source);
    mkdirSync(runDir, { recursive: true });
    const destination = resolve(runDir, filename);
    if (!destination.startsWith(`${runDir}${sep}`)) continue;
    copyFileSync(source, destination);
    results.push({ url: `/artifacts/${encodeURIComponent(runId)}/${encodeURIComponent(filename)}`, mediaType: "video/webm", ...(typeof video.bytes === "number" ? { size: video.bytes } : {}) });
  }
  return results;
}

function normalize(value: any, test: Test, runId: string, mcpEnv: Record<string, string>): LayaResult {
  const result = value?.result && typeof value.result === "object" ? value.result : value;
  let stepResults = stepResultsFrom(result, test);
  let status: RunStatus = "error";
  let error: string | null = typeof result?.error === "string" ? result.error : null;

  if (stepResults) {
    const allPassed = stepResults.length === test.steps.length && stepResults.every(step => step.status === "passed");
    const attempted = stepResults.some(step => step.status === "passed" || step.status === "failed");
    const hasFailedStep = stepResults.some(step => step.status === "failed");
    status = result?.passed === true && allPassed ? "passed" : hasFailedStep || (attempted && result?.passed === false && !allPassed) ? "failed" : "error";
    if (!error && status !== "passed") error = "El programa Code Mode no confirmó como aprobados todos los pasos.";
  } else {
    const suspended = value?.suspended?.result ?? value?.suspended ?? value;
    const failedStep = Number(suspended?.failed_step);
    stepResults = test.steps.map((step, index) => ({
      stepId: step.id,
      text: step.text,
      status: Number.isInteger(failedStep) && failedStep === index + 1 ? "failed" : "skipped",
      ...(Number.isInteger(failedStep) && failedStep === index + 1 ? { error: String(suspended?.info ?? suspended?.error?.message ?? "Code Mode se detuvo en este paso").slice(0, 500) } : {}),
    }));
    if (suspended?.phase === "verification" || Array.isArray(suspended?.verification_failures)) status = "failed";
    error ??= String(suspended?.info ?? suspended?.error?.message ?? value?.info ?? value?.error?.message ?? `Code Mode terminó con estado ${String(value?.status ?? "desconocido")}`);
  }

  const backend = String(value?.backend ?? result?.backend ?? mcpEnv.JEV_BACKEND ?? "jev");
  const typesafe = Boolean(mcpEnv.TYPESAFE_API_KEY);
  const openrouter = Boolean(mcpEnv.OPENROUTER_API_KEY);
  const endpoint = String(value?.decision_endpoint ?? result?.decision_endpoint ?? "");
  const provider = backend === "laya" ? "Laya Browser · local" : `Laya Browser · ${endpoint.includes("typesafe.ai") || (!endpoint && typesafe) ? "TypeSafe" : endpoint.includes("openrouter.ai") || (!endpoint && openrouter) ? "OpenRouter" : "Jev"}`;
  const model = String(value?.decision_model ?? result?.decision_model ?? (backend === "laya"
    ? mcpEnv.JEV_MODEL ?? "cklxx/laya-browser"
    : typesafe ? mcpEnv.JEV_MODEL ?? "jev-latest" : "~typesafe/jev-latest"));
  return {
    status,
    stepResults,
    error: error?.slice(0, 2000) ?? null,
    videos: saveVideos({ ...value, ...result, recording: result?.recording ?? value?.recording }, runId),
    aiSnapshot: { provider, model, local: backend === "laya" },
  };
}

export async function executeLaya(test: Test, runId: string, code: string): Promise<LayaResult> {
  const command = process.env.LAYA_MCP_COMMAND?.trim();
  if (!command) throw new Error("Configura LAYA_MCP_COMMAND y LAYA_MCP_ARGS para conectar el servidor MCP de laya-browser.");
  const args = jsonEnv("LAYA_MCP_ARGS", []);
  if (!Array.isArray(args) || args.some(argument => typeof argument !== "string")) throw new Error("LAYA_MCP_ARGS must be a JSON array of strings");
  const cwd = process.env.LAYA_MCP_CWD?.trim() || undefined;
  const client = new Client({ name: "agent-tester-laya", version: "0.1.0" });
  const mcpEnv = childEnv();
  const transport = new StdioClientTransport({ command, args, ...(cwd ? { cwd } : {}), env: mcpEnv });
  let sessionId: string | undefined;
  let value: any;
  try {
    await client.connect(transport);
    const created = parseToolContent(await client.callTool({ name: "browser_create_session", arguments: {} }) as McpToolResult);
    sessionId = created.session_id;
    if (typeof sessionId !== "string" || !sessionId) throw new Error("Laya Browser no devolvió un session_id válido.");

    try {
      const mcpResponse = await client.callTool({
        name: "browser_execute",
        arguments: {
          session_id: sessionId,
          code,
          values: { url: test.url, steps: test.steps },
          timeout_ms: 300_000,
          max_operations: 100,
          max_decision_calls: 300,
          max_browser_actions: 1_000,
          max_output_chars: 200_000,
          authorized_goals: test.steps.filter(step => step.type === "act").map(step => step.text),
        },
      }, undefined, { timeout: 330_000 });
      value = parseToolContent(mcpResponse as McpToolResult);
    } catch (cause) {
      value = { status: "error", info: cause instanceof Error ? cause.message : String(cause) };
    }
    if (!value || typeof value !== "object") value = { status: "error", info: "Laya Browser devolvió un resultado vacío o inválido." };

    // Code Mode suspends outside the submitted program on unsuccessful operations; explicitly
    // finalize the segment before the run is reported, without dropping the session context.
    if (value?.status !== "done") {
      try {
        const stopResponse = await client.callTool({ name: "browser_execute", arguments: { session_id: sessionId, code: "return await browser.stopRecording({});" } }, undefined, { timeout: 30_000 });
        const stopped = parseToolContent(stopResponse as McpToolResult);
        if (stopped && typeof stopped === "object") value.recording = stopped.result ?? stopped;
      } catch { /* Preserve the original browser failure. */ }
    }
    const normalized = normalize(value, test, runId, mcpEnv);
    if (normalized.status !== "passed" && normalized.status !== "failed" && !normalized.error) normalized.error = `Laya Code Mode status: ${String(value?.status ?? "unknown")}`;
    return normalized;
  } finally {
    if (sessionId) {
      try { await client.callTool({ name: "browser_close", arguments: { session_id: sessionId } }); }
      catch { /* Closing the MCP client below also ends its browser process if needed. */ }
    }
    await client.close().catch(() => undefined);
  }
}
