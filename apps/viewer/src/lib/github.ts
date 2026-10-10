// The single GitHub fetch boundary. ALL network access to GitHub happens here so it can be
// mocked in tests. Pure-ish: takes an injectable `fetch`. No token (this is a client app —
// there is no safe place to put one). Reads are SHA-pinned (immutable snapshots).
//
// On-budget calls (unauthenticated 60/hr per IP): `latestSha` + `tree`. File content via
// `raw` is OFF the API rate budget.

import { z } from "zod";

export type FetchImpl = typeof fetch;

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

/** Bound every GitHub request so a hung connection degrades cleanly instead of hanging forever. */
const TIMEOUT_MS = 15_000;

async function timedFetch(fetchImpl: FetchImpl, url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** GitHub returned a hard rate-limit (403 + remaining 0). Carries the reset time if known. */
export class RateLimitError extends Error {
  readonly resetAt: Date | null;
  constructor(resetAt: Date | null) {
    super("GitHub API rate limit exceeded.");
    this.name = "RateLimitError";
    this.resetAt = resetAt;
  }
}

/** Any other non-OK GitHub API response. */
export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

function rateReset(res: Response): Date | null {
  const v = res.headers.get("x-ratelimit-reset");
  if (!v) return null;
  const secs = Number(v);
  return Number.isFinite(secs) ? new Date(secs * 1000) : null;
}

/** Throw the right typed error for a non-OK API response (rate-limit vs generic). */
function apiError(res: Response): Error {
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    return new RateLimitError(rateReset(res));
  }
  return new GitHubError(res.status, `GitHub API ${res.status} for ${res.url}`);
}

async function apiJson(url: string, fetchImpl: FetchImpl): Promise<unknown> {
  const res = await timedFetch(fetchImpl, url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw apiError(res);
  return res.json();
}

// ---- latest commit SHA -----------------------------------------------------------------------

const CommitSchema = z.object({ sha: z.string().min(1) });

export async function latestSha(repo: string, ref: string, fetchImpl: FetchImpl = fetch): Promise<string> {
  const data = await apiJson(`${API}/repos/${repo}/commits/${ref}`, fetchImpl);
  const parsed = CommitSchema.safeParse(data);
  if (!parsed.success) throw new GitHubError(200, "Unexpected commit response shape.");
  return parsed.data.sha;
}

// ---- tree ------------------------------------------------------------------------------------

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
}

const TreeSchema = z.object({
  truncated: z.boolean().optional(),
  tree: z.array(z.object({ path: z.string(), type: z.string() })),
});

/**
 * Top-level directories the truncation fallback walks. The corpus (`traditions/`), the committed
 * score datasets (`results/`, #49), and the raw datasets (`results-raw/`, #51) must all survive a
 * truncated recursive tree — omitting one would make its runs silently vanish on a large repo.
 */
const WALK_DIRS = ["traditions", "results", "results-raw"] as const;

/**
 * Full repo tree (recursive, one call). If GitHub reports `truncated`, fall back to a
 * per-directory walk under `WALK_DIRS` (§6 N-trunc) so both the scenario set and the
 * results datasets stay complete.
 */
export async function tree(repo: string, sha: string, fetchImpl: FetchImpl = fetch): Promise<TreeEntry[]> {
  const data = await apiJson(`${API}/repos/${repo}/git/trees/${sha}?recursive=1`, fetchImpl);
  const parsed = TreeSchema.safeParse(data);
  if (!parsed.success) throw new GitHubError(200, "Unexpected git-trees response shape.");
  if (parsed.data.truncated) {
    return walkTopDirs(repo, sha, fetchImpl);
  }
  return parsed.data.tree
    .filter((e): e is TreeEntry => e.type === "blob" || e.type === "tree")
    .map((e) => ({ path: e.path, type: e.type as "blob" | "tree" }));
}

const NodeSchema = z.object({
  tree: z.array(z.object({ path: z.string(), type: z.string(), sha: z.string() })),
});

/** Per-directory fallback: walk each present `WALK_DIRS` subtree, accumulating full paths. */
async function walkTopDirs(repo: string, sha: string, fetchImpl: FetchImpl): Promise<TreeEntry[]> {
  const root = NodeSchema.parse(await apiJson(`${API}/repos/${repo}/git/trees/${sha}`, fetchImpl));
  const out: TreeEntry[] = [];
  for (const dir of WALK_DIRS) {
    const node = root.tree.find((e) => e.path === dir && e.type === "tree");
    if (!node) continue; // a repo may have traditions/ but not yet results/ (or vice-versa)
    out.push({ path: dir, type: "tree" });
    await walkInto(repo, node.sha, dir, out, fetchImpl);
  }
  return out;
}

async function walkInto(
  repo: string,
  treeSha: string,
  basePath: string,
  out: TreeEntry[],
  fetchImpl: FetchImpl,
): Promise<void> {
  const node = NodeSchema.parse(await apiJson(`${API}/repos/${repo}/git/trees/${treeSha}`, fetchImpl));
  for (const entry of node.tree) {
    const path = `${basePath}/${entry.path}`;
    if (entry.type === "tree") {
      out.push({ path, type: "tree" });
      await walkInto(repo, entry.sha, path, out, fetchImpl);
    } else if (entry.type === "blob") {
      out.push({ path, type: "blob" });
    }
  }
}

// ---- raw file content (OFF the API rate budget) ---------------------------------------------

/** Fetch a file's text pinned to `sha`. Returns null on 404 (treated display-first as absent). */
export async function raw(
  repo: string,
  sha: string,
  path: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string | null> {
  const res = await timedFetch(fetchImpl, `${RAW}/${repo}/${sha}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new GitHubError(res.status, `raw ${res.status} for ${path}`);
  return res.text();
}

/**
 * Fetch a file's raw bytes pinned to `sha` (for gzip shards — the caller sniffs + decompresses).
 * Returns null on 404. Off the API rate budget, same as `raw`.
 */
export async function rawBytes(
  repo: string,
  sha: string,
  path: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ArrayBuffer | null> {
  const res = await timedFetch(fetchImpl, `${RAW}/${repo}/${sha}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new GitHubError(res.status, `raw ${res.status} for ${path}`);
  return res.arrayBuffer();
}
