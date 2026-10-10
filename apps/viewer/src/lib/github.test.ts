import { describe, it, expect, vi } from "vitest";
import { latestSha, tree, raw, RateLimitError, GitHubError } from "./github";
import { fakeFetch, traditionFiles } from "../test/fakeRepo";

const REPO = "owner/repo";
const SHA = "deadbeef";

describe("github client", () => {
  const files = traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]);
  const f = fakeFetch(REPO, SHA, files);

  it("latestSha returns the commit sha", async () => {
    expect(await latestSha(REPO, "main", f)).toBe(SHA);
  });

  it("tree returns blob + tree entries (recursive)", async () => {
    const entries = await tree(REPO, SHA, f);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("traditions/sunni-islam/tradition.yaml");
    expect(paths).toContain("traditions/sunni-islam/scenarios/JLS-001/turn1.md");
    expect(entries.find((e) => e.path === "traditions/sunni-islam/scenarios/JLS-001")?.type).toBe("tree");
  });

  it("raw returns file text and null on 404", async () => {
    expect(await raw(REPO, SHA, "traditions/sunni-islam/README.md", f)).toBe("# sunni-islam");
    expect(await raw(REPO, SHA, "traditions/sunni-islam/missing.md", f)).toBeNull();
  });

  it("throws RateLimitError (with reset) on 403 + remaining 0", async () => {
    const reset = Math.floor(Date.now() / 1000) + 60;
    const limited = fakeFetch(REPO, SHA, files, { rateLimited: true, resetEpoch: reset });
    await expect(latestSha(REPO, "main", limited)).rejects.toBeInstanceOf(RateLimitError);
    try {
      await latestSha(REPO, "main", limited);
    } catch (e) {
      expect((e as RateLimitError).resetAt?.getTime()).toBe(reset * 1000);
    }
  });

  it("falls back to per-directory walk when the tree is truncated", async () => {
    // Mock the non-recursive walk: root -> traditions -> sunni -> {tradition.yaml, scenarios -> {index.json, JLS-001 -> turn1.md}}
    const trees: Record<string, unknown> = {
      [SHA]: { tree: [{ path: "traditions", type: "tree", sha: "TRAD" }] },
      TRAD: { tree: [{ path: "sunni", type: "tree", sha: "SUNNI" }] },
      SUNNI: {
        tree: [
          { path: "tradition.yaml", type: "blob", sha: "a" },
          { path: "scenarios", type: "tree", sha: "SC" },
        ],
      },
      SC: {
        tree: [
          { path: "index.json", type: "blob", sha: "b" },
          { path: "JLS-001", type: "tree", sha: "S1" },
        ],
      },
      S1: { tree: [{ path: "turn1.md", type: "blob", sha: "c" }] },
    };
    const walkFetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("recursive=1")) {
        return new Response(JSON.stringify({ truncated: true, tree: [] }), { status: 200 });
      }
      const m = /git\/trees\/([^?]+)/.exec(url);
      const node = m && m[1] ? trees[m[1]] : undefined;
      if (node) return new Response(JSON.stringify(node), { status: 200 });
      return new Response("nf", { status: 404 });
    }) as typeof fetch;

    const entries = await tree(REPO, SHA, walkFetch);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("traditions/sunni/tradition.yaml");
    expect(paths).toContain("traditions/sunni/scenarios/index.json");
    expect(paths).toContain("traditions/sunni/scenarios/JLS-001/turn1.md");
  });

  it("raw throws GitHubError on a 5xx", async () => {
    const bad = (async () => new Response("boom", { status: 502 })) as typeof fetch;
    await expect(raw(REPO, SHA, "x", bad)).rejects.toBeInstanceOf(GitHubError);
  });

  it("aborts a hung request after the bounded timeout", async () => {
    vi.useFakeTimers();
    try {
      const hanging = ((_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        })) as typeof fetch;
      const pending = latestSha(REPO, "main", hanging);
      const expectation = expect(pending).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(15_000); // hit the timeout -> abort -> reject
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});
