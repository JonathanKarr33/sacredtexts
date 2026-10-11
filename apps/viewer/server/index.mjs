// Minimal static host for the Sacred Texts benchmark viewer.
//
// The viewer is a pure client-side SPA with no backend: it reads run artifacts that a dev
// server exposes under /runs/, and in production it simply renders the committed/served runs.
// So this host does two things:
//   1. serve the built SPA from ./dist, and
//   2. fall back to index.html for any unmatched GET (client-side deep links).
// The old same-origin reverse proxy to multibrowser's review API is gone with the purge — this
// host no longer forwards to any upstream (no API_ORIGIN, no proxy route).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

const PORT = Number(process.env.PORT) || 4173;

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, "..", "dist");
// Read the SPA shell once for the history fallback (a missing static file → client route).
const indexHtml = readFileSync(join(DIST, "index.html"), "utf8");

const app = new Hono();

// Static assets, then the SPA history fallback for any unmatched GET (deep links).
app.use("/*", serveStatic({ root: DIST }));
app.notFound((c) => c.html(indexHtml));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`sacred-texts viewer listening on :${info.port}`);
});
