/// <reference types="vitest/config" />
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev-only: serve the repo's gitignored runs/ at /runs/ so the local results view
// (/local-results?run=/runs/<id>) can read real benchmark artifacts. Confined to
// the repo's runs/ directory; not part of any production build.
function serveRuns(): Plugin {
  const runsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../runs");
  return {
    name: "serve-runs",
    configureServer(server) {
      server.middlewares.use("/runs", (req, res) => {
        const rel = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
        const file = path.join(runsDir, rel);
        if (!file.startsWith(runsDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "text/plain");
        res.end(fs.readFileSync(file));
      });
    },
  };
}

// Pure client-side SPA. `base: '/'` (absolute asset URLs) so deep links such as
// `/t/sunni-islam/JLS-001` resolve `/assets/...` correctly on a root-served host (Railway).
// A relative base ('./') would break asset loading on nested routes.
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss(), serveRuns()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
