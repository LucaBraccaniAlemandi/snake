import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { editStep, getRun, getTest, setSteps, startRun, toolDefs, type Test } from "@agent-tester/core";

const model = anthropic(process.env.CHAT_MODEL || "claude-sonnet-5-5");

function system(test: Test) {
  const steps = test.steps.length
    ? test.steps.map((s, i) => `${i + 1}. [${s.id}] ${s.type}: ${s.text}${s.value ? ` (value: ${s.value})` : ""}${s.target ? ` (target: ${s.target})` : ""}`).join("\n")
    : "(no steps yet)";
  return `You help a tester write and fix agentic end-to-end tests for web apps. Tests are lists of plain-English steps run by an AI browser agent.
Work with tools: write steps with set_steps/edit_step, then run_test. Keep replies short; the steps panel already shows the steps, so don't repeat them.
When a run fails, look at the failed step and error, explain the likely cause in one or two sentences, fix the steps and re-run (at most 2 re-runs).
A common cause: a step assumes UI that is hidden behind another control (e.g. a link that reveals a field) — add an act step that opens it.

Current test "${test.name}", Starting URL ${test.url}
Steps:
${steps}`;
}

function tools(testId: string) {
  const summarize = (t: Test) => t.steps.map((s, i) => `${i + 1}. [${s.id}] ${s.type}: ${s.text}`).join("\n") || "(no steps)";
  return {
    get_test: tool({ ...meta("get_test"), execute: async () => getTest(testId) }),
    set_steps: tool({ ...meta("set_steps"), execute: async ({ steps }) => summarize(await setSteps(testId, steps, "chat")) }),
    edit_step: tool({ ...meta("edit_step"), execute: async (edit) => summarize(await editStep(testId, edit, "chat")) }),
    run_test: tool({ ...meta("run_test"), execute: async () => (await startRun(testId)).done }),
    get_run: tool({ ...meta("get_run"), execute: async ({ runId }) => getRun(runId) }),
  };
}

function meta<N extends keyof typeof toolDefs>(name: N) {
  return { description: toolDefs[name].description, inputSchema: toolDefs[name].input as (typeof toolDefs)[N]["input"] };
}

export async function chat(body: { messages: UIMessage[]; testId: string }): Promise<Response> {
  const test = await getTest(body.testId);
  const t = tools(test.id);
  const result = streamText({
    model,
    system: system(test),
    messages: await convertToModelMessages(body.messages, { tools: t }),
    tools: t,
    stopWhen: stepCountIs(20),
  });
  return result.toUIMessageStreamResponse();
}
