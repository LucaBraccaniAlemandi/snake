import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { compile, stepLines } from "./compile";
import { DATA_DIR, db, newId } from "./db";
import { publish } from "./events";
import type { Run, RunStatus, RunSummary, StepResult, StepStatus, Test } from "./schema";
import { NotFound, getTest } from "./tests";

const RUNNER_DIR = resolve(import.meta.dir, "../../runner");
const E2E_BIN = join(RUNNER_DIR, "node_modules/.bin/e2e");
const RUN_TIMEOUT_MS = 5 * 60_000;

type RunRow = {
  id: string; test_id: string; status: RunStatus; started_at: string | null; finished_at: string | null;
  step_results: string; summary: string | null;
};

const toRun = (r: RunRow): Run => ({
  id: r.id, testId: r.test_id, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at,
  stepResults: JSON.parse(r.step_results),
});

export function getRun(runId: string): Run & { summary: RunSummary | null } {
  const row = db.query("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow | null;
  if (!row) throw new NotFound(`Run ${runId} not found`);
  return { ...toRun(row), summary: row.summary ? JSON.parse(row.summary) : null };
}

// One Run at a time; a Test that is already queued or running gets its existing Run back.
let queue: Promise<unknown> = Promise.resolve();
const active = new Map<string, { runId: string; done: Promise<RunSummary> }>();

export function startRun(testId: string): { runId: string; done: Promise<RunSummary> } {
  const existing = active.get(testId);
  if (existing) return existing;

  const test = getTest(testId); // snapshot: later edits don't affect this Run
  const runId = newId("r");
  const pending: StepResult[] = test.steps.map((s) => ({ stepId: s.id, status: "pending" }));
  db.query("INSERT INTO runs (id, test_id, status, step_results, created_at) VALUES (?, ?, 'queued', ?, ?)")
    .run(runId, testId, JSON.stringify(pending), new Date().toISOString());

  const done = (queue = queue.then(() => execute(test, runId)).finally(() => active.delete(testId))) as Promise<RunSummary>;
  done.catch((err) => console.error(`Run ${runId} crashed`, err));
  const entry = { runId, done };
  active.set(testId, entry);
  return entry;
}

async function execute(test: Test, runId: string): Promise<RunSummary> {
  const startedAt = new Date().toISOString();
  db.query("UPDATE runs SET status = 'running', started_at = ? WHERE id = ?").run(startedAt, runId);
  publish(test.id, { type: "run-started", run: toRun(db.query("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow) });

  const script = compile(test);
  writeFileSync(join(RUNNER_DIR, "tests", `${test.id}.e2e.ts`), script);
  const output = `.runs/${runId}`;

  let stderr = "";
  try {
    const proc = Bun.spawn(
      [E2E_BIN, "run", `tests/${test.id}.e2e.ts`, "--reporter", "json", "--output", output, "--cache-dir", `.cache/${test.id}`],
      {
        cwd: RUNNER_DIR,
        env: { ...process.env, E2E_TELEMETRY_DISABLED: "1", APP_URL: test.url, CI: "" },
        stdout: "ignore",
        stderr: "pipe",
        timeout: RUN_TIMEOUT_MS,
      },
    );
    stderr = await new Response(proc.stderr).text();
    await proc.exited;
  } catch (err) {
    stderr += String(err);
  }

  const { status, stepResults, error } = readReport(test, script, join(RUNNER_DIR, output), runId, stderr);
  const failed = stepResults.find((r) => r.status === "failed");
  const failedStep = failed ? test.steps.find((s) => s.id === failed.stepId)! : null;
  const summary: RunSummary = {
    runId,
    status,
    passed: status === "passed",
    failedStep: failedStep ? { id: failedStep.id, text: failedStep.text } : null,
    error: error ? error.slice(0, 500) : null,
    screenshotUrl: failed?.screenshotPath ?? null,
  };

  db.query("UPDATE runs SET status = ?, finished_at = ?, step_results = ?, summary = ? WHERE id = ?")
    .run(status, new Date().toISOString(), JSON.stringify(stepResults), JSON.stringify(summary), runId);
  rmSync(join(RUNNER_DIR, output), { recursive: true, force: true });
  publish(test.id, { type: "run-finished", run: getRun(runId), status });
  return summary;
}

type ReportStep = { status: string; source?: { line: number }; error?: { message?: string } };
type Attempt = { status: string; error?: { message?: string }; artifacts?: { kind: string; path: string }[]; steps: ReportStep[] };

function readReport(test: Test, script: string, outputDir: string, runId: string, stderr: string) {
  const fail = (error: string) => ({
    status: "error" as RunStatus,
    stepResults: test.steps.map((s): StepResult => ({ stepId: s.id, status: "skipped" })),
    error,
  });

  const reportPath = join(outputDir, "report.json");
  if (!existsSync(reportPath)) return fail(stderr.trim().split("\n").slice(-5).join("\n") || "e2e produced no report");

  const run = JSON.parse(readFileSync(reportPath, "utf8")).run;
  const result = run.results.find((r: any) => r.selected);
  const attempt: Attempt | undefined = result?.attempts?.at(-1);
  if (!attempt) return fail(run.errors?.[0]?.message ?? "e2e ran no test");

  // Copy the failure screenshot so it outlives the run's output dir.
  let screenshotUrl: string | undefined;
  const shot = attempt.artifacts?.filter((a) => a.kind === "screenshot").at(-1);
  if (shot) {
    const dir = join(DATA_DIR, "runs", runId);
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(outputDir, "results", shot.path), join(dir, "failure.png"));
    screenshotUrl = `/artifacts/${runId}/failure.png`;
  }

  const lines = stepLines(script);
  const byStep = new Map<string, ReportStep[]>();
  for (const s of attempt.steps) {
    const stepId = s.source && lines.get(s.source.line);
    if (stepId) byStep.set(stepId, [...(byStep.get(stepId) ?? []), s]);
  }

  const stepResults = test.steps.map((step): StepResult => {
    const reported = byStep.get(step.id);
    if (!reported?.length) return { stepId: step.id, status: "skipped" }; // steps after a failure aren't recorded
    const failed = reported.find((s) => s.status !== "passed");
    if (!failed) return { stepId: step.id, status: "passed" };
    return { stepId: step.id, status: "failed" as StepStatus, error: failed.error?.message?.slice(0, 500), screenshotPath: screenshotUrl };
  });

  const status: RunStatus = run.status === "passed" ? "passed" : run.status === "failed" ? "failed" : "error";
  return { status, stepResults, error: attempt.error?.message ?? null };
}
