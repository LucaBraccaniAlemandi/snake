import { createOpenAI } from "@ai-sdk/openai";

type ModelEnv = Record<string, string | undefined>;

export function createModel(kind: "chat" | "e2e", env: ModelEnv = process.env, fetch?: typeof globalThis.fetch) {
  if (kind === "e2e" && env.E2E_BASE_URL?.trim()) {
    const configured = env.E2E_MODEL?.trim() || "local-model";
    const modelId = configured.replace(/^openrouter\//, "");
    const apiKey = env.E2E_API_KEY?.trim() || "local-runtime";
    const transport = fetch ?? globalThis.fetch;
    const localFetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (!env.E2E_API_KEY?.trim()) headers.delete("authorization");
      return transport(input, { ...init, headers });
    };
    (localFetchImpl as typeof globalThis.fetch).preconnect = globalThis.fetch.preconnect;
    const localFetch = localFetchImpl as typeof globalThis.fetch;
    const compatible = createOpenAI({ baseURL: env.E2E_BASE_URL.trim(), apiKey, fetch: localFetch });
    return compatible.chat(modelId);
  }
  const apiKey = env.OPENROUTER_API_KEY?.trim() || env.API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY or API_KEY is required in the server environment");
  const configured = kind === "chat" ? env.CHAT_MODEL : env.E2E_MODEL;
  const modelId = (configured?.trim() || "inception/mercury-2.5").replace(/^openrouter\//, "");
  const openrouter = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey, fetch });
  // OpenRouter's model catalog uses Chat Completions, not OpenAI's default Responses API.
  return openrouter.chat(modelId);
}
