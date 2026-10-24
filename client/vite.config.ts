import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    open: process.env.VITE_OPEN_BROWSER !== "false",
    hmr: true,
    watch: { usePolling: process.env.DOCKER_DEV === "1", interval: 500 },
    proxy: {
      "/api": apiProxyTarget,
      "/artifacts": apiProxyTarget,
    },
  },
});
