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
export const ExecutionEngine = z.enum(["e2e", "laya"]);
export type ExecutionEngine = z.infer<typeof ExecutionEngine>;

export const StepStatus = z.enum(["pending", "running", "passed", "failed", "skipped"]);
export type StepStatus = z.infer<typeof StepStatus>;

export const BugSeverity = z.enum(["Alta", "Media", "Baja"]);
export type BugSeverity = z.infer<typeof BugSeverity>;

export const BugStatus = z.enum(["Abierto", "En análisis", "Resuelto", "Cerrado"]);
export type BugStatus = z.infer<typeof BugStatus>;

export const VideoEvidence = z.object({
  url: z.string(),
  mediaType: z.string(),
  size: z.number().nonnegative().optional(),
  sha256: z.string().optional(),
  startedAt: z.string().optional(),
});
export type VideoEvidence = z.infer<typeof VideoEvidence>;

export const Workspace = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});
export type Workspace = z.infer<typeof Workspace>;

export const FolderKind = z.enum(["test", "cycle"]);
export type FolderKind = z.infer<typeof FolderKind>;
export const Folder = z.object({
  id: z.string(),
  workspaceId: z.string(),
  kind: FolderKind,
  name: z.string(),
  parentId: z.string().nullable(),
  position: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Folder = z.infer<typeof Folder>;

export const Test = z.object({
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
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
  workspaceId: z.string(),
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
  text: z.string(), // the Step's text when the Run executed
  status: StepStatus,
  error: z.string().optional(),
  screenshotPath: z.string().optional(),
});
export type StepResult = z.infer<typeof StepResult>;

export const AiModelSnapshot = z.object({ provider: z.string(), model: z.string(), local: z.boolean().default(false) });
export type AiModelSnapshot = z.infer<typeof AiModelSnapshot>;

export const Run = z.object({
  id: z.string(),
  testId: z.string(),
  engine: ExecutionEngine.default("e2e"),
  status: RunStatus,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
  stepResults: z.array(StepResult),
  testSnapshot: z.object({ name: z.string(), url: z.string(), steps: z.array(Step), metadata: Test.shape.metadata }),
  aiSnapshot: AiModelSnapshot.optional(),
  codeSnapshot: z.string().optional(),
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
  videos: z.array(VideoEvidence).default([]),
});
export type RunSummary = z.infer<typeof RunSummary>;

export const Bug = z.object({
  id: z.string(),
  runId: z.string(),
  testId: z.string(),
  title: z.string(),
  severity: BugSeverity,
  status: BugStatus,
  expected: z.string(),
  actual: z.string(),
  notes: z.string(),
  ticket: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Bug = z.infer<typeof Bug>;

export const JiraIssue = z.object({
  id: z.string(), key: z.string(), url: z.string().url(), title: z.string(), description: z.string(),
  status: z.string(), type: z.string(), priority: z.string(), assignee: z.string(), updatedAt: z.string(), parent: z.string().optional(),
});
export type JiraIssue = z.infer<typeof JiraIssue>;
export const JiraSuggestion = z.object({
  id: z.string(), title: z.string().min(1), type: z.string().min(1), priority: z.enum(["Alta", "Media", "Baja"]),
  pre: z.string(), expected: z.string(),
});
export type JiraSuggestion = z.infer<typeof JiraSuggestion>;
export const JiraAnalysis = z.object({ documentation: z.string(), suggestions: z.array(JiraSuggestion).min(1).max(12) });
export type JiraAnalysis = z.infer<typeof JiraAnalysis>;
