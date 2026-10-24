import type { Step } from "./schema";

const s = (v: string) => JSON.stringify(v);
const escapeRegExp = (v: string) => v.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function statement(step: Step): string {
  switch (step.type) {
    case "act":
      return `await agent.act(${s(step.text)});`;
    case "assert":
      return `await agent.assert(${s(step.text)});`;
    case "expect":
      if (step.target === "url") return `await expect(browser).toHaveURL(/${escapeRegExp(step.value ?? step.text)}/);`;
      return `await expect(screen.getByText(${s(step.value ?? step.text)})).toBeVisible();`;
  }
}

// One statement per Step, each tagged `// step:<id>` so report lines map back to Steps.
// The e2e test title is the testId, which keeps the Replay Cache key stable across renames.
export function compile(test: { id: string; url: string; steps: Step[] }): string {
  return [
    `import { test } from "@e2e-dev/web";`,
    `import { expect } from "e2e";`,
    ``,
    `test(${s(test.id)}, async ({ app, browser, agent, screen }) => {`,
    `  await app.open(${s(test.url)});`,
    ...test.steps.map((step) => `  ${statement(step)} // step:${step.id}`),
    `});`,
    ``,
  ].join("\n");
}

// 1-based script line -> step id, read back from the tags.
export function stepLines(script: string): Map<number, string> {
  const lines = new Map<number, string>();
  script.split("\n").forEach((line, i) => {
    const m = line.match(/\/\/ step:(\S+)\s*$/);
    if (m) lines.set(i + 1, m[1]!);
  });
  return lines;
}
