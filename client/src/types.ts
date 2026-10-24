// API types. Mirrors server/core/src/schema.ts + api.ts — keep in sync by hand.
//
// GET    /api/tests                   -> TestListItem[]
// POST   /api/tests                   { name, url } -> Test
// GET    /api/tests/:id               -> Test
// PUT    /api/tests/:id/steps         { steps } -> Test
// PUT    /api/tests/:id/script        { script } -> Test | 400 { error }
// POST   /api/tests/:id/steps/edit    EditStepBody -> Test
// POST   /api/tests/:id/run           -> { runId }
// GET    /api/tests/:id/runs          -> Run[]
// GET    /api/runs/:runId             -> Run
// GET    /api/tests/:id/events        SSE, see TestEvent
// POST   /api/chat                    { messages, testId } -> AI SDK UI message stream
// GET    /artifacts/*                 run artifacts (screenshots)

// act -> agent does something, assert -> AI-judged check, expect -> exact check
export type StepType = "act" | "assert" | "expect";

export type Step = {
  id: string;
  type: StepType;
  text: string;
  target?: string;
  value?: string;
};

// "error" = infra/model-provider problem, not a test failure
export type RunStatus = "queued" | "running" | "passed" | "failed" | "error";
export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export type Test = {
  id: string;
  name: string;
  url: string;
  script: string;
  steps: Step[];
  updatedAt: string;
};

export type TestListItem = {
  id: string;
  name: string;
  url: string;
  lastRunStatus: RunStatus | null;
  updatedAt: string;
};

export type StepResult = {
  stepId: string;
  status: StepStatus;
  error?: string;
  screenshotPath?: string;
};

export type Run = {
  id: string;
  testId: string;
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  stepResults: StepResult[];
  reportPath?: string;
};

export type EditStepBody = {
  op: "add" | "update" | "delete" | "move";
  step: Partial<Step>;
  afterId?: string | null;
};

export type ApiError = { error: string };

// SSE events on /api/tests/:id/events (event name = `type`, data = JSON of the whole object)
export type TestEvent =
  | { type: "test-updated"; test: Test; source: "web" | "chat" | "mcp" }
  | { type: "run-started"; run: Run }
  | { type: "step-status"; runId: string; stepId: string; status: StepStatus; error?: string; screenshotUrl?: string }
  | { type: "run-finished"; run: Run; status: RunStatus };
