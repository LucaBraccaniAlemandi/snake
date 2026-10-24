import { z } from "zod";
import { Step, type Run, type RunStatus, type StepStatus, type Test } from "./schema";

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
// POST   /api/tests/:id/run[?wait=true] -> 202 { runId } | RunSummary
// GET    /api/runs/:runId               -> Run & { summary }
// GET    /api/tests/:id/events          SSE, see TestEvent
// POST   /api/chat                      { messages, testId } -> AI SDK UI message stream
// GET    /artifacts/:runId/failure.png  screenshot of a failed Run

export const WorkspaceBody = z.object({ name: z.string().min(1) });
export type WorkspaceBody = z.infer<typeof WorkspaceBody>;

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

export const UpdateTestBody = z.object({ name: z.string().min(1).optional(), url: z.string().url().optional(), metadata: TestMetadata.partial().optional() });

export type ApiError = { error: string };

// SSE events on /api/tests/:id/events (event name = `type`, data = JSON of the whole object)
export type TestEvent =
  | { type: "test-updated"; test: Test; source: "web" | "chat" | "mcp" }
  | { type: "run-started"; run: Run }
  | { type: "step-status"; runId: string; stepId: string; status: StepStatus; error?: string; screenshotUrl?: string }
  | { type: "run-finished"; run: Run; status: RunStatus };
