// Verifies the viewer's own loadRun() + aggregate() render the COMMITTED tutorial run
// (runs/tutorial-2026-10-11) end-to-end — the artifacts `score` actually wrote, not a
// fixture. It pins two things the merged viewer requires under Approach B (Spec 11):
//   1. the run loads as a 4-entry panel (2 models x web-search on/off) over 400 joined
//      cells, each entry carrying the RAW `panel.model` (no marker) + a real `panel.tools`
//      field;
//   2. standings keeps the four search-on/off entries as FOUR DISTINCT rows (the standings
//      key now incorporates tools), while the tutorial's no-tools haiku entry COLLIDES with
//      the earlier first-run's bare `claude-haiku-5-5` row — so that stale row is now
//      supersedable (dedupe), not orphaned as it was under the Spec-8 marker.
// Mirrors realRun.test.ts; skips cleanly when the (gitignore-negated) run is absent.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRun } from "../lib/localResults";
import { aggregate, type RunSummary } from "../lib/aggregate";
import { leaderboardRows, traditionRows, hasTraditionData } from "../lib/leaderboard";
import { modelQuestions, questionStats, filterQuestions, explorerTraditions } from "../lib/explorer";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const tutorialDir = resolve(root, "runs/tutorial-2026-10-11");
const firstRunDir = resolve(root, "runs/first-run-2026-10-11");
const present =
  existsSync(resolve(tutorialDir, "summary.json")) &&
  existsSync(resolve(firstRunDir, "summary.json"));

