import { z } from "zod";
import { BugSeverity, BugStatus, ExecutionEngine, Step, type Run, type RunStatus, type StepStatus, type Test } from "./schema";

// REST contract served by api, consumed by mcp and the client (client/src/types.ts mirrors it).
// GET    /api/workspaces                -> Workspace[]
// POST   /api/workspaces                { name } -> Workspace
// PATCH  /api/workspaces/:wid           { name } -> Workspace
// DELETE /api/workspaces/:wid           -> 204, cascades to Tests and Runs (the last Workspace can't be deleted)
// GET    /api/workspaces/:wid/tests     -> TestListItem[]
// POST   /api/workspaces/:wid/tests     CreateTestBody -> Test
// GET    /api/tests/:id                 -> Test
// PATCH  /api/tests/:id                 { name?, url? } -> Test
// DELETE /api/tests/:id                 -> 204
// PUT    /api/tests/:id/steps           PutStepsBody -> Test
// POST   /api/tests/:id/steps/edit      EditStepBody -> Test
// POST   /api/tests/:id/run/preview    { engine: "laya" } -> { code }
// POST   /api/tests/:id/run[?wait=true] { engine?, code? } -> 202 { runId } | RunSummary
// GET    /api/runs/:runId               -> Run & { summary }
// GET    /api/workspaces/:wid/bugs       -> Bug[] ordered by report date DESC
// GET    /api/bugs/:bugId                 -> Bug
// POST   /api/runs/:runId/bugs           CreateBugBody -> Bug
// PATCH  /api/bugs/:bugId                 UpdateBugBody -> Bug
// GET    /api/tests/:id/events          SSE, see TestEvent
// POST   /api/chat                      { messages, testId } -> AI SDK UI message stream
// GET    /api/ai/catalog                 -> runtime/agent/model availability, no credentials
// GET    /artifacts/:runId/failure.png  screenshot of a failed Run

export const WorkspaceBody = z.object({ name: z.string().min(1) });
export type WorkspaceBody = z.infer<typeof WorkspaceBody>;

export const CreateFolderBody = z.object({
  kind: z.enum(["test", "cycle"]),
  name: z.string().trim().min(1).max(200),
  parentId: z.string().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});
export type CreateFolderBody = z.infer<typeof CreateFolderBody>;
export const UpdateFolderBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  parentId: z.string().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide a folder field to update");
export type UpdateFolderBody = z.infer<typeof UpdateFolderBody>;

export const TestMetadata = z.object({
  key: z.string().optional(), componentId: z.string().optional(), status: z.string().optional(), priority: z.string().optional(),
  preconditions: z.string().optional(), jiraId: z.string().optional(), testType: z.string().optional(), release: z.string().optional(), notes: z.string().optional(),
});
export const CreateTestBody = z.object({ name: z.string().min(1), url: z.string().url(), metadata: TestMetadata.optional() });
export type CreateTestBody = z.infer<typeof CreateTestBody>;

// id may be omitted for new steps; the server assigns one.
export const PutStepsBody = z.object({ steps: z.array(Step.extend({ id: z.string().optional() })) });
export type PutStepsBody = z.infer<typeof PutStepsBody>;

export const EditStepBody = z.object({
  op: z.enum(["add", "update", "delete", "move"]),
  step: Step.partial().extend({ id: z.string().optional() }),
  afterId: z.string().nullable().optional(), // omitted = end, null = start (add/move)
});
export type EditStepBody = z.infer<typeof EditStepBody>;

export const UpdateTestBody = z.object({ name: z.string().min(1).optional(), url: z.string().url().optional(), folderId: z.string().nullable().optional(), metadata: TestMetadata.partial().optional(), steps: PutStepsBody.shape.steps.optional() });

const TicketReference = z.string().trim().max(500).nullable().optional();
export const CreateBugBody = z.object({
  title: z.string().trim().min(1).max(300),
  severity: BugSeverity,
  expected: z.string().trim().min(1).max(5000),
  actual: z.string().trim().min(1).max(5000),
  notes: z.string().trim().max(5000).default(""),
  ticket: TicketReference,
});
export type CreateBugBody = z.infer<typeof CreateBugBody>;

export const UpdateBugBody = z.object({ status: BugStatus.optional(), ticket: TicketReference })
  .refine((value) => value.status !== undefined || value.ticket !== undefined, "Provide a status or ticket to update");
export type UpdateBugBody = z.infer<typeof UpdateBugBody>;

export const RunPreviewBody = z.object({ engine: ExecutionEngine });
export const StartRunBody = z.object({ engine: ExecutionEngine.default("e2e"), code: z.string().max(200_000).optional() })
  .refine((value) => value.engine === "laya" || value.code === undefined, "Custom code is only supported by the Laya engine");

export type ApiError = { error: string };

// SSE events on /api/tests/:id/events (event name = `type`, data = JSON of the whole object)
export type TestEvent =
  | { type: "test-updated"; test: Test; source: "web" | "chat" | "mcp" }
  | { type: "run-started"; run: Run }
  | { type: "step-status"; runId: string; stepId: string; status: StepStatus; error?: string; screenshotUrl?: string }
  | { type: "run-finished"; run: Run; status: RunStatus };
