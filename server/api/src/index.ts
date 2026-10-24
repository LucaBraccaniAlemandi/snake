import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  BadRequest,
  CreateTestBody,
  CreateBugBody,
  DATA_DIR,
  EditStepBody,
  NotFound,
  PutStepsBody,
  UpdateTestBody,
  UpdateBugBody,
  WorkspaceBody,
  DEFAULT_WORKSPACE_ID,
  createTest,
  createBug,
  createWorkspace,
  deleteTest,
  deleteWorkspace,
  editStep,
  getRun,
  getBug,
  getTest,
  listRuns,
  listBugs,
  listTests,
  listWorkspaces,
  migrate,
  renameWorkspace,
  sql,
  setSteps,
  startRun,
  subscribe,
  updateTest,
  updateBug,
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
app.post("/api/chat", async (c) => chat(await c.req.json(), c.req.raw.signal));
app.get("/api/tests/:id/runs", async (c) => c.json(await listRuns(c.req.param("id"))));
app.get("/api/runs", async (c) => c.json(await listRuns()));
app.get("/api/runs/:runId", async (c) => c.json(await getRun(c.req.param("runId"))));
app.get("/api/workspaces/:wid/bugs", async (c) => c.json(await listBugs(c.req.param("wid"))));
app.get("/api/bugs/:bugId", async (c) => c.json(await getBug(c.req.param("bugId"))));
app.post("/api/runs/:runId/bugs", async (c) =>
  c.json(await createBug(c.req.param("runId"), CreateBugBody.parse(await c.req.json())), 201),
);
app.patch("/api/bugs/:bugId", async (c) =>
  c.json(await updateBug(c.req.param("bugId"), UpdateBugBody.parse(await c.req.json()))),
);

app.get("/api/events", (c) => eventStream(c, "all"));
app.get("/api/tests/:id/events", async (c) => {
  await getTest(c.req.param("id"));
  return eventStream(c, c.req.param("id"));
});

function eventStream(c: Parameters<typeof streamSSE>[0], id: string) {
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
}

export default {
  port: Number(process.env.PORT ?? 3000),
  routes: { "/artifacts/*": { dir: `${DATA_DIR}/runs` } },
  fetch: app.fetch,
  idleTimeout: 0,
};
