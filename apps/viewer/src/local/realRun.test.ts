// Verifies the viewer's own loadRun() renders the COMMITTED first benchmark run
// (runs/first-run-2026-10-11) end-to-end — the artifacts `score` actually wrote,
// not a fixture. This is the "view the real run" step of TUTORIAL.md, pinned in
// the gate so the committed evidence can never drift out of the viewer's schema.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRun } from "../lib/localResults";

const runDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..", "runs/first-run-2026-10-11");
const present = existsSync(resolve(runDir, "summary.json"));

function diskFetcher(base: string): typeof fetch {
  return (async (url: string) => {
    const name = url.slice(base.length + 1); // strip "<base>/"
    try {
      const body = readFileSync(resolve(runDir, name), "utf-8");
      return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body } as Response;
    } catch {
      return { ok: false, status: 404 } as Response;
    }
  }) as unknown as typeof fetch;
}

describe.skipIf(!present)("committed first run renders through the viewer", () => {
  it("loadRun parses summary + joins all cells with metrics, usage, and panel", async () => {
    const base = "/runs/first-run-2026-10-11";
    const run = await loadRun(base, diskFetcher(base));
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    // 4-model panel across 2 serving providers; 100 questions each = 400 joined cells.
    expect(Object.keys(run.summary.models).sort()).toEqual(
      ["claude-haiku", "gemma-3-4b", "gpt-oss-20b", "llama-3.1-8b"],
    );
    expect(run.results).toHaveLength(400);
    expect(run.results.every((r) => r.prompt && r.task === "retrieve_quote")).toBe(true);
    expect(run.results.some((r) => r.correct)).toBe(true); // the run discriminates
    expect(run.results.every((r) => !r.missing)).toBe(true); // committed run has missing: 0
    // per-metric similarity scores are carried through now
    expect(run.results.some((r) => typeof r.token_f1 === "number")).toBe(true);
    // usage (token/call totals) and panel (provider) are parsed off summary.json
    expect(run.summary.usage?.total.calls).toBe(400);
    expect(run.summary.panel?.["claude-haiku"]?.provider).toBe("anthropic");
    // served_by is nullable in the real data: anthropic-hosted → null, openrouter → array
    expect(run.summary.panel?.["claude-haiku"]?.served_by).toBeNull();
    expect(Array.isArray(run.summary.panel?.["gpt-oss-20b"]?.served_by)).toBe(true);
  });
});
