import { createModel } from "@agent-tester/core/model";
import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

// Every test opens its own absolute Starting URL; APP_URL is set per Run to that URL.
export default {
  agents: { default: { model: createModel("e2e") } },
  targets: [{ engine: web(), app: { url: process.env.APP_URL ?? "http://localhost:3002" } }],
  tests: "tests/**/*.e2e.ts",
  retries: 0,
  trace: "retain-on-failure",
  video: "retain-on-failure",
  cache: "read-write",
} satisfies E2EConfig;
