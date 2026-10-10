// Same-origin edge for the multibrowser SPA (Spec 92 topology, 2026-08-16).
//
// The multibrowser Railway service is the ONLY browser-facing origin. It:
//   1. forwards `/api/*` to the review API over Railway's PRIVATE network (the API service has no
//      public domain), passing method/headers/body and Set-Cookie back VERBATIM, and
//   2. serves the built SPA from ./dist with an index.html history fallback for client routing.
//
// Because the browser only ever talks to THIS origin, the session cookie is first-party — no
// third-party-cookie blocking, and the API is never reachable from the public internet. Replaces the
// previous `serve -s dist` static server.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

const PORT = Number(process.env.PORT) || 4173;
// The API service on Railway's private network. Overridable; defaults to the internal service name.
const API_ORIGIN = (process.env.API_ORIGIN || "http://multibench-api.railway.internal:8080").replace(/\/+$/, "");

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, "..", "dist");
// Read the SPA shell once for the history fallback (a missing static file → client route).
const indexHtml = readFileSync(join(DIST, "index.html"), "utf8");

const app = new Hono();

// 1) Reverse-proxy the API. Verbatim pass-through both ways; Set-Cookie is preserved header-for-header
//    (getSetCookie keeps multiple cookies distinct — the login response sets session + CSRF).
app.all("/api/*", async (c) => {
  const url = new URL(c.req.url);
  const target = `${API_ORIGIN}${url.pathname}${url.search}`;
  const method = c.req.method;
  const init = { method, headers: c.req.raw.headers, redirect: "manual" };
  if (method !== "GET" && method !== "HEAD") {
    init.body = c.req.raw.body; // stream the request body through…
    init.duplex = "half"; // …which Node's fetch requires to be declared.
  }
  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch {
    return c.json({ error: "review service unreachable" }, 502);
  }
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") headers.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie?.() ?? []) headers.append("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, headers });
});

// 2) Static assets, then 3) the SPA history fallback for any unmatched GET (deep links).
app.use("/*", serveStatic({ root: DIST }));
app.notFound((c) => c.html(indexHtml));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`multibrowser edge listening on :${info.port} → API ${API_ORIGIN}`);
});
