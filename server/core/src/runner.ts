import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { compile, stepLines } from "./compile";
import { compileLaya } from "./compile-laya";
import { DATA_DIR, iso, newId, sql } from "./db";
import { NotFound } from "./errors";
import { publish } from "./events";
import { executeLaya } from "./laya-runner";
import type { ExecutionEngine, Run, RunStatus, RunSummary, StepResult, StepStatus, Test } from "./schema";
import { getTest } from "./tests";

const RUNNER_DIR = resolve(import.meta.dir, "../../runner");
const E2E_BIN = join(RUNNER_DIR, "node_modules/.bin/e2e");
const RUN_TIMEOUT_MS = 5 * 60_000;

type RunRow = {
  id: string; test_id: string; status: RunStatus; started_at: Date | string | null; finished_at: Date | string | null;
  created_at: Date | string; step_results: StepResult[] | string; summary: RunSummary | string | null;
  test_snapshot: { name: string; url: string; steps: Test["steps"]; metadata: Test["metadata"] } | string;
  ai_snapshot?: { provider?: string; model?: string; local?: boolean } | string | null;
  engine?: ExecutionEngine;
  code_snapshot?: string | null;
};
const parseJson = <T>(value: T | string): T => typeof value === "string" ? JSON.parse(value) as T : value;
const parseSummary = (value: RunSummary | string | null): RunSummary | null => {
  if (!value) return null;
  const summary = parseJson(value);
  return { ...summary, videos: summary.videos ?? [] };
};
const toRun = (row: RunRow): Run => {
  const rawAiSnapshot = row.ai_snapshot ? parseJson(row.ai_snapshot) : undefined;
  const aiSnapshot = typeof rawAiSnapshot?.provider === "string" && typeof rawAiSnapshot?.model === "string"
    ? { provider: rawAiSnapshot.provider, model: rawAiSnapshot.model, local: Boolean(rawAiSnapshot.local) }
    : undefined;
  return {
    id: row.id, testId: row.test_id, engine: row.engine ?? "e2e", status: row.status, startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
    createdAt: iso(row.created_at)!, stepResults: parseJson(row.step_results), testSnapshot: parseJson(row.test_snapshot), aiSnapshot,
    codeSnapshot: row.code_snapshot ?? undefined,
  };
};

export async function getRun(runId: string): Promise<Run & { summary: RunSummary | null }> {
  const [row] = await sql`SELECT * FROM runs WHERE id = ${runId}`;
  if (!row) throw new NotFound(`Run ${runId} not found`);
  return { ...toRun(row as RunRow), summary: parseSummary(row.summary) };
}

export async function listRuns(testId?: string): Promise<Array<Run & { summary: RunSummary | null }>> {
  const rows = testId
    ? await sql`SELECT * FROM runs WHERE test_id = ${testId} ORDER BY created_at DESC`
    : await sql`SELECT * FROM runs ORDER BY created_at DESC`;
  return rows.map((row: any) => ({ ...toRun(row as RunRow), summary: parseSummary(row.summary) }));
}

