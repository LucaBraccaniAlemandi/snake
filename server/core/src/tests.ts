import type { EditStepBody } from "./api";
import { compile } from "./compile";
import { iso, newId, sql } from "./db";
import { BadRequest, NotFound } from "./errors";
import { publish } from "./events";
import type { Step, Test, TestListItem } from "./schema";
import { getWorkspace, removeArtifacts } from "./workspaces";

export { BadRequest, NotFound };
export type Source = "web" | "chat" | "mcp";

type TestRow = { id: string; workspace_id: string; name: string; url: string; steps: Step[]; updated_at: Date };

function toTest(row: TestRow): Test {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    url: row.url,
    steps: row.steps,
    script: compile({ id: row.id, url: row.url, steps: row.steps }),
    updatedAt: iso(row.updated_at)!,
  };
}

export async function listTests(workspaceId: string): Promise<TestListItem[]> {
  await getWorkspace(workspaceId);
  const rows = await sql`
    SELECT t.id, t.workspace_id, t.name, t.url, t.updated_at,
      (SELECT status FROM runs r WHERE r.test_id = t.id ORDER BY r.created_at DESC LIMIT 1) AS last_status
    FROM tests t WHERE t.workspace_id = ${workspaceId} ORDER BY t.updated_at DESC`;
  return rows.map((r: any) => ({
    id: r.id, workspaceId: r.workspace_id, name: r.name, url: r.url, lastRunStatus: r.last_status ?? null, updatedAt: iso(r.updated_at)!,
  }));
}

export async function getTest(id: string): Promise<Test> {
  const [row] = await sql`SELECT * FROM tests WHERE id = ${id}`;
  if (!row) throw new NotFound(`Test ${id} not found`);
  return toTest(row);
}

export async function createTest(workspaceId: string, input: { name: string; url: string }): Promise<Test> {
  await getWorkspace(workspaceId);
  const [row] = await sql`
    INSERT INTO tests (id, workspace_id, name, url) VALUES (${newId("t")}, ${workspaceId}, ${input.name}, ${input.url}) RETURNING *`;
  return toTest(row);
}

export async function updateTest(id: string, patch: { name?: string; url?: string }, source: Source): Promise<Test> {
  const t = await getTest(id);
  await sql`UPDATE tests SET name = ${patch.name ?? t.name}, url = ${patch.url ?? t.url}, updated_at = now() WHERE id = ${id}`;
  return broadcast(id, source);
}

export async function deleteTest(id: string) {
  await getTest(id);
  const runs = await sql`SELECT id FROM runs WHERE test_id = ${id}`;
  await sql`DELETE FROM tests WHERE id = ${id}`; // cascades to runs
  removeArtifacts(runs.map((r: { id: string }) => r.id));
}

export async function setSteps(id: string, steps: Array<Omit<Step, "id"> & { id?: string }>, source: Source): Promise<Test> {
  await getTest(id);
  const withIds: Step[] = steps.map((s) => ({ ...s, id: s.id || newId("s") }));
  await sql`UPDATE tests SET steps = ${JSON.stringify(withIds)}::text::jsonb, updated_at = now() WHERE id = ${id}`;
  return broadcast(id, source);
}

export async function editStep(id: string, edit: EditStepBody, source: Source): Promise<Test> {
  const steps = [...(await getTest(id)).steps];
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
      const next: Step = { ...steps[i]!, ...edit.step, id: steps[i]!.id };
      if (next.type !== "expect") delete next.target, delete next.value; // only Expectations use them
      steps[i] = next;
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

async function broadcast(id: string, source: Source): Promise<Test> {
  const test = await getTest(id);
  publish(id, { type: "test-updated", test, source });
  return test;
}
