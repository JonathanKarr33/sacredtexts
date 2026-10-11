import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  try {
    fs.symlinkSync(outside, path.join(tmp, "escape"), "dir");
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
  it("lists only subdirectories containing a readable summary.json", () => {
    const ids = listRuns(tmp).map((r) => r.id);
    expect(ids).toContain("run-a");
    expect(ids).not.toContain("not-a-run");
    expect(ids).not.toContain("escape"); // a symlink entry is not a directory listing target
  });

  it("returns [] for a nonexistent root (the empty state, not a throw)", () => {
    expect(listRuns(path.join(tmp, "does-not-exist"))).toEqual([]);
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
