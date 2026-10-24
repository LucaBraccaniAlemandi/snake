import { z } from "zod";
import { Step, type Run, type RunStatus, type StepStatus, type Test } from "./schema";

// REST contract between apps/web, apps/mcp and apps/server.
// GET    /api/tests                   -> TestListItem[]
// POST   /api/tests                   CreateTestBody -> Test
// GET    /api/tests/:id               -> Test
// PUT    /api/tests/:id/steps         PutStepsBody -> Test
// PUT    /api/tests/:id/script        PutScriptBody -> Test | 400 ApiError
// POST   /api/tests/:id/steps/edit    EditStepBody -> Test
// POST   /api/tests/:id/run[?wait=true] -> { runId } | RunSummary
// GET    /api/tests/:id/runs          -> Run[]
// GET    /api/runs/:runId             -> Run
// GET    /api/tests/:id/events        SSE, see TestEvent
// GET    /api/docs/e2e[?topic=]       -> { topics: string[] } | { topic, content }
// POST   /api/inspect                 InspectBody -> { summary: string }
// POST   /api/chat                    { messages, testId } -> AI SDK UI message stream
// GET    /artifacts/*                 run artifacts (screenshots)

export const CreateTestBody = z.object({ name: z.string().min(1), url: z.string().url() });
export type CreateTestBody = z.infer<typeof CreateTestBody>;

export const PutStepsBody = z.object({ steps: z.array(Step) });
export type PutStepsBody = z.infer<typeof PutStepsBody>;

export const PutScriptBody = z.object({ script: z.string() });
export type PutScriptBody = z.infer<typeof PutScriptBody>;

export const EditStepBody = z.object({
  op: z.enum(["add", "update", "delete", "move"]),
  step: Step.partial().extend({ id: z.string().optional() }),
  afterId: z.string().nullable().optional(),
});
export type EditStepBody = z.infer<typeof EditStepBody>;

export const InspectBody = z.object({ url: z.string().url() });
export type InspectBody = z.infer<typeof InspectBody>;

export type ApiError = { error: string };

// SSE events on /api/tests/:id/events (event name = `type`, data = JSON of the whole object)
export type TestEvent =
  | { type: "test-updated"; test: Test; source: "web" | "chat" | "mcp" }
  | { type: "run-started"; run: Run }
  | { type: "step-status"; runId: string; stepId: string; status: StepStatus; error?: string; screenshotUrl?: string }
  | { type: "run-finished"; run: Run; status: RunStatus };
