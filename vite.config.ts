import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "LEARNINGTREE_");
  const target = `http://127.0.0.1:${env.LEARNINGTREE_API_PORT || process.env.LEARNINGTREE_API_PORT || 8000}`;
  const proxy = { "/api": { target, changeOrigin: true } };
  return {
    plugins: [react()],
    optimizeDeps: { entries: ["index.html"] },
    server: {
      port: 5173,
      strictPort: true,
      watch: { ignored: ["**/references/**", "**/data/**"] },
      proxy,
    },
    preview: { proxy },
  };
});
