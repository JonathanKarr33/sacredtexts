import { describe, it, expect } from "vitest";
import { aggregate, type RunSummary } from "./aggregate";
import { type Summary } from "./localResults";

// A terse Summary builder for the rollup tests.
function runSummary(
  runId: string,
  mtimeMs: number,
  models: Summary["models"],
  panel?: Summary["panel"],
): RunSummary {
  return { runId, mtimeMs, summary: { models, by_tradition: {}, panel } };
}

const ANTHROPIC = { claude: { provider: "anthropic", model: "claude-haiku-5-5", endpoint: "api.anthropic.com", served_by: null } };

describe("aggregate — current standings rollup", () => {
  it("sources a re-benchmarked model from the NEWER run (most recent by mtime)", () => {
    const older = runSummary(
      "run-a",
      1,
      { claude: { retrieve_quote: { n: 2, accuracy: 0.2 }, _overall: { n: 2, accuracy: 0.2 } } },
      ANTHROPIC,
    );
    const newer = runSummary(
      "run-b",
      2,
      { claude: { retrieve_quote: { n: 2, accuracy: 0.5 }, _overall: { n: 2, accuracy: 0.5 } } },
      ANTHROPIC,
    );
    const { rows } = aggregate([older, newer]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.runId).toBe("run-b");
    expect(rows[0]!.overall?.accuracy).toBe(0.5);
    // run order in the input must not matter — newer still wins.
    expect(aggregate([newer, older]).rows[0]!.runId).toBe("run-b");
  });

  it("keeps a model that appears in only the older run (sourced from that run)", () => {
    const older = runSummary(
      "run-a",
      1,
      {
        claude: { _overall: { n: 2, accuracy: 0.2 } },
        legacy: { _overall: { n: 2, accuracy: 0.1 } },
      },
      { ...ANTHROPIC, legacy: { provider: "openai", model: "legacy-x", endpoint: "e", served_by: null } },
    );
    const newer = runSummary("run-b", 2, { claude: { _overall: { n: 2, accuracy: 0.5 } } }, ANTHROPIC);
    const { rows } = aggregate([older, newer]);
    const byModel = Object.fromEntries(rows.map((r) => [r.modelId, r]));
    expect(byModel.claude!.runId).toBe("run-b"); // re-benchmarked → newer
    expect(byModel.legacy!.runId).toBe("run-a"); // older-only → still present from A
  });

  it("dedupes a renamed model_id with the SAME panel identity to one row (the newer run)", () => {
    // Same (provider, model) under two different display ids across runs.
    const older = runSummary(
      "run-a",
      1,
      { "claude-haiku": { _overall: { n: 2, accuracy: 0.2 } } },
      { "claude-haiku": ANTHROPIC.claude },
    );
    const newer = runSummary(
      "run-b",
      2,
      { "claude-haiku-5-5": { _overall: { n: 2, accuracy: 0.5 } } },
      { "claude-haiku-5-5": ANTHROPIC.claude },
    );
    const { rows } = aggregate([older, newer]);
    expect(rows).toHaveLength(1); // one identity, not two
    expect(rows[0]!.runId).toBe("run-b");
    expect(rows[0]!.modelId).toBe("claude-haiku-5-5"); // the newer run's display label
    expect(rows[0]!.provider).toBe("anthropic");
    expect(rows[0]!.model).toBe("claude-haiku-5-5");
  });

  it("degrades gracefully for a run with no panel: keys on model_id, provider/model null", () => {
    const noPanel = runSummary("run-a", 1, {
      mystery: { retrieve_quote: { n: 2, accuracy: 0.3 }, _overall: { n: 2, accuracy: 0.3 } },
    });
    const { rows } = aggregate([noPanel]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe("mystery");
    expect(rows[0]!.provider).toBeNull();
    expect(rows[0]!.model).toBeNull();
    expect(rows[0]!.overall?.accuracy).toBe(0.3);
  });

  it("ranks like the leaderboard: overall desc, null-overall last, model id tiebreak", () => {
    const run = runSummary("r", 1, {
      zeta: { _overall: { n: 1, accuracy: 0.9 } },
      alpha: { _overall: { n: 1, accuracy: 0.9 } }, // tie with zeta → id asc puts alpha first
      beta: { _overall: { n: 0, accuracy: null } }, // null → last
      gamma: { _overall: { n: 1, accuracy: 0.1 } },
    });
    const { rows } = aggregate([run]);
    expect(rows.map((r) => r.modelId)).toEqual(["alpha", "zeta", "gamma", "beta"]);
  });

  it("tasks are the sorted union across runs", () => {
    const a = runSummary("run-a", 1, { m1: { retrieve_quote: { n: 1, accuracy: 1 }, _overall: { n: 1, accuracy: 1 } } }, { m1: { provider: "p", model: "m1", endpoint: "e", served_by: null } });
    const b = runSummary("run-b", 2, { m2: { complete_unit: { n: 1, accuracy: 1 }, _overall: { n: 1, accuracy: 1 } } }, { m2: { provider: "p", model: "m2", endpoint: "e", served_by: null } });
    const { tasks } = aggregate([a, b]);
    expect(tasks).toEqual(["complete_unit", "retrieve_quote"]);
  });

  it("keys on tools: same (provider, model) with different tools stays two rows", () => {
    // Approach B: the on/off arms of one model are distinct standings identities.
    const off = runSummary("run-a", 1, { m: { _overall: { n: 1, accuracy: 0.3 } } }, {
      m: { provider: "anthropic", model: "claude-haiku-5-5", tools: [], endpoint: "e", served_by: null },
    });
    const on = runSummary("run-b", 2, { m: { _overall: { n: 1, accuracy: 0.6 } } }, {
      m: { provider: "anthropic", model: "claude-haiku-5-5", tools: ["web_search"], endpoint: "e", served_by: null },
    });
    const { rows } = aggregate([off, on]);
    expect(rows).toHaveLength(2);
    const byTools = Object.fromEntries(rows.map((r) => [r.tools.join(","), r]));
    expect(byTools[""]!.runId).toBe("run-a");
    expect(byTools["web_search"]!.runId).toBe("run-b");
  });

  it("dedupes same (provider, model, tools) across runs, and treats missing tools as []", () => {
    // run-a's entry omits `tools` entirely; run-b sets it to the explicit empty list. They
    // must key identically (missing ⇒ []) and dedupe to the newer run's row.
    const noField = runSummary("run-a", 1, { m: { _overall: { n: 1, accuracy: 0.2 } } }, {
      m: { provider: "anthropic", model: "claude-haiku-5-5", endpoint: "e", served_by: null },
    });
    const emptyList = runSummary("run-b", 2, { m: { _overall: { n: 1, accuracy: 0.9 } } }, {
      m: { provider: "anthropic", model: "claude-haiku-5-5", tools: [], endpoint: "e", served_by: null },
    });
    const { rows } = aggregate([noField, emptyList]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.runId).toBe("run-b"); // newer wins the shared key
    expect(rows[0]!.tools).toEqual([]);
  });

  it("sorts tools into the key so order in the panel entry doesn't fork the row", () => {
    const a = runSummary("run-a", 1, { m: { _overall: { n: 1, accuracy: 0.2 } } }, {
      m: { provider: "p", model: "x", tools: ["a", "b"], endpoint: "e", served_by: null },
    });
    const b = runSummary("run-b", 2, { m: { _overall: { n: 1, accuracy: 0.8 } } }, {
      m: { provider: "p", model: "x", tools: ["b", "a"], endpoint: "e", served_by: null },
    });
    const { rows } = aggregate([a, b]);
    expect(rows).toHaveLength(1); // same tool-set, different order → one identity
    expect(rows[0]!.tools).toEqual(["a", "b"]); // key carries the sorted set
  });

  it("breaks an exact recency tie by run id ascending — matching the run index's newest-first order", () => {
    // No dates/generated_at → recency falls back to mtime; equal mtime ties, so the smaller
    // id is "most recent"; standings must agree (run-a wins, regardless of input order).
    const a = runSummary("run-a", 5, { claude: { _overall: { n: 1, accuracy: 0.2 } } }, ANTHROPIC);
    const b = runSummary("run-b", 5, { claude: { _overall: { n: 1, accuracy: 0.8 } } }, ANTHROPIC);
    expect(aggregate([a, b]).rows[0]!.runId).toBe("run-a");
    expect(aggregate([b, a]).rows[0]!.runId).toBe("run-a");
  });

  it("sources the standing from the run with the newer generated_at even when mtimes collapse (Issue #7)", () => {
    // The fresh-clone bug: both runs share the checkout mtime. By mtime+id-asc the OLDER,
    // id-smaller run ("a-older") would wrongly win and report its stale accuracy. The newer
    // generated_at must decide instead — the id tiebreak must NOT get a chance to fire.
    const olderNewerId = runSummary(
      "z-run-2026-10-10", // id sorts LAST, so id-asc alone could not rescue it
      42,
      { claude: { _overall: { n: 1, accuracy: 0.9 } } },
      ANTHROPIC,
    );
    olderNewerId.summary.generated_at = "2026-10-12T00:00:00+00:00"; // the actually-newer run
    const newerOlderId = runSummary(
      "a-run-2026-10-10", // id sorts FIRST (would win a naive mtime+id-asc tiebreak)
      42, // same collapsed mtime
      { claude: { _overall: { n: 1, accuracy: 0.1 } } },
      ANTHROPIC,
    );
    newerOlderId.summary.generated_at = "2026-10-11T00:00:00+00:00"; // the older run
    for (const order of [[olderNewerId, newerOlderId], [newerOlderId, olderNewerId]]) {
      const { rows } = aggregate(order);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.runId).toBe("z-run-2026-10-10"); // newer generated_at wins over id-asc
      expect(rows[0]!.overall?.accuracy).toBe(0.9);
      expect(rows[0]!.recencyMs).toBe(Date.parse("2026-10-12T00:00:00+00:00"));
    }
  });

  it("falls back to the run-id date for recency when generated_at is absent (collapsed mtimes)", () => {
    // Neither run has generated_at (pre-Issue-#7 evidence); both share the checkout mtime.
    // The id date must order them — the Oct-12 run wins over the id-smaller Oct-11 run.
    const oct11 = runSummary("alpha-2026-10-11", 7, { claude: { _overall: { n: 1, accuracy: 0.1 } } }, ANTHROPIC);
    const oct12 = runSummary("beta-2026-10-12", 7, { claude: { _overall: { n: 1, accuracy: 0.8 } } }, ANTHROPIC);
    expect(aggregate([oct11, oct12]).rows[0]!.runId).toBe("beta-2026-10-12");
    expect(aggregate([oct12, oct11]).rows[0]!.runId).toBe("beta-2026-10-12");
  });
});
