import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";

/**
 * Acquire a free ephemeral port (OS-assigned via bind 0) to run the smoke server on. A FIXED
 * port would deterministically collide when two builders touch multibrowser concurrently (and a
 * leaked `serve` once squatted on a hardcoded port for days, #49 review) — an ephemeral port
 * sidesteps both. There is a tiny window between close and the server's re-bind, but ephemeral
 * ports effectively never collide there.
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

// Build / deploy invariants (the Phase-6 acceptance items). Some run against the repo files;
// two run a REAL production build and a REAL static server. Run by vitest from apps/multibrowser.

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

  it("NO source module imports tradition data — the corpus is fetched from GitHub at runtime", () => {
    for (const file of sourceFiles("src")) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/\bfrom\s+['"][^'"]*\/traditions\//);
      expect(src, file).not.toMatch(/scenario_id_pattern:\s*['"]/);
    }
  });

  it("the REAL production bundle bakes in NO tradition data and is the SPA entry", () => {
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

  it("numbered HeroUI shades emit real rules mapped onto theme-aware tokens (#86 shim)", () => {
    // @heroui/styles v3 ships ONLY semantic tokens (--color-default, --color-warning, …) — no
    // numbered scale — so before the src/styles.css @theme shim, EVERY numbered utility the app
    // uses (text-default-500, border-default-200, bg-warning-50, …) compiled to nothing (the #55
    // tooltip scar, root-caused). Assert against the REAL built CSS that each such utility now
    // emits a rule whose value is a color-mix over HeroUI's theme-aware poles (--foreground /
    // --background / the semantic hue) — that construction is what keeps the ramp flipping
    // correctly between light and dark mode, so a static-color regression would fail here too.
    const css = readdirSync("dist/assets")
      .filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(join("dist/assets", f), "utf8"))
      .join("\n");
    // Representative classes drawn from actual app usage, spanning both the neutral ramp and the
    // status hues, and both the "toward background" (low) and "toward foreground" (high) ends.
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

  it("a normal build bundles NO baked raw tier — public/data-raw/ is deploy-only (#51)", () => {
    // The ~126 MB gz raw tier is baked into `public/data-raw/` ONLY at `railway up` time (see
    // scripts/bake-and-deploy.sh) and gitignored; a normal `pnpm build` (this test's beforeAll)
    // must not carry it into `dist/`, or every CI/dev build would balloon.
    expect(
      existsSync("dist/data-raw"),
      "dist/data-raw exists — you have a leftover local bake. Run `rm -rf apps/multibrowser/public/data-raw` " +
        "and rebuild; the baked tier is deploy-only (bake-and-deploy.sh cleans it via an EXIT trap).",
    ).toBe(false);
    // And the baked dir is gitignored so it never lands in git.
    expect(readFileSync(".gitignore", "utf8")).toMatch(/public\/data-raw\//);
  });

  it("the start command runs the same-origin edge server (proxy + SPA fallback) with its deps present", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    // The edge server (server/index.mjs) reverse-proxies /api/* AND serves the SPA — it replaced the
    // old `serve -s dist` static host so the API can live private-only behind one public origin.
    expect(pkg.scripts.start).toBe("node server/index.mjs");
    expect(pkg.dependencies.hono).toBeDefined();
    expect(pkg.dependencies["@hono/node-server"]).toBeDefined();
    expect(pkg.dependencies.serve, "serve is retired — the edge server replaces it").toBeUndefined();
    expect(existsSync("server/index.mjs")).toBe(true);
  });

  it("REAL smoke: the edge server serves the SPA fallback AND proxies /api/* with Set-Cookie verbatim", async () => {
    // A stand-in upstream API: echoes the path/method and sets TWO cookies (session + CSRF), the exact
    // shape login returns — so we prove BOTH survive the proxy distinctly, the classic folding bug.
    const upstream = createHttpServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.setHeader("set-cookie", ["mb_session=s3ss; HttpOnly; Path=/", "mb_csrf=c5rf; Path=/"]);
      res.end(JSON.stringify({ ok: true, method: req.method, path: req.url }));
    });
    const apiPort = await getFreePort();
    await new Promise<void>((r) => upstream.listen(apiPort, "127.0.0.1", r));

    const port = await getFreePort(); // ephemeral — safe under concurrent builders
    // Run the ACTUAL `start` command (the edge server) with the proxy target pointed at our stub.
    // `detached` makes the child a process-group leader so we can reap the whole tree.
    const server = spawn("pnpm", ["start"], {
      env: { ...process.env, PORT: String(port), API_ORIGIN: `http://127.0.0.1:${apiPort}` },
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
      expect(ready, "edge server did not start").toBe(true);

      // A nested route that is NOT a real file must fall back to index.html (the SPA shell).
      const deep = await fetch(`http://localhost:${port}/t/sunni-islam/JLS-001`);
      expect(deep.status).toBe(200);
      expect(await deep.text()).toContain('id="root"');

      // /api/* is reverse-proxied to the upstream, and BOTH Set-Cookie headers pass through verbatim.
      const api = await fetch(`http://localhost:${port}/api/anything?x=1`, { redirect: "manual" });
      expect(api.status).toBe(200);
      const body = (await api.json()) as { ok: boolean; path: string };
      expect(body.ok).toBe(true);
      expect(body.path).toBe("/api/anything?x=1"); // path + query forwarded intact
      const cookies = api.headers.getSetCookie();
      expect(cookies).toHaveLength(2); // session AND csrf survive distinctly (no folding)
      expect(cookies.some((c) => c.startsWith("mb_session="))).toBe(true);
      expect(cookies.some((c) => c.startsWith("mb_csrf="))).toBe(true);
    } finally {
      try {
        if (server.pid) process.kill(-server.pid, "SIGTERM");
      } catch {
        /* group may already be gone */
      }
      server.kill();
      upstream.close();
    }
  }, 60_000);
});
