// Mirrors the REST/SSE contracts in server/core/src/schema.ts and api.ts.
export type StepType = "act" | "assert" | "expect";
export type Step = { id: string; type: StepType; text: string; target?: string; value?: string; data?: string; expected?: string };
export type TestMetadata = { key?: string; componentId?: string; status?: string; priority?: string; preconditions?: string; jiraId?: string; testType?: string; release?: string; notes?: string };
export type RunStatus = "queued" | "running" | "passed" | "failed" | "error";
export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";
export type Test = { id: string; name: string; url: string; script: string; steps: Step[]; metadata: TestMetadata; updatedAt: string };
export type TestListItem = Test & { lastRunStatus: RunStatus | null };
export type StepResult = { stepId: string; text?: string; status: StepStatus; error?: string; screenshotPath?: string };
export type VideoEvidence = { url: string; mediaType: string; size?: number; sha256?: string; startedAt?: string };
export type RunSummary = { runId: string; status: RunStatus; passed: boolean; failedStep: { id: string; text: string } | null; error: string | null; screenshotUrl: string | null; videos?: VideoEvidence[] };
export type BugStatus = "Abierto" | "En análisis" | "Resuelto" | "Cerrado";
export type Bug = {
  id: string; runId: string; testId: string; title: string; severity: "Alta" | "Media" | "Baja";
  status: BugStatus; expected: string; actual: string; notes: string; ticket: string | null;
  createdAt: string; updatedAt: string;
};
export type CreateBug = Pick<Bug, "title" | "severity" | "expected" | "actual"> & { notes?: string; ticket?: string | null };
export type Run = {
  id: string; testId: string; status: RunStatus; startedAt: string | null; finishedAt: string | null;
  stepResults: StepResult[]; reportPath?: string; createdAt?: string;
  testSnapshot?: { name: string; url: string; steps: Step[]; metadata: TestMetadata };
  summary?: RunSummary | null;
};
export type EditStepBody = { op: "add" | "update" | "delete" | "move"; step: Partial<Step>; afterId?: string | null };
export type ApiError = { error: string };
export type TestEvent =
  | { type: "test-updated"; test: Test; source: "web" | "chat" | "mcp" }
  | { type: "run-started"; run: Run }
  | { type: "step-status"; runId: string; stepId: string; status: StepStatus; error?: string; screenshotUrl?: string }
  | { type: "run-finished"; run: Run; status: RunStatus };
