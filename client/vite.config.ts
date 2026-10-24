import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:3000";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      open: env.VITE_OPEN_BROWSER !== "false",
      hmr: true,
      watch: { usePolling: env.DOCKER_DEV === "1", interval: 500 },
      proxy: {
        "/api": apiProxyTarget,
        "/artifacts": apiProxyTarget,
      },
    },
  };
});
