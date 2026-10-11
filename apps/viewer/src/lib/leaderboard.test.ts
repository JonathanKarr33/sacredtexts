import { describe, it, expect } from "vitest";
import type { Summary } from "./localResults";
import {
  formatTokens,
  hasTraditionData,
  leaderboardRows,
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
