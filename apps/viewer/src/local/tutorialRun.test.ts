// Verifies the viewer's own loadRun() + aggregate() render the COMMITTED Spec-3 tutorial
// run (runs/tutorial-2026-10-11) end-to-end — the artifacts `score` actually wrote, not a
// fixture — with ZERO app source changes (this is a test-only file). It pins two things the
// Spec-3 acceptance requires of the merged viewer:
//   1. the run loads as a 4-entry panel (2 models x web-search on/off) over 400 joined cells;
//   2. standings keeps the four search-on/off entries as FOUR DISTINCT rows and does not
//      collide with the earlier first-run's `claude-haiku-5-5` row (the tools setting is part
//      of each entry's panel identity: `[web_search]` / `[no-tools]`).
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
    // The tools setting is encoded into each entry's panel `model` identity so on/off are
    // distinguishable to the viewer with no code change.
    expect(run.summary.panel?.["haiku"]?.model).toBe("claude-haiku-5-5 [no-tools]");
    expect(run.summary.panel?.["haiku-search"]?.model).toBe("claude-haiku-5-5 [web_search]");
    expect(run.summary.panel?.["opus"]?.model).toBe("claude-opus-5-5 [no-tools]");
    expect(run.summary.panel?.["opus-search"]?.model).toBe("claude-opus-5-5 [web_search]");
    expect(
      Object.values(run.summary.panel ?? {}).every((p) => p.provider === "anthropic"),
    ).toBe(true);
  });

  it("standings keeps four distinct rows and does not collide with first-run's claude-haiku", async () => {
    const tBase = "/runs/tutorial-2026-10-11";
    const fBase = "/runs/first-run-2026-10-11";
    const tutorial = await loadRun(tBase, diskFetcher(tutorialDir, tBase));
    const firstRun = await loadRun(fBase, diskFetcher(firstRunDir, fBase));
    expect(tutorial.ok && firstRun.ok).toBe(true);
    if (!tutorial.ok || !firstRun.ok) return;

    // Aggregate both runs exactly as StandingsPage would. mtimes only decide "most recent
    // wins" WITHIN a key; the distinct keys here never contend, so both runs' rows survive.
    const runs: RunSummary[] = [
      { runId: "first-run-2026-10-11", mtimeMs: 1, summary: firstRun.summary },
      { runId: "tutorial-2026-10-11", mtimeMs: 2, summary: tutorial.summary },
    ];
    const { rows } = aggregate(runs);
    const keys = new Set(rows.map((r) => r.key));

    // The four tutorial entries are four DISTINCT standings keys (search-on/off not collapsed).
    const tutorialKeys = [
      "anthropic\u0000claude-haiku-5-5 [no-tools]",
      "anthropic\u0000claude-haiku-5-5 [web_search]",
      "anthropic\u0000claude-opus-5-5 [no-tools]",
      "anthropic\u0000claude-opus-5-5 [web_search]",
    ];
    for (const k of tutorialKeys) expect(keys.has(k)).toBe(true);

    // first-run's bare `claude-haiku-5-5` row is a DIFFERENT key — the no-tools tutorial
    // entry did not replace it.
    const firstRunHaikuKey = "anthropic\u0000claude-haiku-5-5";
    expect(firstRunHaikuKey).not.toBe(tutorialKeys[0]);
    expect(keys.has(firstRunHaikuKey)).toBe(true);

    // first-run's claude-haiku row still points at first-run, not the tutorial run.
    const haikuRow = rows.find((r) => r.key === firstRunHaikuKey);
    expect(haikuRow?.runId).toBe("first-run-2026-10-11");

    // Total rows: 4 anthropic (tutorial) + 1 anthropic + 3 openai (first-run) = 8.
    expect(rows).toHaveLength(8);
  });

  it("the leaderboard ranks the four entries and carries per-tradition + token columns", async () => {
    const base = "/runs/tutorial-2026-10-11";
    const run = await loadRun(base, diskFetcher(tutorialDir, base));
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    const { tasks, rows } = leaderboardRows(run.summary);
    expect(tasks).toEqual(["retrieve_quote"]);
    // Four rows, ranked by overall accuracy desc with model_id as the tiebreak. Under the
    // Spec 15 contains_reference headline the search-on arms rise: opus-search 74%, opus 66%,
    // haiku-search 52%, haiku 47% (the +8 / +12 wrapped-exact flips lift the two tool arms).
    expect(rows.map((r) => r.modelId)).toEqual(["opus-search", "opus", "haiku-search", "haiku"]);
    const acc = rows.map((r) => r.overall?.accuracy ?? -1);
    expect(acc).toEqual([...acc].sort((a, b) => b - a)); // non-increasing
    expect(rows[0].overall?.accuracy).toBeCloseTo(0.74, 5);
    expect(rows[3].overall?.accuracy).toBeCloseTo(0.47, 5);
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
    // headline-`correct` count matching summary.md (haiku-search = 52/100 under Spec 15's
    // contains_reference headline — up from 40 as the 12 wrapped-exact Qur'an cells now pass).
    const hs = modelQuestions(run.results, "haiku-search");
    expect(hs).toHaveLength(100);
    const stats = questionStats(hs);
    expect(stats.total).toBe(100);
    expect(stats.missing).toBe(0);
    expect(stats.correct).toBe(52);
    expect(stats.correct + stats.wrong + stats.missing).toBe(100);

    // The tradition filter composes: all three traditions present, Sunni Islam is 33 of them.
    expect(explorerTraditions(hs)).toEqual(["Judaism", "Protestant Christian", "Sunni Islam"]);
    expect(filterQuestions(hs, { tradition: "Sunni Islam" })).toHaveLength(33);
  });
});