function diskFetcher(runDir: string, base: string): typeof fetch {
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

describe.skipIf(!present)("committed tutorial run renders through the viewer", () => {
  it("loadRun parses the 4-entry search-on/off panel and joins all 400 cells", async () => {
    const base = "/runs/tutorial-2026-10-11";
    const run = await loadRun(base, diskFetcher(tutorialDir, base));
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    // 2 models x search-{on,off} = 4 panel entries, 100 questions each = 400 joined cells.
    expect(Object.keys(run.summary.models).sort()).toEqual(
      ["haiku", "haiku-search", "opus", "opus-search"],
    );
    expect(run.results).toHaveLength(400);
    expect(run.results.every((r) => r.prompt && r.task === "retrieve_quote")).toBe(true);
    expect(run.results.some((r) => r.correct)).toBe(true); // the run discriminates
    expect(run.results.every((r) => !r.missing)).toBe(true); // committed run has missing: 0
    expect(run.results.some((r) => typeof r.token_f1 === "number")).toBe(true);
    expect(run.summary.usage?.total.calls).toBe(400);
    // Approach B: `panel.model` is the RAW API id (no marker) and the tools setting lives in
    // a real `panel.tools` field, so the two arms share a model id but differ by tools.
    expect(run.summary.panel?.["haiku"]?.model).toBe("claude-haiku-5-5");
    expect(run.summary.panel?.["haiku-search"]?.model).toBe("claude-haiku-5-5");
    expect(run.summary.panel?.["opus"]?.model).toBe("claude-opus-5-5");
    expect(run.summary.panel?.["opus-search"]?.model).toBe("claude-opus-5-5");
    expect(run.summary.panel?.["haiku"]?.tools ?? []).toEqual([]);
    expect(run.summary.panel?.["haiku-search"]?.tools).toEqual(["web_search"]);
    expect(run.summary.panel?.["opus"]?.tools ?? []).toEqual([]);
    expect(run.summary.panel?.["opus-search"]?.tools).toEqual(["web_search"]);
    expect(
      Object.values(run.summary.panel ?? {}).every((p) => p.provider === "anthropic"),
    ).toBe(true);
  });

  it("standings keeps four distinct tool-arm rows and dedupes the no-tools haiku against first-run", async () => {
    const tBase = "/runs/tutorial-2026-10-11";
    const fBase = "/runs/first-run-2026-10-11";
    const tutorial = await loadRun(tBase, diskFetcher(tutorialDir, tBase));
    const firstRun = await loadRun(fBase, diskFetcher(firstRunDir, fBase));
    expect(tutorial.ok && firstRun.ok).toBe(true);
    if (!tutorial.ok || !firstRun.ok) return;

    // Aggregate both runs exactly as StandingsPage would. Recency (generated_at → run-id date
    // → mtime) only decides "most recent wins" WITHIN a key; the four distinct tutorial keys
    // never contend, so all four survive regardless of recency. The shared no-tools haiku key
    // DOES contend with first-run — see the directional assertion below.
    // We give first-run the LARGER mtime to prove mtime is not the decider post-#7.
    const runs: RunSummary[] = [
      { runId: "first-run-2026-10-11", mtimeMs: 9, summary: firstRun.summary },
      { runId: "tutorial-2026-10-11", mtimeMs: 1, summary: tutorial.summary },
    ];
    const { rows } = aggregate(runs);
    const keys = new Set(rows.map((r) => r.key));

    // The four tutorial entries are four DISTINCT standings keys: the model id is shared
    // across each on/off pair, but the sorted-tools segment of the key keeps them apart.
    const haikuNoTools = "anthropic\u0000claude-haiku-5-5\u0000";
    const tutorialKeys = [
      haikuNoTools,
      "anthropic\u0000claude-haiku-5-5\u0000web_search",
      "anthropic\u0000claude-opus-5-5\u0000",
      "anthropic\u0000claude-opus-5-5\u0000web_search",
    ];
    expect(new Set(tutorialKeys).size).toBe(4);
    for (const k of tutorialKeys) expect(keys.has(k)).toBe(true);

    // Approach B inverts the Spec-8 property: first-run's bare `claude-haiku-5-5` (no tools
    // field ⇒ []) now keys IDENTICALLY to the tutorial's no-tools haiku entry, so the two
    // dedupe into a single standings row rather than orphaning the stale first-run row.
    // Derive first-run's key from its ACTUAL committed panel entry (not a hand-copied
    // literal) and prove it equals the tutorial's no-tools key.
    const fp = firstRun.summary.panel?.["claude-haiku"];
    expect(fp).toBeDefined();
    const firstRunHaikuKey = `${fp!.provider}\u0000${fp!.model}\u0000${[...(fp!.tools ?? [])].sort().join(",")}`;
    expect(firstRunHaikuKey).toBe(haikuNoTools);

    // Only ONE row carries that shared key (collision proven), and — because tools off and
    // on are distinct keys — there are exactly two haiku-5-5 rows in all.
    const haikuRows = rows.filter((r) => r.model === "claude-haiku-5-5");
    expect(haikuRows).toHaveLength(2);
    expect(haikuRows.filter((r) => r.key === haikuNoTools)).toHaveLength(1);

    // Post-#7 recency genuinely picks the tutorial for the shared no-tools haiku key, even in
    // a fresh clone: both run ids embed 2026-10-11, but the tutorial carries a generated_at
    // (2026-10-12) while first-run has none, so the tutorial's timestamp outranks first-run's
    // run-id-date fallback. first-run has the larger mtime here, yet still loses — proving
    // mtime is not consulted. Under the Spec-8 marker this dedupe was impossible; now the
    // stale first-run haiku row is correctly superseded by the newer tutorial run.
    const sharedRow = rows.find((r) => r.key === haikuNoTools);
    expect(sharedRow?.runId).toBe("tutorial-2026-10-11");

    // Total rows: 4 tutorial arms + first-run's {llama, gemma, gpt-oss} = 7 (first-run's
    // claude-haiku folded into the tutorial no-tools row). Was 8 under the Spec-8 marker.
    expect(rows).toHaveLength(7);
  });

  it("the leaderboard ranks the four entries and carries per-tradition + token columns", async () => {
    const base = "/runs/tutorial-2026-10-11";
    const run = await loadRun(base, diskFetcher(tutorialDir, base));
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    const { tasks, rows } = leaderboardRows(run.summary);
    expect(tasks).toEqual(["retrieve_quote"]);
    // Four rows, ranked by overall accuracy desc with model_id as the tiebreak: the two
    // 66% opus entries first (opus < opus-search), then haiku (47%), then haiku-search (40%).
    expect(rows.map((r) => r.modelId)).toEqual(["opus", "opus-search", "haiku", "haiku-search"]);
    const acc = rows.map((r) => r.overall?.accuracy ?? -1);
    expect(acc).toEqual([...acc].sort((a, b) => b - a)); // non-increasing
    expect(rows[0]!.overall?.accuracy).toBeCloseTo(0.66, 5);
    expect(rows[3]!.overall?.accuracy).toBeCloseTo(0.4, 5);
    // Each row carries its per-model token totals (the leaderboard's token column).
    expect(rows.every((r) => r.tokens && r.tokens.calls === 100)).toBe(true);

    // The per-tradition breakdown renders: every entry has all three traditions.
    expect(hasTraditionData(run.summary)).toBe(true);
    const tRows = traditionRows(run.summary, tasks);
    const traditionsFor = (modelId: string) =>
      tRows.filter((r) => r.modelId === modelId).map((r) => r.tradition).sort();
    expect(traditionsFor("opus-search")).toEqual([
      "Judaism",
      "Protestant Christian",
      "Sunni Islam",
    ]);
  });

  it("the error explorer drills into a model with the expected pass/fail/missing counts", async () => {
    const base = "/runs/tutorial-2026-10-11";
    const run = await loadRun(base, diskFetcher(tutorialDir, base));
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    // Drill into one search-on model: its 100 roster questions, no missing cells, and the
    // headline-`correct` count matching summary.md (haiku-search = 40/100).
    const hs = modelQuestions(run.results, "haiku-search");
    expect(hs).toHaveLength(100);
    const stats = questionStats(hs);
    expect(stats.total).toBe(100);
    expect(stats.missing).toBe(0);
    expect(stats.correct).toBe(40);
    expect(stats.correct + stats.wrong + stats.missing).toBe(100);

    // The tradition filter composes: all three traditions present, Sunni Islam is 33 of them.
    expect(explorerTraditions(hs)).toEqual(["Judaism", "Protestant Christian", "Sunni Islam"]);
    expect(filterQuestions(hs, { tradition: "Sunni Islam" })).toHaveLength(33);
  });
});
