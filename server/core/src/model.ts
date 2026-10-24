import { createOpenAI } from "@ai-sdk/openai";

type ModelEnv = Record<string, string | undefined>;

export function createModel(kind: "chat" | "e2e", env: ModelEnv = process.env, fetch?: typeof globalThis.fetch) {
  const apiKey = env.OPENROUTER_API_KEY?.trim() || env.API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY or API_KEY is required in the server environment");
  const configured = kind === "chat" ? env.CHAT_MODEL : env.E2E_MODEL;
  const modelId = (configured?.trim() || "inception/mercury-2.5").replace(/^openrouter\//, "");
  const openrouter = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey, fetch });
  // OpenRouter's model catalog uses Chat Completions, not OpenAI's default Responses API.
  return openrouter.chat(modelId);
}