function configuredAiSnapshot() {
  const endpoint = process.env.E2E_BASE_URL?.trim() || "";
  let local = false;
  try { local = ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(new URL(endpoint).hostname); } catch { /* no custom endpoint */ }
  return {
    provider: endpoint ? "OpenAI-compatible" : "OpenRouter",
    model: (process.env.E2E_MODEL?.trim() || "inception/mercury-2.5").replace(/^openrouter\//, ""),
    local,
  };
}

let queue: Promise<unknown> = Promise.resolve();
const active = new Map<string, { runId: string; done: Promise<RunSummary> }>();

export async function startRun(testId: string, engine: ExecutionEngine = "e2e", code?: string): Promise<{ runId: string; done: Promise<RunSummary> }> {
  const activeKey = `${testId}:${engine}`;
  const existing = active.get(activeKey);
  if (existing) return existing;
  const test = await getTest(testId);
  const raced = active.get(activeKey);
  if (raced) return raced;

  const runId = newId("r");
  const codeSnapshot = engine === "laya" ? code ?? compileLaya(test) : null;
  const pending: StepResult[] = test.steps.map((step) => ({ stepId: step.id, text: step.text, status: "pending" }));
  const snapshot = { name: test.name, url: test.url, steps: test.steps, metadata: test.metadata };
  const aiSnapshot = engine === "laya" ? configuredLayaSnapshot() : configuredAiSnapshot();
  const inserted = sql`INSERT INTO runs (id, test_id, engine, code_snapshot, status, step_results, test_snapshot, ai_snapshot)
    VALUES (${runId}, ${testId}, ${engine}, ${codeSnapshot}, 'queued', ${JSON.stringify(pending)}::jsonb, ${JSON.stringify(snapshot)}::jsonb, ${JSON.stringify(aiSnapshot)}::jsonb)`;
  const done = (queue = queue.catch(() => undefined).then(async () => { await inserted; return execute(test, runId, engine, codeSnapshot); })
    .finally(() => active.delete(activeKey))) as Promise<RunSummary>;
  done.catch((error) => console.error(`Run ${runId} crashed`, error));
  const entry = { runId, done };
  active.set(activeKey, entry);
  await inserted;
  return entry;
}

function configuredLayaSnapshot() {
  let config: Record<string, string> = {};
  try {
    const parsed = JSON.parse(process.env.LAYA_MCP_ENV ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) config = parsed;
  } catch { /* The execution adapter returns the actionable invalid-configuration error. */ }
  const backend = config.JEV_BACKEND ?? process.env.JEV_BACKEND ?? "jev";
  const typesafe = config.TYPESAFE_API_KEY ?? process.env.TYPESAFE_API_KEY;
  const openrouter = config.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY;
  const provider = backend === "laya" ? "Laya Browser · local" : `Laya Browser · ${typesafe ? "TypeSafe" : openrouter ? "OpenRouter" : "Jev"}`;
  return {
    provider,
    model: backend === "laya"
      ? config.JEV_MODEL ?? process.env.JEV_MODEL ?? "cklxx/laya-browser"
      : typesafe ? config.JEV_MODEL ?? process.env.JEV_MODEL ?? "jev-latest" : "~typesafe/jev-latest",
    local: backend === "laya",
  };
}

async function execute(test: Test, runId: string, engine: ExecutionEngine, codeSnapshot: string | null): Promise<RunSummary> {
  const [started] = await sql`UPDATE runs SET status = 'running', started_at = now() WHERE id = ${runId} RETURNING *`;
  publish(test.id, { type: "run-started", run: toRun(started as RunRow) });
  if (engine === "laya") {
    let execution: Awaited<ReturnType<typeof executeLaya>>;
    try { execution = await executeLaya(test, runId, codeSnapshot ?? compileLaya(test)); }
    catch (cause) {
      execution = {
        status: "error",
        stepResults: test.steps.map(step => ({ stepId: step.id, text: step.text, status: "skipped" })),
        error: cause instanceof Error ? cause.message : String(cause),
        videos: [],
        aiSnapshot: configuredLayaSnapshot(),
      };
    }
    const failed = execution.stepResults.find((result) => result.status === "failed");
    const failedStep = failed ? test.steps.find((step) => step.id === failed.stepId)! : null;
    const summary: RunSummary = {
      runId, status: execution.status, passed: execution.status === "passed", failedStep: failedStep ? { id: failedStep.id, text: failedStep.text } : null,
      error: execution.error ? execution.error.slice(0, 500) : null, screenshotUrl: null, videos: execution.videos,
    };
    await sql`UPDATE runs SET status = ${execution.status}, finished_at = now(), step_results = ${JSON.stringify(execution.stepResults)}::jsonb,
      summary = ${JSON.stringify(summary)}::jsonb, ai_snapshot = ${JSON.stringify(execution.aiSnapshot)}::jsonb WHERE id = ${runId}`;
    publish(test.id, { type: "run-finished", run: await getRun(runId), status: execution.status });
    return summary;
  }
  const script = compile(test);
  mkdirSync(join(RUNNER_DIR, "tests"), { recursive: true });
  writeFileSync(join(RUNNER_DIR, "tests", `${test.id}.e2e.ts`), script);
  const output = `.runs/${runId}`;
  let stderr = "";
  let stdout = "";
  let exitCode: number | null = null;
  try {
    const proc = Bun.spawn(
      [E2E_BIN, "run", `tests/${test.id}.e2e.ts`, "--reporter", "json", "--output", output, "--cache-dir", `.cache/${test.id}`, ...(process.env.HEADED === "1" ? ["--headed"] : [])],
      // Target configuration disallows fragments; app.open in the generated script retains the full URL.
      { cwd: RUNNER_DIR, env: { ...process.env, E2E_TELEMETRY_DISABLED: "1", APP_URL: test.url.split("#")[0], CI: "" }, stdout: "pipe", stderr: "pipe", timeout: RUN_TIMEOUT_MS },
    );
    [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  } catch (error) { stderr += String(error); }

  let report: ReturnType<typeof readReport>;
  try { report = readReport(test, script, join(RUNNER_DIR, output), runId, stderr, stdout, exitCode); }
  catch (error) { report = { status: "error", stepResults: test.steps.map((step) => ({ stepId: step.id, text: step.text, status: "skipped" })), error: String(error), videos: [] }; }
  const { status, stepResults, error, videos } = report;
  const failed = stepResults.find((result) => result.status === "failed");
  const failedStep = failed ? test.steps.find((step) => step.id === failed.stepId)! : null;
  const summary: RunSummary = {
    runId, status, passed: status === "passed", failedStep: failedStep ? { id: failedStep.id, text: failedStep.text } : null,
    error: error ? error.slice(0, 500) : null, screenshotUrl: failed?.screenshotPath ?? null, videos,
  };
  await sql`UPDATE runs SET status = ${status}, finished_at = now(), step_results = ${JSON.stringify(stepResults)}::jsonb,
    summary = ${JSON.stringify(summary)}::jsonb WHERE id = ${runId}`;
  rmSync(join(RUNNER_DIR, output), { recursive: true, force: true });
  publish(test.id, { type: "run-finished", run: await getRun(runId), status });
  return summary;
}

type ReportStep = { status: string; source?: { line: number }; error?: { message?: string } };
type ReportArtifact = { kind: string; path: string; mediaType?: string; size?: number; sha256?: string; startedAt?: string };
type Attempt = { status: string; error?: { message?: string }; artifacts?: ReportArtifact[]; steps: ReportStep[] };

function readReport(test: Test, script: string, outputDir: string, runId: string, stderr: string, stdout: string, exitCode: number | null) {
  const fail = (error: string) => ({ status: "error" as RunStatus, stepResults: test.steps.map((step): StepResult => ({ stepId: step.id, text: step.text, status: "skipped" })), error, videos: [] });
  const reportPath = join(outputDir, "report.json");
  // The JSON reporter also emits its report to stdout, including failed assertions.
  // Never discard it: some CLI exits do not leave report.json on disk.
  const content = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : stdout.trim();
  if (!content) return fail(`El runner terminó sin informe (código ${exitCode ?? "desconocido"}). ${stderr.trim().slice(-1500) || "No emitió diagnóstico; puede haber sido interrumpido."}`);
  let run: any;
  try { run = JSON.parse(content).run; }
  catch { return fail(`Informe inválido del runner (código ${exitCode}). ${(stderr || stdout).trim().slice(-1500)}`); }
  const result = run.results.find((item: any) => item.selected);
  const attempt: Attempt | undefined = result?.attempts?.at(-1);
  if (!attempt) return fail(run.errors?.[0]?.message ?? "e2e ran no test");

  let screenshotUrl: string | undefined;
  const shot = attempt.artifacts?.filter((artifact) => artifact.kind === "screenshot").at(-1);
  if (shot) {
    const dir = join(DATA_DIR, "runs", runId);
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(outputDir, "results", shot.path), join(dir, "failure.png"));
    screenshotUrl = `/artifacts/${runId}/failure.png`;
  }
  const videos = (attempt.artifacts ?? []).filter((artifact) => artifact.kind === "video").flatMap((artifact) => {
    const resultsDir = resolve(outputDir, "results");
    const source = resolve(resultsDir, artifact.path);
    const sourceRelative = relative(resultsDir, source);
    if (!sourceRelative || sourceRelative.startsWith(`..${sep}`) || sourceRelative === ".." || isAbsolute(sourceRelative) || !existsSync(source)) return [];

    const runDir = resolve(DATA_DIR, "runs", runId);
    const destination = resolve(runDir, sourceRelative);
    const destinationRelative = relative(runDir, destination);
    if (destinationRelative.startsWith(`..${sep}`) || destinationRelative === ".." || isAbsolute(destinationRelative)) return [];
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    const urlPath = sourceRelative.split(sep).map(encodeURIComponent).join("/");
    return [{
      url: `/artifacts/${encodeURIComponent(runId)}/${urlPath}`,
      mediaType: artifact.mediaType || "video/webm",
      ...(typeof artifact.size === "number" ? { size: artifact.size } : {}),
      ...(artifact.sha256 ? { sha256: artifact.sha256 } : {}),
      ...(artifact.startedAt ? { startedAt: artifact.startedAt } : {}),
    }];
  });
  const lines = stepLines(script);
  const byStep = new Map<string, ReportStep[]>();
  for (const step of attempt.steps) {
    const stepId = step.source && lines.get(step.source.line);
    if (stepId) byStep.set(stepId, [...(byStep.get(stepId) ?? []), step]);
  }
  const stepResults = test.steps.map((step): StepResult => {
    const reported = byStep.get(step.id);
    if (!reported?.length) return { stepId: step.id, text: step.text, status: "skipped" };
    const failed = reported.find((item) => item.status !== "passed");
    if (!failed) return { stepId: step.id, text: step.text, status: "passed" };
    return { stepId: step.id, text: step.text, status: "failed" as StepStatus, error: failed.error?.message?.slice(0, 500), screenshotPath: screenshotUrl };
  });
  const status: RunStatus = run.status === "passed" ? "passed" : run.status === "failed" ? "failed" : "error";
  return { status, stepResults, error: attempt.error?.message ?? null, videos };
}
