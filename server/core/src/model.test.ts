import { describe, expect, test } from "bun:test";
import { createModel } from "./model";

describe("OpenRouter configuration", () => {
  test.each(["chat", "e2e"] as const)("%s requires an OpenRouter key before making a request", (kind) => {
    expect(() => createModel(kind, {})).toThrow("OPENROUTER_API_KEY or API_KEY is required");
    expect(() => createModel(kind, { OPENROUTER_API_KEY: "  ", API_KEY: "  " })).toThrow("OPENROUTER_API_KEY or API_KEY is required");
  });

  test.each(["chat", "e2e"] as const)("%s defaults to Mercury 2.5", (kind) => {
    expect(createModel(kind, { OPENROUTER_API_KEY: "unit-test-key" }).modelId).toBe("inception/mercury-2.5");
  });

  test("accepts the configured API_KEY alias", () => {
    expect(createModel("chat", { API_KEY: "unit-test-key" }).modelId).toBe("inception/mercury-2.5");
  });

  test.each(["chat", "e2e"] as const)("%s sends the right endpoint, bearer credential and model", async (kind) => {
    let request: { url: string; headers: Headers; body: Record<string, unknown> } | undefined;
    const transport = (async (url, init) => {
      request = { url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
      return Response.json({
        id: "unit-test", object: "chat.completion", created: 1, model: "inception/mercury-2.5",
        choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }) as typeof fetch;
    const model = createModel(kind, {
      OPENROUTER_API_KEY: "unit-test-key",
      CHAT_MODEL: kind === "chat" ? "openrouter/inception/mercury-2.5" : "wrong/model",
      E2E_MODEL: kind === "e2e" ? "openrouter/inception/mercury-2.5" : "wrong/model",
    }, transport);
    const result = await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "Reply OK" }] }] });
    expect(request?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request?.headers.get("authorization")).toBe("Bearer unit-test-key");
    expect(request?.headers.has("x-api-key")).toBe(false);
    expect(request?.body.model).toBe("inception/mercury-2.5");
    expect(result.content).toContainEqual({ type: "text", text: "OK" });
  });

  test("preserves a native OpenRouter model ID", () => {
    expect(createModel("chat", { OPENROUTER_API_KEY: "unit-test-key", CHAT_MODEL: "inception/mercury-2.5" }).modelId)
      .toBe("inception/mercury-2.5");
  });
});
