/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createRunsHandler } from "./vite/runsEndpoint";

// Dev-only: serve the repo's gitignored runs/ at /runs/ so the viewer can read real
// benchmark artifacts and enumerate runs (a /runs/_index collection request returns the
// run index). The serving logic lives in ./vite/runsEndpoint (importable + unit-tested);
// confined to the repo's runs/ directory, not part of any production build.
function serveRuns(): Plugin {
  const runsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../runs");
  const handler = createRunsHandler(runsDir);
  return {
    name: "serve-runs",
    configureServer(server) {
      server.middlewares.use("/runs", (req, res) => handler(req, res));
    },
  };
}

// Pure client-side SPA. `base: '/'` (absolute asset URLs) so a deep link such as
// `/some/nested/route` resolves `/assets/...` correctly on a root-served host (Railway).
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
