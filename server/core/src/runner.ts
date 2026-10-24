import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { compile, stepLines } from "./compile";
import { DATA_DIR, iso, newId, sql } from "./db";
import { NotFound } from "./errors";
import { publish } from "./events";
import type { Run, RunStatus, RunSummary, StepResult, StepStatus, Test } from "./schema";
import { getTest } from "./tests";

const RUNNER_DIR = resolve(import.meta.dir, "../../runner");
const E2E_BIN = join(RUNNER_DIR, "node_modules/.bin/e2e");
const RUN_TIMEOUT_MS = 5 * 60_000;

type RunRow = {
  id: string; test_id: string; status: RunStatus; started_at: Date | string | null; finished_at: Date | string | null;
  created_at: Date | string; step_results: StepResult[] | string; summary: RunSummary | string | null;
  test_snapshot: { name: string; url: string; steps: Test["steps"]; metadata: Test["metadata"] } | string;
};
const parseJson = <T>(value: T | string): T => typeof value === "string" ? JSON.parse(value) as T : value;
const toRun = (row: RunRow): Run => ({
  id: row.id, testId: row.test_id, status: row.status, startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
  createdAt: iso(row.created_at)!, stepResults: parseJson(row.step_results), testSnapshot: parseJson(row.test_snapshot),
});

export async function getRun(runId: string): Promise<Run & { summary: RunSummary | null }> {
  const [row] = await sql`SELECT * FROM runs WHERE id = ${runId}`;
  if (!row) throw new NotFound(`Run ${runId} not found`);
  return { ...toRun(row as RunRow), summary: row.summary ? parseJson(row.summary) : null };
}

export async function listRuns(testId?: string): Promise<Array<Run & { summary: RunSummary | null }>> {
  const rows = testId
    ? await sql`SELECT * FROM runs WHERE test_id = ${testId} ORDER BY created_at DESC`
    : await sql`SELECT * FROM runs ORDER BY created_at DESC`;
  return rows.map((row) => ({ ...toRun(row as RunRow), summary: row.summary ? parseJson(row.summary) : null }));
}

let queue: Promise<unknown> = Promise.resolve();
const active = new Map<string, { runId: string; done: Promise<RunSummary> }>();

export async function startRun(testId: string): Promise<{ runId: string; done: Promise<RunSummary> }> {
  const existing = active.get(testId);
  if (existing) return existing;
  const test = await getTest(testId);
  const raced = active.get(testId);
  if (raced) return raced;

  const runId = newId("r");
  const pending: StepResult[] = test.steps.map((step) => ({ stepId: step.id, text: step.text, status: "pending" }));
  const snapshot = { name: test.name, url: test.url, steps: test.steps, metadata: test.metadata };
  const inserted = sql`INSERT INTO runs (id, test_id, status, step_results, test_snapshot)
    VALUES (${runId}, ${testId}, 'queued', ${JSON.stringify(pending)}::jsonb, ${JSON.stringify(snapshot)}::jsonb)`;
  const done = (queue = queue.catch(() => undefined).then(async () => { await inserted; return execute(test, runId); })
    .finally(() => active.delete(testId))) as Promise<RunSummary>;
  done.catch((error) => console.error(`Run ${runId} crashed`, error));
  const entry = { runId, done };
  active.set(testId, entry);
  await inserted;
  return entry;
}

async function execute(test: Test, runId: string): Promise<RunSummary> {
  const [started] = await sql`UPDATE runs SET status = 'running', started_at = now() WHERE id = ${runId} RETURNING *`;
  publish(test.id, { type: "run-started", run: toRun(started as RunRow) });
  const script = compile(test);
  mkdirSync(join(RUNNER_DIR, "tests"), { recursive: true });
  writeFileSync(join(RUNNER_DIR, "tests", `${test.id}.e2e.ts`), script);
  const output = `.runs/${runId}`;
  let stderr = "";
  try {
    const proc = Bun.spawn(
      [E2E_BIN, "run", `tests/${test.id}.e2e.ts`, "--reporter", "json", "--output", output, "--cache-dir", `.cache/${test.id}`, ...(process.env.HEADED === "1" ? ["--headed"] : [])],
      { cwd: RUNNER_DIR, env: { ...process.env, E2E_TELEMETRY_DISABLED: "1", APP_URL: test.url, CI: "" }, stdout: "ignore", stderr: "pipe", timeout: RUN_TIMEOUT_MS },
    );
    stderr = await new Response(proc.stderr).text();
    await proc.exited;
  } catch (error) { stderr += String(error); }

  let report: ReturnType<typeof readReport>;
  try { report = readReport(test, script, join(RUNNER_DIR, output), runId, stderr); }
  catch (error) { report = { status: "error", stepResults: test.steps.map((step) => ({ stepId: step.id, text: step.text, status: "skipped" })), error: String(error) }; }
  const { status, stepResults, error } = report;
  const failed = stepResults.find((result) => result.status === "failed");
  const failedStep = failed ? test.steps.find((step) => step.id === failed.stepId)! : null;
  const summary: RunSummary = {
    runId, status, passed: status === "passed", failedStep: failedStep ? { id: failedStep.id, text: failedStep.text } : null,
    error: error ? error.slice(0, 500) : null, screenshotUrl: failed?.screenshotPath ?? null,
  };
  await sql`UPDATE runs SET status = ${status}, finished_at = now(), step_results = ${JSON.stringify(stepResults)}::jsonb,
    summary = ${JSON.stringify(summary)}::jsonb WHERE id = ${runId}`;
  rmSync(join(RUNNER_DIR, output), { recursive: true, force: true });
  publish(test.id, { type: "run-finished", run: await getRun(runId), status });
  return summary;
}

type ReportStep = { status: string; source?: { line: number }; error?: { message?: string } };
type Attempt = { status: string; error?: { message?: string }; artifacts?: { kind: string; path: string }[]; steps: ReportStep[] };

function readReport(test: Test, script: string, outputDir: string, runId: string, stderr: string) {
  const fail = (error: string) => ({ status: "error" as RunStatus, stepResults: test.steps.map((step): StepResult => ({ stepId: step.id, text: step.text, status: "skipped" })), error });
  const reportPath = join(outputDir, "report.json");
  if (!existsSync(reportPath)) return fail(stderr.trim().split("\n").slice(-5).join("\n") || "e2e produced no report");
  const run = JSON.parse(readFileSync(reportPath, "utf8")).run;
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
  return { status, stepResults, error: attempt.error?.message ?? null };
}
