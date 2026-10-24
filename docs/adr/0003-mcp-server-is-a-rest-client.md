# The MCP server is a thin REST client of the API

`server/mcp` never touches the database and never starts Runs: every MCP tool is a `fetch` to `server/api`. That keeps a single owner of state and Runs, and because every write goes through the API, changes made by external coding agents reach the web UI as live SSE events at no extra cost. We build our own MCP server instead of using e2e's built-in `e2e mcp`, which only exposes a raw browser session: no Tests, no Replay Cache, no trace.
