import type { EditStepBody } from "./api";
import { compile } from "./compile";
import { db, newId } from "./db";
import { publish } from "./events";
import type { RunStatus, Step, Test, TestListItem } from "./schema";

export type Source = "web" | "chat" | "mcp";

export class NotFound extends Error {}
export class BadRequest extends Error {}

type TestRow = { id: string; name: string; url: string; steps: string; updated_at: string };

function toTest(row: TestRow): Test {
  const steps: Step[] = JSON.parse(row.steps);
  return { id: row.id, name: row.name, url: row.url, steps, script: compile({ id: row.id, url: row.url, steps }), updatedAt: row.updated_at };
}

export function listTests(): TestListItem[] {
  return db
    .query(
      `SELECT t.id, t.name, t.url, t.updated_at,
         (SELECT status FROM runs r WHERE r.test_id = t.id ORDER BY r.created_at DESC LIMIT 1) AS last_status
       FROM tests t ORDER BY t.updated_at DESC`,
    )
    .all()
    .map((r: any) => ({ id: r.id, name: r.name, url: r.url, lastRunStatus: (r.last_status as RunStatus) ?? null, updatedAt: r.updated_at }));
}

export function getTest(id: string): Test {
  const row = db.query("SELECT * FROM tests WHERE id = ?").get(id) as TestRow | null;
  if (!row) throw new NotFound(`Test ${id} not found`);
  return toTest(row);
}

export function createTest(input: { name: string; url: string }): Test {
  const id = newId("t");
  db.query("INSERT INTO tests (id, name, url, steps, updated_at) VALUES (?, ?, ?, '[]', ?)").run(id, input.name, input.url, new Date().toISOString());
  return getTest(id);
}

export function updateTest(id: string, patch: { name?: string; url?: string }, source: Source): Test {
  const t = getTest(id);
  db.query("UPDATE tests SET name = ?, url = ?, updated_at = ? WHERE id = ?").run(patch.name ?? t.name, patch.url ?? t.url, new Date().toISOString(), id);
  return broadcast(id, source);
}

export function deleteTest(id: string) {
  getTest(id);
  db.query("DELETE FROM runs WHERE test_id = ?").run(id);
  db.query("DELETE FROM tests WHERE id = ?").run(id);
}

export function setSteps(id: string, steps: Array<Omit<Step, "id"> & { id?: string }>, source: Source): Test {
  getTest(id);
  const withIds: Step[] = steps.map((s) => ({ ...s, id: s.id || newId("s") }));
  db.query("UPDATE tests SET steps = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(withIds), new Date().toISOString(), id);
  return broadcast(id, source);
}

export function editStep(id: string, edit: EditStepBody, source: Source): Test {
  const steps = [...getTest(id).steps];
  const index = (stepId?: string) => {
    const i = steps.findIndex((s) => s.id === stepId);
    if (i < 0) throw new BadRequest(`Step ${stepId} not found`);
    return i;
  };
  // afterId omitted = append at the end, null = insert at the start
  const insertAt = (step: Step) =>
    steps.splice(edit.afterId === undefined ? steps.length : edit.afterId === null ? 0 : index(edit.afterId) + 1, 0, step);

  switch (edit.op) {
    case "add": {
      if (!edit.step.type || !edit.step.text) throw new BadRequest("add needs step.type and step.text");
      insertAt({ ...edit.step, id: newId("s"), type: edit.step.type, text: edit.step.text });
      break;
    }
    case "update": {
      const i = index(edit.step.id);
      steps[i] = { ...steps[i]!, ...edit.step, id: steps[i]!.id };
      break;
    }
    case "delete":
      steps.splice(index(edit.step.id), 1);
      break;
    case "move": {
      const [moved] = steps.splice(index(edit.step.id), 1);
      insertAt(moved!);
      break;
    }
  }
  return setSteps(id, steps, source);
}

function broadcast(id: string, source: Source): Test {
  const test = getTest(id);
  publish(id, { type: "test-updated", test, source });
  return test;
}
