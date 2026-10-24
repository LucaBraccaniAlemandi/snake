// Tiny static shop used as the demo target. Not implemented yet.
Bun.serve({
  port: 3002,
  fetch: () => new Response("<h1>Demo shop</h1>", { headers: { "content-type": "text/html" } }),
});
console.log("demo-shop on http://localhost:3002");
