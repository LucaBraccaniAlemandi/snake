// Try the chat from the terminal: creates a Test, asks the chat to write and run it, prints what happens.
// Usage: bun scripts/try.ts "test that I can buy the first product with coupon SAVE10" [url] [testId]
const API = process.env.SERVER_URL ?? "http://localhost:3000";
const [prompt, url = "http://localhost:3002", existingId] = process.argv.slice(2);
if (!prompt) {
  console.error('Usage: bun scripts/try.ts "<what to test>" [url] [testId to continue]');
  process.exit(1);
}

const testId =
  existingId ??
  ((await (await fetch(`${API}/api/workspaces/${process.env.WORKSPACE ?? "default"}/tests`, { method: "POST", body: JSON.stringify({ name: prompt.slice(0, 60), url }) })).json()) as { id: string }).id;
console.log(`Test ${testId} (${url})\n`);

const res = await fetch(`${API}/api/chat`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ testId, messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: prompt }] }] }),
});

let buffer = "";
for await (const chunk of res.body!.pipeThrough(new TextDecoderStream())) {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop()!;
  for (const line of lines) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const e = JSON.parse(line.slice(6));
    if (e.type === "text-delta") process.stdout.write(e.delta);
    else if (e.type === "tool-input-available") console.log(`\n\x1b[36m▶ ${e.toolName}\x1b[0m${e.toolName === "run_test" ? " (running in the browser…)" : ""}`);
    else if (e.type === "tool-output-available") {
      const out = typeof e.output === "string" ? e.output : JSON.stringify(e.output, null, 2);
      console.log(`\x1b[2m${out.length > 1200 ? out.slice(0, 1200) + "…" : out}\x1b[0m`);
    } else if (e.type === "error") console.log(`\n\x1b[31m${e.errorText}\x1b[0m`);
  }
}

const test = (await (await fetch(`${API}/api/tests/${testId}`)).json()) as { steps: { type: string; text: string; value?: string }[] };
console.log("\n\nFinal steps:");
test.steps.forEach((s, i) => console.log(`  ${i + 1}. [${s.type}] ${s.text}${s.value ? `  (value: ${s.value})` : ""}`));
console.log(`\nContinue this test: bun scripts/try.ts "<message>" ${url} ${testId}`);
console.log(`Generated e2e file: server/runner/tests/${testId}.e2e.ts`);
