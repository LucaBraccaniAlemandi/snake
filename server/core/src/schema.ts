import { z } from "zod";

// act -> agent.act(text), assert -> agent.assert(text), expect -> deterministic check
export const StepType = z.enum(["act", "assert", "expect"]);
export type StepType = z.infer<typeof StepType>;

export const Step = z.object({
  id: z.string(),
  type: StepType,
  text: z.string(),
  target: z.string().optional(),
  value: z.string().optional(),
  data: z.string().optional(),
  expected: z.string().optional(),
});
export type Step = z.infer<typeof Step>;

// "error" = infra/model-provider problem (e2e exit 3), not a test failure; don't auto-fix it.
export const RunStatus = z.enum(["queued", "running", "passed", "failed", "error"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const StepStatus = z.enum(["pending", "running", "passed", "failed", "skipped"]);
export type StepStatus = z.infer<typeof StepStatus>;

export const Test = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  script: z.string(),
  steps: z.array(Step),
  metadata: z.object({
    key: z.string().optional(),
    componentId: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    preconditions: z.string().optional(),
    jiraId: z.string().optional(),
    testType: z.string().optional(),
    release: z.string().optional(),
    notes: z.string().optional(),
  }).default({}),
  updatedAt: z.string(),
});
export type Test = z.infer<typeof Test>;

export const TestListItem = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  script: z.string(),
  lastRunStatus: RunStatus.nullable(),
  updatedAt: z.string(),
  steps: z.array(Step),
  metadata: Test.shape.metadata,
});
export type TestListItem = z.infer<typeof TestListItem>;

export const StepResult = z.object({
  stepId: z.string(),
  status: StepStatus,
  error: z.string().optional(),
  screenshotPath: z.string().optional(),
});
export type StepResult = z.infer<typeof StepResult>;

export const Run = z.object({
  id: z.string(),
  testId: z.string(),
  status: RunStatus,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
  stepResults: z.array(StepResult),
  testSnapshot: z.object({ name: z.string(), url: z.string(), steps: z.array(Step), metadata: Test.shape.metadata }),
  reportPath: z.string().optional(),
});
export type Run = z.infer<typeof Run>;

// Compact result handed back to models; never full logs.
export const RunSummary = z.object({
  runId: z.string(),
  status: RunStatus,
  passed: z.boolean(),
  failedStep: z.object({ id: z.string(), text: z.string() }).nullable(),
  error: z.string().max(500).nullable(),
  screenshotUrl: z.string().nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;
