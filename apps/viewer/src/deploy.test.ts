import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawn } from "node:child_process";
import { createServer } from "node:net";

/**
 * Acquire a free ephemeral port (OS-assigned via bind 0) to run the smoke server on. A FIXED
 * port would deterministically collide when two builders touch the viewer concurrently (and a
 * leaked static server once squatted on a hardcoded port for days, #49 review) — an ephemeral
 * port sidesteps both. There is a tiny window between close and the server's re-bind, but
 * ephemeral ports effectively never collide there.
 */
async function getFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const addr = probe.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error("could not acquire a free port"))));
    });
  });
}

// Build / deploy invariants. Some run against the repo files; two run a REAL production build and
// a REAL static server. Run by vitest from apps/viewer.

// Production source only — test files and test/ helpers are NOT bundled by vite build.
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "test") continue;
      out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("build / deploy invariants", () => {
  beforeAll(() => {
    execSync("pnpm build", { stdio: "ignore" });
  }, 120_000);

  it("NO source module imports tradition data (the multibrowser corpus surface is gone)", () => {
    for (const file of sourceFiles("src")) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/\bfrom\s+['"][^'"]*\/traditions\//);
      expect(src, file).not.toMatch(/scenario_id_pattern:\s*['"]/);
    }
  });

  it("the REAL production bundle carries NO corpus identifiers and is the SPA entry", () => {
    const assetsDir = "dist/assets";
    const js = readdirSync(assetsDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(assetsDir, f), "utf8"))
      .join("\n");
    expect(js).not.toMatch(/JLS-\d{3}/);
    expect(js).not.toMatch(/BZ-\d{3}/);
    expect(js).not.toContain("al-jalīs"); // sunni-islam construct text
    expect(readFileSync("dist/index.html", "utf8")).toContain('id="root"');
  });

  it("vite base is '/' (absolute assets so deep links resolve on a root-served host)", () => {
    expect(readFileSync("vite.config.ts", "utf8")).toMatch(/base:\s*["']\/["']/);
  });

  it("numbered HeroUI shades emit real rules mapped onto theme-aware tokens (#86 shim, safelisted)", () => {
    // @heroui/styles v3 ships ONLY semantic tokens (--color-default, --color-warning, …) — no
    // numbered scale — so before the src/styles.css @theme shim, EVERY numbered utility the app
    // uses (text-default-500, border-default-200, bg-warning-50, …) compiled to nothing (the #55
    // tooltip scar, root-caused). The styles.css @source inline(...) safelist pins the ramp
    // deterministically; this probe asserts, against the REAL built CSS, that each safelisted
    // utility emits a rule whose value is a color-mix over HeroUI's theme-aware poles
    // (--foreground / --background / the semantic hue) — the construction that keeps the ramp
    // flipping correctly between light and dark mode. Every probed class is in the safelist, so
    // the assertion no longer depends on the app happening to use it.
    const css = readdirSync("dist/assets")
      .filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(join("dist/assets", f), "utf8"))
      .join("\n");
    const probes: { cls: string; prop: string; pole: string }[] = [
      { cls: "text-default-400", prop: "color", pole: "foreground" },
      { cls: "text-default-500", prop: "color", pole: "foreground" },
      { cls: "text-default-900", prop: "color", pole: "foreground" },
      { cls: "border-default-200", prop: "border-color", pole: "foreground" },
      { cls: "bg-default-50", prop: "background-color", pole: "foreground" },
      { cls: "bg-warning-50", prop: "background-color", pole: "warning" },
      { cls: "text-warning-800", prop: "color", pole: "warning" },
      { cls: "border-warning-200", prop: "border-color", pole: "warning" },
      { cls: "bg-danger-50", prop: "background-color", pole: "danger" },
      { cls: "text-danger-700", prop: "color", pole: "danger" },
      { cls: "text-success-600", prop: "color", pole: "success" },
    ];
    for (const { cls, prop, pole } of probes) {
      // The utility must exist at all (the whole bug was that it did not) ...
      const rule = new RegExp(`\\.${cls}\\{${prop}:[^}]+\\}`, "g");
      expect(css, `.${cls} emits no rule — numbered shade is a no-op again`).toMatch(rule);
      // ... and its live (color-mix) value must be a mix over a theme-aware token, not a static
      // color, so the shade stays correct in dark mode.
      const themed = new RegExp(
        `\\.${cls}\\{${prop}:(?:var\\(--${pole}\\)|color-mix\\(in oklab,var\\(--${pole}\\))`,
      );
      expect(css, `.${cls} is not mapped onto the theme-aware --${pole} token`).toMatch(themed);
    }
  });

  it("the start command runs the minimal static host with its deps present (no /api proxy)", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.scripts.start).toBe("node server/index.mjs");
    expect(pkg.dependencies.hono).toBeDefined();
    expect(pkg.dependencies["@hono/node-server"]).toBeDefined();
    expect(pkg.dependencies.serve, "serve is retired — the static host replaces it").toBeUndefined();
    // The removed reverse proxy mounted an `app.all("/api/*", …)` route and forwarded to an
    // upstream; assert that route handler is gone (a comment mentioning the proxy must not trip
    // this, so match the actual route call, not the words "/api").
    const server = readFileSync("server/index.mjs", "utf8");
    expect(server, "the reverse-proxy route must be gone after the purge").not.toMatch(/app\.all\(/);
  });

  it("REAL smoke: the static host serves the SPA fallback for deep routes AND /runs/_index", async () => {
    const port = await getFreePort(); // ephemeral — safe under concurrent builders
    // Run the ACTUAL `start` command (the static host). `detached` makes the child a
    // process-group leader so we can reap the whole tree.
    const server = spawn("pnpm", ["start"], {
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
      detached: true,
    });
    try {
      let ready = false;
      for (let i = 0; i < 60 && !ready; i++) {
        try {
          const r = await fetch(`http://localhost:${port}/`);
          if (r.ok) ready = true;
        } catch {
          /* not up yet */
        }
        if (!ready) await new Promise((res) => setTimeout(res, 250));
      }
      expect(ready, "static host did not start").toBe(true);

      // A nested route that is NOT a real file must fall back to index.html (the SPA shell).
      const deep = await fetch(`http://localhost:${port}/some/unknown/deep/route`);
      expect(deep.status).toBe(200);
      expect(await deep.text()).toContain('id="root"');

      // Non-vacuous static check: the hashed JS bundle must be served as a real file (not the
      // index.html fallback) with a JS content-type — otherwise a serveStatic regression would
      // ship silently while every "contains id=root" assertion still passed.
      const jsMatch = readFileSync("dist/index.html", "utf8").match(/src="(\/assets\/[^"]+\.js)"/);
      expect(jsMatch, "no hashed JS asset referenced in dist/index.html").not.toBeNull();
      const asset = await fetch(`http://localhost:${port}${jsMatch![1]}`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type") ?? "").toMatch(/javascript/);

      // Prod-host robustness: there is NO /runs endpoint in production (dev-only middleware), so
      // /runs/_index also falls through to index.html/200 — proving the home page's run-index
      // fetch gets HTML (which the leaderboard shape-sniffs into the empty state), never a hard
      // 404 crash loop.
      const index = await fetch(`http://localhost:${port}/runs/_index`);
      expect(index.status).toBe(200);
      expect(await index.text()).toContain('id="root"');
    } finally {
      try {
        if (server.pid) process.kill(-server.pid, "SIGTERM");
      } catch {
        /* group may already be gone */
      }
      server.kill();
    }
  }, 60_000);
});
