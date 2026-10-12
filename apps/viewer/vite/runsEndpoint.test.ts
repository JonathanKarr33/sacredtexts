import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listRuns, resolveRunFile, createRunsHandler } from "./runsEndpoint";

let tmp: string; // the runs root
let outside: string; // a dir outside runs/, the target of symlink-escape attempts
let symlinked = false;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "runs-"));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-"));
  // a valid run (has summary.json)
  fs.mkdirSync(path.join(tmp, "run-a"));
  fs.writeFileSync(path.join(tmp, "run-a", "summary.json"), '{"models":{}}');
  // a directory WITHOUT summary.json — must not be listed
  fs.mkdirSync(path.join(tmp, "not-a-run"));
  // a secret outside the root, and a symlink under runs/ pointing at it
  fs.writeFileSync(path.join(outside, "secret.json"), '{"secret":true}');
  // a run dir whose summary.json is itself a SYMLINK — must not be indexed
  fs.mkdirSync(path.join(tmp, "symsummary"));
  try {
    fs.symlinkSync(outside, path.join(tmp, "escape"), "dir");
    // an IN-root symlink (points at a real run inside the root) — still rejected, since the
    // requirement is to never traverse a symlink, not only escaping ones.
    fs.symlinkSync(path.join(tmp, "run-a"), path.join(tmp, "inlink"), "dir");
    // a symlinked summary.json pointing at the outside secret
    fs.symlinkSync(path.join(outside, "secret.json"), path.join(tmp, "symsummary", "summary.json"), "file");
    symlinked = true;
  } catch {
    symlinked = false; // symlinks may be unavailable on some platforms
  }
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

// A minimal Connect-style response double.
function fakeRes() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    end(b?: unknown) {
      this.body = b;
    },
  };
  return res;
}

describe("runsEndpoint listRuns", () => {
  it("lists only subdirectories containing a readable, non-symlinked summary.json", () => {
    const ids = listRuns(tmp).map((r) => r.id);
    expect(ids).toContain("run-a");
    expect(ids).not.toContain("not-a-run");
    expect(ids).not.toContain("escape"); // a symlink entry is not a directory listing target
    if (symlinked) expect(ids).not.toContain("symsummary"); // summary.json is a symlink
  });

  it("returns [] for a nonexistent root (the empty state, not a throw)", () => {
    expect(listRuns(path.join(tmp, "does-not-exist"))).toEqual([]);
  });

  it("surfaces summary.generated_at and orders by recency, not mtime (Issue #7)", () => {
    // A temp root of its own so the collapsed-mtime scenario is isolated from run-a above.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "recency-"));
    try {
      // Two runs; `older` has the newer generated_at, `newer-by-id`... has an older one. We
      // then touch both to the SAME mtime (the fresh-clone collapse) so only generated_at
      // can order them correctly.
      fs.mkdirSync(path.join(root, "z-run-2026-10-10"));
      fs.writeFileSync(
        path.join(root, "z-run-2026-10-10", "summary.json"),
        JSON.stringify({ models: {}, generated_at: "2026-10-12T00:00:00+00:00" }),
      );
      fs.mkdirSync(path.join(root, "a-run-2026-10-10"));
      fs.writeFileSync(
        path.join(root, "a-run-2026-10-10", "summary.json"),
        JSON.stringify({ models: {}, generated_at: "2026-10-11T00:00:00+00:00" }),
      );
      const when = new Date("2020-01-01T00:00:00Z"); // identical mtime for both dirs
      fs.utimesSync(path.join(root, "z-run-2026-10-10"), when, when);
      fs.utimesSync(path.join(root, "a-run-2026-10-10"), when, when);

      const runs = listRuns(root);
      // Newer generated_at first, even though its id ("z-…") would sort LAST by id-asc.
      expect(runs.map((r) => r.id)).toEqual(["z-run-2026-10-10", "a-run-2026-10-10"]);
      expect(runs[0]!.generatedAt).toBe("2026-10-12T00:00:00+00:00");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("lists a run whose summary.json has no generated_at (generatedAt undefined)", () => {
    // run-a's summary ('{"models":{}}') carries no generated_at — still listed, just without it.
    const entry = listRuns(tmp).find((r) => r.id === "run-a");
    expect(entry).toBeDefined();
    expect(entry!.generatedAt).toBeUndefined();
  });
});

describe("runsEndpoint resolveRunFile confinement", () => {
  it("resolves a normal file within the root", () => {
    const f = resolveRunFile(tmp, "run-a/summary.json");
    expect(f).not.toBeNull();
    expect(fs.readFileSync(f!, "utf8")).toContain("models");
  });

  it("rejects path traversal that escapes the root", () => {
    expect(resolveRunFile(tmp, `../${path.basename(outside)}/secret.json`)).toBeNull();
  });

  it("rejects a symlink under runs/ that resolves outside the root", () => {
    if (!symlinked) return; // skip where symlinks are unavailable
    expect(resolveRunFile(tmp, "escape/secret.json")).toBeNull();
  });

  it("rejects an in-root symlink component (no symlink is ever traversed)", () => {
    if (!symlinked) return;
    // "inlink" points at run-a inside the root, yet is still rejected.
    expect(resolveRunFile(tmp, "inlink/summary.json")).toBeNull();
  });
});

describe("runsEndpoint handler", () => {
  it("serves the run index JSON for the collection request", () => {
    const res = fakeRes();
    createRunsHandler(tmp)({ url: "/_index" }, res);
    const parsed = JSON.parse(String(res.body)) as { id: string }[];
    expect(parsed.map((r) => r.id)).toContain("run-a");
  });

  it("returns 400 on malformed percent-encoding", () => {
    const res = fakeRes();
    createRunsHandler(tmp)({ url: "/%E0%A4%A" }, res);
    expect(res.statusCode).toBe(400);
  });

  it("404s a file request that escapes the root", () => {
    const res = fakeRes();
    createRunsHandler(tmp)({ url: `/../${path.basename(outside)}/secret.json` }, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("endpoint is node-only (not imported by client source)", () => {
  it("no src/ module references the node-only run endpoint", () => {
    const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && fs.readFileSync(p, "utf8").includes("runsEndpoint")) {
          offenders.push(path.relative(srcDir, p));
        }
      }
    };
    walk(srcDir);
    expect(offenders).toEqual([]);
  });
});
