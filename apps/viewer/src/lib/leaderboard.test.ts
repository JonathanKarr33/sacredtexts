import { describe, it, expect } from "vitest";
import type { Summary } from "./localResults";
import {
  formatTokens,
  hasTraditionData,
  leaderboardRows,
  searchContrast,
  traditionRows,
} from "./leaderboard";

describe("leaderboard derivation", () => {
  const summary: Summary = {
    models: {
      // Deliberately out of rank order and with a tie + a null-overall model.
      beta: { retrieve_quote: { n: 10, accuracy: 0.0 }, _overall: { n: 10, accuracy: 0.0 } },
      alpha: { retrieve_quote: { n: 10, accuracy: 0.0 }, _overall: { n: 10, accuracy: 0.0 } },
      top: { retrieve_quote: { n: 10, accuracy: 0.9 }, _overall: { n: 10, accuracy: 0.9 } },
      nodata: { _overall: { n: 0, accuracy: null } },
    },
    by_tradition: {
      top: { Judaism: { retrieve_quote: { n: 5, accuracy: 1.0 }, _overall: { n: 5, accuracy: 1.0 } } },
    },
    usage: {
      per_model: {
        top: { calls: 10, in: 100, out: 200 },
        alpha: { calls: 10, in: 50, out: 60 },
      },
      total: { calls: 40, in: 500, out: 600 },
    },
  };

  it("ranks by overall desc, model_id tiebreak, null-overall last", () => {
    const { rows } = leaderboardRows(summary);
    expect(rows.map((r) => r.modelId)).toEqual(["top", "alpha", "beta", "nodata"]);
  });

  it("derives one task column and carries each model's overall + token totals", () => {
    const { tasks, rows } = leaderboardRows(summary);
    expect(tasks).toEqual(["retrieve_quote"]);
    const top = rows.find((r) => r.modelId === "top")!;
    expect(top.overall?.accuracy).toBe(0.9);
    expect(top.byTask.retrieve_quote?.accuracy).toBe(0.9);
    expect(top.tokens).toEqual({ calls: 10, in: 100, out: 200 });
    // A model absent from usage carries null token totals, not a crash.
    expect(rows.find((r) => r.modelId === "beta")!.tokens).toBeNull();
  });

  it("formats token totals (and a missing one)", () => {
    expect(formatTokens({ calls: 100, in: 5810, out: 41140 })).toBe("5,810 in · 41,140 out · 100 calls");
    expect(formatTokens(null)).toBe("—");
  });

  it("builds per-(model,tradition) rows and reports tradition presence", () => {
    expect(hasTraditionData(summary)).toBe(true);
    const tRows = traditionRows(summary, ["retrieve_quote"]);
    expect(tRows).toHaveLength(1);
    expect(tRows[0]).toMatchObject({ modelId: "top", tradition: "Judaism" });
    expect(tRows[0]!.overall?.accuracy).toBe(1.0);
  });

  it("omits the by-tradition section on emptiness, not truthiness (parseSummary normalizes {} )", () => {
    const noTrad: Summary = { models: summary.models, by_tradition: {} };
    expect(hasTraditionData(noTrad)).toBe(false);
    expect(traditionRows(noTrad, ["retrieve_quote"])).toEqual([]);
  });
});

describe("searchContrast (search on/off pairing, Spec 15 phase 3)", () => {
  const summary: Summary = {
    models: {
      "m-on": { retrieve_quote: { n: 100, accuracy: 0.9, coverage: 0.8 }, _overall: { n: 100, accuracy: 0.9, coverage: 0.8 } },
      "m-off": { retrieve_quote: { n: 100, accuracy: 1.0, coverage: 0.6 }, _overall: { n: 100, accuracy: 1.0, coverage: 0.6 } },
      solo: { retrieve_quote: { n: 100, accuracy: 0.5, coverage: 1.0 }, _overall: { n: 100, accuracy: 0.5, coverage: 1.0 } },
    },
    by_tradition: {},
    // Approach B: the model id is raw and the tool arm is `panel.tools` (non-empty = ON, empty = OFF).
    // m-on/m-off share the raw model `claude-x` and differ only by tools → they pair; `solo` (claude-y)
    // has only an OFF arm → dropped.
    panel: {
      "m-on": { provider: "anthropic", model: "claude-x", tools: ["web_search"], endpoint: "e", served_by: null },
      "m-off": { provider: "anthropic", model: "claude-x", tools: [], endpoint: "e", served_by: null },
      solo: { provider: "anthropic", model: "claude-y", tools: [], endpoint: "e", served_by: null }, // unpaired
    },
  };

  it("pairs the on/off arms (by tools) of a shared model and drops an unpaired arm", () => {
    const pairs = searchContrast(summary);
    expect(pairs.map((p) => p.base)).toEqual(["claude-x"]); // 'claude-y' has no web_search arm
    expect(pairs[0]!.on.modelId).toBe("m-on");
    expect(pairs[0]!.off.modelId).toBe("m-off");
    expect(pairs[0]!.on.overall?.accuracy).toBe(0.9);
    expect(pairs[0]!.off.overall?.coverage).toBe(0.6);
  });

  it("returns [] when the run has no panel — the no-pair fallback (e.g. first-run)", () => {
    expect(searchContrast({ models: summary.models, by_tradition: {} })).toEqual([]);
  });
});
