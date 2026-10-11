// Dev-only run-serving logic for the viewer, extracted from vite.config.ts so it is
// importable and unit-testable against a temp dir (the old inline `serveRuns` closure
// had a hardcoded root and could not be tested). node-only — lives OUTSIDE src/ so a
// stray client import cannot pull fs/path into the browser bundle.
//
// It exposes:
//   listRuns(runsDir)      — the run index: [{id, mtimeMs}] for each subdir with a
//                            readable summary.json, newest first.
//   resolveRunFile(dir,rel)— confined single-file resolution (realpath + symlink reject).
//   createRunsHandler(dir) — a Connect middleware mounting both at /runs (dev server).
//
// Confinement is canonical-path based (fs.realpathSync), not a lexical startsWith, so a
// symlink under runs/ that escapes the root is rejected; URL decoding is wrapped so a
// malformed-percent-encoding request returns 400 rather than throwing.

import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface RunIndexEntry {
  id: string;
  mtimeMs: number;
}

/** Immediate subdirectories of `runsDir` that contain a readable `summary.json`, newest
 * first (mtime desc, id asc as a stable tiebreak). A nonexistent root returns []. */
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
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    try {
      const real = fs.realpathSync(dir);
      if (real !== root && !real.startsWith(root + path.sep)) continue; // symlink escape
      const summary = path.join(real, "summary.json");
      if (fs.existsSync(summary) && fs.statSync(summary).isFile()) {
        out.push({ id: e.name, mtimeMs: fs.statSync(real).mtimeMs });
      }
    } catch {
      /* unreadable entry — skip */
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** Resolve a (already-decoded) relative path within `runsDir` to a canonical file path,
 * or null if it does not resolve to a regular file confined within the run root (after
 * following symlinks). */
export function resolveRunFile(runsDir: string, rel: string): string | null {
  let root: string;
  try {
    root = fs.realpathSync(runsDir);
  } catch {
    return null;
  }
  const candidate = path.join(root, rel);
  let real: string;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    return null;
  }
  if (real !== root && !real.startsWith(root + path.sep)) return null; // traversal / symlink escape
  try {
    if (!fs.statSync(real).isFile()) return null;
  } catch {
    return null;
  }
  return real;
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
    res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "text/plain");
    res.end(fs.readFileSync(file));
  };
}
