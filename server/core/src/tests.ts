import type { EditStepBody } from "./api";
import { compile } from "./compile";
import { db, newId, ready } from "./db";
import { publish } from "./events";
import type { RunStatus, Step, Test, TestListItem } from "./schema";

export type Source = "web" | "chat" | "mcp";
export class NotFound extends Error {}
export class BadRequest extends Error {}

type TestRow = { id: string; name: string; url: string; steps: Step[]; metadata: Test["metadata"]; updated_at: Date | string };
const json = <T>(value: T | string): T => typeof value === "string" ? JSON.parse(value) as T : value;
const iso = (value: Date | string) => new Date(value).toISOString();

function toTest(row: TestRow): Test {
  const steps = json<Step[]>(row.steps);
  return { id: row.id, name: row.name, url: row.url, steps, metadata: json(row.metadata), script: compile({ id: row.id, url: row.url, steps }), updatedAt: iso(row.updated_at) };
}

export async function listTests(): Promise<TestListItem[]> {
  await ready;
  const rows = await db`SELECT t.id, t.name, t.url, t.steps, t.metadata, t.updated_at,
    (SELECT status FROM runs r WHERE r.test_id = t.id ORDER BY r.created_at DESC LIMIT 1) AS last_status
    FROM tests t ORDER BY t.updated_at DESC`;
  return rows.map((r) => {
    const steps = json<Step[]>(r.steps);
    return { id: r.id, name: r.name, url: r.url, script: compile({ id: r.id, url: r.url, steps }), steps, metadata: json(r.metadata), lastRunStatus: (r.last_status as RunStatus) ?? null, updatedAt: iso(r.updated_at) };
  });
}

export async function getTest(id: string): Promise<Test> {
  await ready;
  const [row] = await db<TestRow[]>`SELECT * FROM tests WHERE id = ${id}`;
  if (!row) throw new NotFound(`Test ${id} not found`);
  return toTest(row);
}

export async function createTest(input: { name: string; url: string; metadata?: Test["metadata"] }): Promise<Test> {
  await ready;
  const id = newId("t");
  const metadata = { ...input.metadata, key: input.metadata?.key || `TC-${id.slice(1).toUpperCase()}` };
  await db`INSERT INTO tests (id, name, url, steps, metadata) VALUES (${id}, ${input.name}, ${input.url}, '[]'::jsonb, ${db.json(metadata)})`;
  return getTest(id);
}

export async function updateTest(id: string, patch: { name?: string; url?: string; metadata?: Test["metadata"] }, source: Source): Promise<Test> {
  const t = await getTest(id);
  const metadata = { ...t.metadata, ...patch.metadata };
  await db`UPDATE tests SET name = ${patch.name ?? t.name}, url = ${patch.url ?? t.url}, metadata = ${db.json(metadata)}, updated_at = now() WHERE id = ${id}`;
  return broadcast(id, source);
}

export async function deleteTest(id: string): Promise<void> {
  await getTest(id);
  await db`DELETE FROM tests WHERE id = ${id}`;
}

export async function setSteps(id: string, steps: Array<Omit<Step, "id"> & { id?: string }>, source: Source): Promise<Test> {
  await getTest(id);
  const withIds: Step[] = steps.map((s) => ({ ...s, id: s.id || newId("s") }));
  await db`UPDATE tests SET steps = ${db.json(withIds)}, updated_at = now() WHERE id = ${id}`;
  return broadcast(id, source);
}

export async function editStep(id: string, edit: EditStepBody, source: Source): Promise<Test> {
  const steps = [...(await getTest(id)).steps];
  const index = (stepId?: string) => {
    const i = steps.findIndex((s) => s.id === stepId);
    if (i < 0) throw new BadRequest(`Step ${stepId} not found`);
    return i;
  };
  const insertAt = (step: Step) => steps.splice(edit.afterId === undefined ? steps.length : edit.afterId === null ? 0 : index(edit.afterId) + 1, 0, step);
  switch (edit.op) {
    case "add":
      if (!edit.step.type || !edit.step.text) throw new BadRequest("add needs step.type and step.text");
      insertAt({ ...edit.step, id: newId("s"), type: edit.step.type, text: edit.step.text });
      break;
    case "update": {
      const i = index(edit.step.id);
      const next: Step = { ...steps[i]!, ...edit.step, id: steps[i]!.id };
      if (next.type !== "expect") delete next.target, delete next.value;
      steps[i] = next;
      break;
    }
    case "delete": steps.splice(index(edit.step.id), 1); break;
    case "move": {
      const [moved] = steps.splice(index(edit.step.id), 1);
      insertAt(moved!);
      break;
    }
  }
  return setSteps(id, steps, source);
}

async function broadcast(id: string, source: Source): Promise<Test> {
  const test = await getTest(id);
  publish(id, { type: "test-updated", test, source });
  return test;
}
