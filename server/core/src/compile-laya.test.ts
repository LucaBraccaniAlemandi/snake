import { expect, test } from "bun:test";
import { compileLaya } from "./compile-laya";
import { StartRunBody } from "./api";

const input = {
  id: "case-1",
  url: "https://example.test/#/",
  steps: [
    { id: "s1", type: "act" as const, text: "Add an item", data: "Name: mug", expected: "Cart has one item" },
    { id: "s2", type: "assert" as const, text: "The confirmation is visible" },
    { id: "s3", type: "expect" as const, text: "Confirmation page", target: "url", value: "/done" },
  ],
};

test("compiles an editable Code Mode program that receives case data through values", () => {
  const code = compileLaya(input);
  expect(code).toContain("await browser.open({ url: values.url })");
  expect(code).toContain("await browser.do({ goal: step.text");
  expect(code).toContain("await browser.check({ question: step.text })");
  expect(code).toContain("await browser.listTabs()");
  expect(code).toContain("await browser.snapshot({ max_chars: 20000 })");
  expect(code).toContain("await browser.stopRecording({})");
  expect(code).toContain('video.status === "completed"');
  expect(code).not.toContain("Add an item");
  expect(code).not.toContain("mug");
});

test("run contract defaults to e2e and permits per-run Laya code snapshots", () => {
  expect(StartRunBody.parse({})).toEqual({ engine: "e2e" });
  expect(StartRunBody.parse({ engine: "laya", code: "return { passed: true };" })).toEqual({ engine: "laya", code: "return { passed: true };" });
  expect(() => StartRunBody.parse({ engine: "e2e", code: "custom" })).toThrow();
});
