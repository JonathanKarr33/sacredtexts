// Dev-only run-serving logic for the viewer, extracted from vite.config.ts so it is
// importable and unit-testable against a temp dir (the old inline `serveRuns` closure
// had a hardcoded root and could not be tested). node-only — lives OUTSIDE src/ so a
// stray client import cannot pull fs/path into the browser bundle.
//
// It exposes:
//   listRuns(runsDir)      — the run index: [{id, mtimeMs, generatedAt?}] for each subdir
//                            with a readable summary.json, newest first BY RECENCY (not
//                            mtime alone — see listRuns / recency.ts, Issue #7).
//   resolveRunFile(dir,rel)— confined single-file resolution (realpath + symlink reject).
//   createRunsHandler(dir) — a Connect middleware mounting both at /runs (dev server).
//
// Confinement is canonical-path based (fs.realpathSync), not a lexical startsWith, so a
// symlink under runs/ that escapes the root is rejected; URL decoding is wrapped so a
// malformed-percent-encoding request returns 400 rather than throwing.

import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
// Pure, browser-safe recency helper from src/ — safe to import here (node → src is fine; the
// banned direction is src → this node-only module, which pulls fs into the browser bundle).
import { runRecencyMs } from "../src/lib/recency";

export interface RunIndexEntry {
  id: string;
  mtimeMs: number;
  /** `summary.generated_at`, if the run's summary.json carries a string one — surfaced so
   * the client can order by it (recency, Issue #7) without fetching every summary. */
  generatedAt?: string;
}

/** `generated_at` from a run's summary.json if present as a string, else undefined. Never
 * throws: a missing/unreadable/malformed summary yields undefined (recency then falls back). */
function readGeneratedAt(summaryPath: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as unknown;
    const g = (parsed as { generated_at?: unknown })?.generated_at;
    return typeof g === "string" ? g : undefined;
  } catch {
    return undefined;
  }
}

/** Immediate subdirectories of `runsDir` that contain a readable `summary.json`, newest
 * first. Ordering is by recency (`summary.generated_at` → run-id date → dir mtime, Issue #7;
 * id asc as a stable tiebreak), NOT mtime alone, which collapses in a fresh clone. A
 * nonexistent root returns []. */
export function listRuns(runsDir: string): RunIndexEntry[] {
  let root: string;
  try {
    root = fs.realpathSync(runsDir);
  } catch {
    return []; // runs/ does not exist yet — the empty state, not an error.
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: RunIndexEntry[] = [];
  for (const e of entries) {
    // Do not serve symlinked entries at all (the binding requirement rejects symlink
    // traversal, not only escaping ones); a symlinked run dir is intentionally skipped.
    if (e.isSymbolicLink() || !e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    const summary = path.join(dir, "summary.json");
    try {
      // lstat first so a SYMLINKED summary.json is never indexed (statSync/accessSync
      // would follow it) — consistent with the no-symlink-traversal rule.
      const ls = fs.lstatSync(summary);
      if (ls.isSymbolicLink() || !ls.isFile()) continue;
      fs.accessSync(summary, fs.constants.R_OK); // require it to be readable, not just present
      // Read generated_at for recency. A missing/malformed summary still lists the run (same
      // runs as before) — generatedAt just stays undefined, so recency falls back to the id.
      out.push({ id: e.name, mtimeMs: fs.statSync(dir).mtimeMs, generatedAt: readGeneratedAt(summary) });
    } catch {
      /* missing / unreadable summary.json — skip */
    }
  }
  out.sort(
    (a, b) =>
      runRecencyMs({ generatedAt: b.generatedAt, runId: b.id, mtimeMs: b.mtimeMs }) -
        runRecencyMs({ generatedAt: a.generatedAt, runId: a.id, mtimeMs: a.mtimeMs }) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return out;
}

/** Resolve a (already-decoded) relative path within `runsDir` to a confined regular file,
 * or null. Rejects parent traversal AND any path component that is a symlink (so a symlink
 * is never followed, in-root or escaping), then confirms containment and that the target
 * is a regular file. */
export function resolveRunFile(runsDir: string, rel: string): string | null {
  let root: string;
  try {
    root = fs.realpathSync(runsDir); // root itself is canonical (no symlink components)
  } catch {
    return null;
  }
  const parts = rel.split(/[/\\]+/).filter((p) => p.length > 0 && p !== ".");
  let cur = root;
  for (const part of parts) {
    if (part === "..") return null; // no parent traversal
    cur = path.join(cur, part);
    try {
      if (fs.lstatSync(cur).isSymbolicLink()) return null; // reject any symlink component
    } catch {
      return null; // component does not exist
    }
  }
  if (cur !== root && !cur.startsWith(root + path.sep)) return null; // containment backstop
  try {
    if (!fs.statSync(cur).isFile()) return null;
  } catch {
    return null;
  }
  return cur;
}

type ReqLike = Pick<IncomingMessage, "url">;
type ResLike = Pick<ServerResponse, "statusCode" | "setHeader" | "end">;

/** A Connect middleware for the dev server. Mounted at `/runs`, Connect STRIPS the mount
 * prefix, so a collection request arrives as `req.url === "/"` or `"/_index"` and a file
 * request as `"/<id>/summary.json"`. */
export function createRunsHandler(runsDir: string) {
  return (req: ReqLike, res: ResLike): void => {
    const rawPath = (req.url ?? "").split("?")[0] ?? "";
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      res.statusCode = 400;
      res.end("bad request");
      return;
    }

    // Collection request → the run index as JSON.
    if (decoded === "" || decoded === "/" || decoded === "/_index") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(listRuns(runsDir)));
      return;
    }

    // Single-file request, confined.
    const rel = decoded.replace(/^\/+/, "");
    const file = resolveRunFile(runsDir, rel);
    if (!file) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    let body: Buffer;
    try {
      body = fs.readFileSync(file);
    } catch {
      res.statusCode = 500; // confined + a regular file, but reading still failed
      res.end("read error");
      return;
    }
    res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "text/plain");
    res.end(body);
  };
}
