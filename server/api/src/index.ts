import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import {
  BadRequest,
  CreateTestBody,
  DATA_DIR,
  EditStepBody,
  NotFound,
  PutStepsBody,
  UpdateTestBody,
  WorkspaceBody,
  DEFAULT_WORKSPACE_ID,
  createTest,
  createWorkspace,
  deleteTest,
  deleteWorkspace,
  editStep,
  getRun,
  getTest,
  listRuns,
  listTests,
  listWorkspaces,
  migrate,
  renameWorkspace,
  sql,
  setSteps,
  startRun,
  subscribe,
  updateTest,
  type TestEvent,
} from "@agent-tester/core";
import { z } from "zod";
import { chat } from "./chat";

await migrate();

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: err.message }, 404);
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  if (err instanceof z.ZodError) return c.json({ error: z.prettifyError(err) }, 400);
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

app.get("/api/health", async (c) => {
  try { await sql`SELECT 1`; return c.json({ ok: true, database: "connected" }); }
  catch { return c.json({ ok: false, database: "unavailable" }, 503); }
});

app.get("/api/workspaces", async (c) => c.json(await listWorkspaces()));
app.post("/api/workspaces", async (c) => c.json(await createWorkspace(WorkspaceBody.parse(await c.req.json()).name), 201));
app.patch("/api/workspaces/:wid", async (c) =>
  c.json(await renameWorkspace(c.req.param("wid"), WorkspaceBody.parse(await c.req.json()).name)),
);
app.delete("/api/workspaces/:wid", async (c) => {
  await deleteWorkspace(c.req.param("wid"));
  return c.body(null, 204);
});
app.get("/api/workspaces/:wid/tests", async (c) => c.json(await listTests(c.req.param("wid"))));
app.post("/api/workspaces/:wid/tests", async (c) =>
  c.json(await createTest(c.req.param("wid"), CreateTestBody.parse(await c.req.json())), 201),
);

// Compatibility endpoints keep the existing client and MCP integrations on the Default workspace.
app.get("/api/tests", async (c) => c.json(await listTests(DEFAULT_WORKSPACE_ID)));
app.post("/api/tests", async (c) => c.json(await createTest(DEFAULT_WORKSPACE_ID, CreateTestBody.parse(await c.req.json())), 201));
app.get("/api/tests/:id", async (c) => c.json(await getTest(c.req.param("id"))));
app.patch("/api/tests/:id", async (c) =>
  c.json(await updateTest(c.req.param("id"), UpdateTestBody.parse(await c.req.json()), "web")),
);
app.delete("/api/tests/:id", async (c) => {
  await deleteTest(c.req.param("id"));
  return c.body(null, 204);
});

// x-source lets the MCP server mark its writes; the web client sends nothing.
const source = (c: { req: { header: (k: string) => string | undefined } }) =>
  c.req.header("x-source") === "mcp" ? "mcp" : "web";

app.put("/api/tests/:id/steps", async (c) =>
  c.json(await setSteps(c.req.param("id"), PutStepsBody.parse(await c.req.json()).steps, source(c))),
);
app.post("/api/tests/:id/steps/edit", async (c) =>
  c.json(await editStep(c.req.param("id"), EditStepBody.parse(await c.req.json()), source(c))),
);

app.post("/api/tests/:id/run", async (c) => {
  const { runId, done } = await startRun(c.req.param("id"));
  if (c.req.query("wait") === "true") return c.json(await done);
  return c.json({ runId }, 202);
});
app.post("/api/chat", async (c) => chat(await c.req.json()));
app.get("/api/tests/:id/runs", async (c) => c.json(await listRuns(c.req.param("id"))));
app.get("/api/runs", async (c) => c.json(await listRuns()));
app.get("/api/runs/:runId", async (c) => c.json(await getRun(c.req.param("runId"))));
app.use("/artifacts/*", serveStatic({ root: `${DATA_DIR}/runs`, rewriteRequestPath: (p) => p.replace(/^\/artifacts/, "") }));

app.get("/api/tests/:id/events", async (c) => {
  const id = c.req.param("id");
  await getTest(id);
  return streamSSE(c, async (stream) => {
    const queue: TestEvent[] = [];
    let wake: (() => void) | undefined;
    const unsubscribe = subscribe(id, (event) => {
      queue.push(event);
      wake?.();
    });
    stream.onAbort(() => {
      unsubscribe();
      wake?.();
    });
    while (!stream.aborted) {
      const event = queue.shift();
      if (event) {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        continue;
      }
      // wake on the next event, or every 15s to send a keep-alive comment
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, 15_000);
      });
      wake = undefined;
      if (!queue.length && !stream.aborted) await stream.write(": ping\n\n");
    }
  });
});

export default { port: Number(process.env.PORT ?? 3000), fetch: app.fetch, idleTimeout: 0 };
