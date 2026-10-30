# API + demo shop + OpenCode. Runs need Node 24 (e2e), Bun (server), and Chromium for Playwright.
FROM node:24-bookworm-slim

COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    E2E_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data \
    PORT=3000

# Install dependencies first so they cache between code changes.
COPY package.json bun.lock ./
COPY api/package.json api/
COPY core/package.json core/
COPY mcp/package.json mcp/
COPY demo-shop/package.json demo-shop/
COPY runner/package.json runner/
RUN bun install --frozen-lockfile

# Keep the OpenCode server version aligned with the v1 HTTP API used by the adapter.
RUN npm install --global opencode-ai@1.18.31

# concurrently uses `ps` to terminate child process trees when a service exits.
RUN apt-get update && apt-get install -y --no-install-recommends procps \
 && rm -rf /var/lib/apt/lists/*

# Chromium headless shell + system libraries, at the exact version @e2e-dev/web pins.
RUN node "$(find node_modules/.bun -path '*playwright-core/cli.js' | head -1)" install --with-deps --only-shell chromium ffmpeg \
 && rm -rf /var/lib/apt/lists/*

COPY . .
RUN mkdir -p /data/opencode-home runner/tests runner/.cache runner/.runs && chown -R node:node /app /data

# The image's built-in non-root user; Playwright launches Chromium without its sandbox by default.
USER node

EXPOSE 3000 3002
CMD ["bun", "run", "start:docker"]
