import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  BadRequest,
  CreateTestBody,
  EditStepBody,
  NotFound,
  PutStepsBody,
  createTest,
  deleteTest,
  editStep,
  getTest,
  listTests,
  setSteps,
  subscribe,
  updateTest,
  type TestEvent,
} from "@agent-tester/core";
import { z } from "zod";

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: err.message }, 404);
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  if (err instanceof z.ZodError) return c.json({ error: z.prettifyError(err) }, 400);
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/tests", (c) => c.json(listTests()));
app.post("/api/tests", async (c) => c.json(createTest(CreateTestBody.parse(await c.req.json())), 201));
app.get("/api/tests/:id", (c) => c.json(getTest(c.req.param("id"))));
app.patch("/api/tests/:id", async (c) =>
  c.json(updateTest(c.req.param("id"), CreateTestBody.partial().parse(await c.req.json()), "web")),
);
app.delete("/api/tests/:id", (c) => {
  deleteTest(c.req.param("id"));
  return c.body(null, 204);
});

// x-source lets the MCP server mark its writes; the web client sends nothing.
const source = (c: { req: { header: (k: string) => string | undefined } }) =>
  c.req.header("x-source") === "mcp" ? "mcp" : "web";

app.put("/api/tests/:id/steps", async (c) =>
  c.json(setSteps(c.req.param("id"), PutStepsBody.parse(await c.req.json()).steps, source(c))),
);
app.post("/api/tests/:id/steps/edit", async (c) =>
  c.json(editStep(c.req.param("id"), EditStepBody.parse(await c.req.json()), source(c))),
);

app.get("/api/tests/:id/events", (c) => {
  const id = c.req.param("id");
  getTest(id);
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
