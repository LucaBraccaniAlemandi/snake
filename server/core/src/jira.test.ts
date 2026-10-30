import { afterEach, describe, expect, test } from "bun:test";
import { JiraConnectionInput, verifyJiraConnection } from "./jira";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("Jira Cloud connection validation", () => {
  test("accepts Cloud URL, email, token, and a one-character project key", () => {
    const input = JiraConnectionInput.parse({ baseUrl: "https://example.atlassian.net/", email: "qa@example.com", apiToken: "token", projectKey: "Q" });
    expect(input.baseUrl).toBe("https://example.atlassian.net");
  });

  test("rejects non-Cloud URLs before making a request", async () => {
    let called = false;
    globalThis.fetch = (async () => { called = true; return Response.json({}); }) as unknown as typeof fetch;
    await expect(verifyJiraConnection({ baseUrl: "https://example.com", email: "qa@example.com", apiToken: "secret", projectKey: "QA" })).rejects.toThrow("*.atlassian.net");
    expect(called).toBe(false);
  });

  test("checks Jira identity and project using Basic auth", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
      return Response.json({ key: "QA" });
    }) as unknown as typeof fetch;
    const result = await verifyJiraConnection({ baseUrl: "https://example.atlassian.net", email: "qa@example.com", apiToken: "secret", projectKey: "QA" });
    expect(result.projectKey).toBe("QA");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toEndWith("/rest/api/3/myself");
    expect(requests[1]?.url).toEndWith("/rest/api/3/project/QA");
    expect(requests[0]?.authorization).toBe(`Basic ${Buffer.from("qa@example.com:secret").toString("base64")}`);
  });
});
