import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Only the tool definitions: importing the core index would open the database.
import { toolDefs } from "@agent-tester/core/src/tools";

// Thin REST client of server/api (ADR-0003): no database, no runs here.
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(SERVER_URL + path, {
    method,
    headers: { "content-type": "application/json", "x-source": "mcp" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `${method} ${path} failed with ${res.status}`);
  return data;
}

const ok = (data: unknown, testId?: string) => ({
  content: [
    { type: "text" as const, text: (testId ? `Open in the web UI: ${WEB_URL}/tests/${testId}\n\n` : "") + JSON.stringify(data, null, 2) },
  ],
});

const testId = { testId: z.string() };

export function createServer() {
  const server = new McpServer({ name: "agent-tester", version: "0.1.0" });

  const workspaceId = z.string().optional().describe('Workspace id; omit for the "default" Workspace');

  server.registerTool(
    "list_workspaces",
    { description: "List Workspaces (named groups of tests, usually one per product)." },
    async () => ok(await api("GET", "/api/workspaces")),
  );
  server.registerTool(
    "create_workspace",
    { description: "Create a Workspace to group tests for a product.", inputSchema: { name: z.string() } },
    async (input) => ok(await api("POST", "/api/workspaces", input)),
  );
  server.registerTool(
    "list_tests",
    { description: "List the tests of a Workspace with their Starting URL and last run status.", inputSchema: { workspaceId } },
    async ({ workspaceId = "default" }) => ok(await api("GET", `/api/workspaces/${workspaceId}/tests`)),
  );
  server.registerTool(
    "create_test",
    {
      description: "Create an empty test for a web app. Then add steps with set_steps and run it with run_test.",
      inputSchema: { workspaceId, name: z.string(), url: z.string().url().describe("Starting URL the test opens first") },
    },
    async ({ workspaceId = "default", ...input }) => {
      const test = (await api("POST", `/api/workspaces/${workspaceId}/tests`, input)) as { id: string };
      return ok(test, test.id);
    },
  );
  server.registerTool(
    "get_test",
    { description: toolDefs.get_test.description, inputSchema: testId },
    async ({ testId }) => ok(await api("GET", `/api/tests/${testId}`), testId),
  );
  server.registerTool(
    "set_steps",
    { description: toolDefs.set_steps.description, inputSchema: { ...testId, ...toolDefs.set_steps.input.shape } },
    async ({ testId, steps }) => ok(await api("PUT", `/api/tests/${testId}/steps`, { steps }), testId),
  );
  server.registerTool(
    "edit_step",
    { description: toolDefs.edit_step.description, inputSchema: { ...testId, ...toolDefs.edit_step.input.shape } },
    async ({ testId, ...edit }) => ok(await api("POST", `/api/tests/${testId}/steps/edit`, edit), testId),
  );
  server.registerTool(
    "run_test",
    { description: toolDefs.run_test.description, inputSchema: { ...testId, ...toolDefs.run_test.input.shape } },
    async ({ testId, engine }) => {
      const summary = (await api("POST", `/api/tests/${testId}/run?wait=true`, engine ? { engine } : {})) as { screenshotUrl: string | null };
      if (summary.screenshotUrl) summary.screenshotUrl = SERVER_URL + summary.screenshotUrl;
      return ok(summary, testId);
    },
  );
  server.registerTool(
    "get_run",
    { description: toolDefs.get_run.description, inputSchema: toolDefs.get_run.input.shape },
    async ({ runId }) => ok(await api("GET", `/api/runs/${runId}`)),
  );

  return server;
}
