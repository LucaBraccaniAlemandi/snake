import { expect, test } from "bun:test";
import { publish, subscribe } from "./events";
import type { TestEvent } from "./api";

test("one shared stream receives events from more than six tests and unsubscribes", () => {
  const received: TestEvent[] = [];
  const scoped: TestEvent[] = [];
  const unsubscribe = subscribe("all", (event) => received.push(event));
  const unsubscribeScoped = subscribe("test-0", (event) => scoped.push(event));
  const event: TestEvent = { type: "step-status", runId: "run-1", stepId: "step-1", status: "passed" };
  try {
    for (let i = 0; i < 8; i++) publish(`test-${i}`, event);
    expect(received).toHaveLength(8);
    expect(scoped).toHaveLength(1);
    unsubscribe();
    publish("test-0", event);
    expect(received).toHaveLength(8);
  } finally {
    unsubscribe();
    unsubscribeScoped();
  }
});
