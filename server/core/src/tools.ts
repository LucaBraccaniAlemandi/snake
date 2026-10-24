import { z } from "zod";
import { EditStepBody } from "./api";
import { StepType } from "./schema";

// Tool names, descriptions and inputs shared by the web chat (api) and the MCP server.
// Chat tools are bound to the open Test, so their inputs omit testId; MCP adds it.

const NewStep = z.object({
  id: z.string().optional().describe("Keep the existing id when rewriting a step; omit for new steps"),
  type: StepType,
  text: z.string().describe("One plain-English sentence"),
  target: z.literal("url").optional().describe('Only for expect steps that check the URL'),
  value: z.string().optional().describe("expect: the exact visible text, or a fragment the URL must contain"),
});

const STEP_RULES = `Each step is ONE user action or ONE check, a single plain-English sentence.
- act: something the browser agent does ("Add the first product to the cart").
- assert: a check judged by AI looking at the page ("The total shows a 10% discount").
- expect: an exact check without AI. Either visible text (value = the exact text) or the URL (target "url", value = fragment it must contain). Use it only for exact values you are sure of.
The test always starts by opening its Starting URL; never add a step for that.`;

export const toolDefs = {
  get_test: {
    description: "Get the test: name, Starting URL, steps (with ids) and the generated e2e script.",
    input: z.object({}),
  },
  set_steps: {
    description: `Replace all steps of the test. Use this to write a test from scratch or to restructure it.\n${STEP_RULES}`,
    input: z.object({ steps: z.array(NewStep) }),
  },
  edit_step: {
    description: `Add, update, delete or move a single step. Prefer this over set_steps for small fixes.
- add: step needs type and text; afterId = id of the step to insert after (null = first, omit = last).
- update: step.id plus the fields to change.
- delete: step.id.
- move: step.id plus afterId.
${STEP_RULES}`,
    input: EditStepBody,
  },
  run_test: {
    description: `Run the test in a real browser and wait for the result (usually 10-60s). Returns a compact summary: status, the failed step, a short error and a screenshot URL.
Status "error" means the run could not judge the app (model/app unavailable): report it, do not edit steps.
After a "failed" run: explain the cause in one or two sentences, fix the steps (edit_step or set_steps), and run again. Re-run at most 2 times, then ask the tester.`,
    input: z.object({}),
  },
  get_run: {
    description: "Get a past run with per-step results.",
    input: z.object({ runId: z.string() }),
  },
} as const;

export type ToolName = keyof typeof toolDefs;
