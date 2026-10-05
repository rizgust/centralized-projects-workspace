import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// dist/ is embedded by the Go server (web/embed.go). Re-emit dist/.gitkeep on every
// build so the embed still compiles after a clean checkout (dist/* is gitignored).
const keepGitkeep = (): Plugin => ({
  name: "keep-gitkeep",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: ".gitkeep", source: "" });
  },
});

// Assets use a relative base so the embedded build works from any mount path.
// In dev, /api is proxied to `pcctl dashboard --dev` on 127.0.0.1:7777.
export default defineConfig({
  base: "./",
  plugins: [react(), keepGitkeep()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    proxy: {
      "/api": { target: "http://127.0.0.1:7777", changeOrigin: false },
    },
  },
});
