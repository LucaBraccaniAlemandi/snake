import { expect, test } from "bun:test";
import { compile, stepLines } from "./compile";

const t = {
  id: "t1",
  url: "http://localhost:3002",
  steps: [
    { id: "s1", type: "act" as const, text: `Click "Buy"\nnow` },
    { id: "s2", type: "assert" as const, text: "Cart shows 1 item" },
    { id: "s3", type: "expect" as const, text: "Order confirmed", value: "Thanks!" },
    { id: "s4", type: "expect" as const, text: "On confirmation page", target: "url", value: "/confirm?x=1" },
  ],
};

test("compiles one tagged statement per step", () => {
  const script = compile(t);
  expect(script).toContain(`await agent.act("Click \\"Buy\\"\\nnow"); // step:s1`);
  expect(script).toContain(`await agent.assert("Cart shows 1 item"); // step:s2`);
  expect(script).toContain(`await expect(screen.getByText("Thanks!")).toBeVisible(); // step:s3`);
  expect(script).toContain(`await expect(browser).toHaveURL(/\\/confirm\\?x=1/); // step:s4`);
});

test("stepLines maps lines back to step ids", () => {
  const lines = stepLines(compile(t));
  expect([...lines.values()]).toEqual(["s1", "s2", "s3", "s4"]);
  expect(lines.get(6)).toBe("s1");
});
