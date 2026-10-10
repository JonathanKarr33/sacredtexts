import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyJudgeRoles,
  COMBINED_SCORE_KEY,
  computeLeaderboardRows,
  computeStandings,
  isRankingJudge,
  isSortableColumn,
  type LeaderboardRow,
  rankingJudgeModel,
  sortRows,
  subjectDrilldownRows,
  traditionValue,
} from "./leaderboard";
import { parseResultsManifest, parseResultsShard, type ResultsManifest, type ResultsShard } from "./resultsModel";

const manifest: ResultsManifest = {
  schemaVersion: 1,
  runId: "r1",
  generatedAt: "2026-08-06T00:00:00+00:00",
  subjects: ["claude-sonnet-5", "gemini-3.6-flash"],
  judges: [
    { key: "gemini", model: "gemini-3.6-flash", aliases: ["gemini-3.6-flash"], fullGrid: true },
    { key: "opus", model: "claude-opus-4-8", aliases: ["claude-opus-4-8"], fullGrid: false },
  ],
  framings: ["unstated", "stated", "guided"],
  pressures: ["secularize", "insistence"],
  pressureAll: "all",
  scopes: ["turn1", "full"],
  metrics: ["turn1", "full", "steadfastness"],
  traditions: [
    { id: "a", nScenarios: 2, shard: "a.json" },
    { id: "b", nScenarios: 2, shard: "b.json" },
  ],
  coverage: {},
};

function shard(tradition: string, sonnetFullAll: number, sonnetTurn1All: number, steadAll: number): ResultsShard {
  return {
    tradition,
    nScenarios: 2,
    judges: ["gemini-3.6-flash"],
    means: {
      "gemini-3.6-flash": {
        "claude-sonnet-5": {
          unstated: { full: { all: [sonnetFullAll, 2, 2] }, turn1: { all: [sonnetTurn1All, 2, 2] } },
        },
      },
    },
    steadfastness: {
      "gemini-3.6-flash": { "claude-sonnet-5": { unstated: { all: [steadAll, 2] } } },
    },
  };
}

const shards = { a: shard("a", 0.6, 0.2, 0.4), b: shard("b", 0.8, 0.0, 0.8) };

describe("computeStandings — mean of per-tradition means", () => {
  it("post-pressure (full) = equal-weight mean across traditions, ranked desc", () => {
    const st = computeStandings(shards, manifest, { framing: "unstated", metric: "full", pressure: "all" });
    const sonnet = st.find((s) => s.subject === "claude-sonnet-5")!;
    expect(sonnet.value).toBeCloseTo(0.7, 10); // (0.6 + 0.8) / 2
    expect(sonnet.nContributing).toBe(2);
    // gemini subject has no data → value null, sorts last
    expect(st[0]!.subject).toBe("claude-sonnet-5");
    expect(st[st.length - 1]!.value).toBeNull();
  });

  it("first-response (turn1) selects the turn1 slice", () => {
    const st = computeStandings(shards, manifest, { framing: "unstated", metric: "turn1", pressure: "all" });
    expect(st.find((s) => s.subject === "claude-sonnet-5")!.value).toBeCloseTo(0.1, 10); // (0.2 + 0.0)/2
  });

  it("steadfastness reads the steadfastness slice (no client subtraction)", () => {
    const st = computeStandings(shards, manifest, { framing: "unstated", metric: "steadfastness", pressure: "all" });
    expect(st.find((s) => s.subject === "claude-sonnet-5")!.value).toBeCloseTo(0.6, 10); // (0.4 + 0.8)/2
  });

  it("a tradition without coverage for the slice is excluded (not counted as 0)", () => {
    const partial = { a: shards.a }; // only tradition a
    const st = computeStandings(partial, manifest, { framing: "unstated", metric: "full", pressure: "all" });
    const sonnet = st.find((s) => s.subject === "claude-sonnet-5")!;
    expect(sonnet.value).toBeCloseTo(0.6, 10); // just tradition a
    expect(sonnet.nContributing).toBe(1);
  });

  it("rankingJudgeModel is the full-grid judge (Gemini)", () => {
    expect(rankingJudgeModel(manifest)).toBe("gemini-3.6-flash");
  });

  it("#110: ranks by `rankable`, so a full-grid Opus never becomes the ranking judge", () => {
    // Opus is listed FIRST and is now full-grid — but rankable:false keeps ranking on Gemini.
    const m: ResultsManifest = {
      ...manifest,
      judges: [
        { key: "opus", model: "claude-opus-4-8", aliases: ["claude-opus-4-8"], fullGrid: true, rankable: false, coverage: 0.999 },
        { key: "gemini", model: "gemini-3.6-flash", aliases: ["gemini-3.6-flash"], fullGrid: true, rankable: true, coverage: 1.0 },
      ],
    };
    expect(rankingJudgeModel(m)).toBe("gemini-3.6-flash");
    expect(isRankingJudge(m.judges[0]!)).toBe(false); // full-grid Opus is validation, not ranking
    expect(isRankingJudge(m.judges[1]!)).toBe(true);
  });

  it("#110: classifyJudgeRoles splits ranking / full-grid-validation / sample (review prose)", () => {
    const roles = classifyJudgeRoles([
      { key: "gemini", fullGrid: true, rankable: true, coverage: 1.0 },
      { key: "opus", fullGrid: true, rankable: false, coverage: 0.999 },   // full-grid VALIDATION
      { key: "terra", fullGrid: false, rankable: false, coverage: 0.14 },  // sample
    ]);
    expect(roles.ranking.map((j) => j.key)).toEqual(["gemini"]);
    expect(roles.fullGridValidation.map((j) => j.key)).toEqual(["opus"]);  // full-grid but not ranking
    expect(roles.sample.map((j) => j.key)).toEqual(["terra"]);
    // legacy (no rankable): the full-grid judge is ranking, so it is NOT double-counted as validation
    const legacy = classifyJudgeRoles([{ key: "gemini", fullGrid: true }, { key: "opus", fullGrid: false }]);
    expect(legacy.ranking.map((j) => j.key)).toEqual(["gemini"]);
    expect(legacy.fullGridValidation).toEqual([]);
    expect(legacy.sample.map((j) => j.key)).toEqual(["opus"]);
  });

  it("#110: a legacy manifest without `rankable` still ranks Gemini (fullGrid fallback)", () => {
    // `manifest` here has no `rankable` on any judge (pre-#110 shape).
    expect(manifest.judges.every((j) => j.rankable === undefined)).toBe(true);
    expect(rankingJudgeModel(manifest)).toBe("gemini-3.6-flash");
    expect(isRankingJudge(manifest.judges[0]!)).toBe(true);  // gemini fullGrid → ranking
    expect(isRankingJudge(manifest.judges[1]!)).toBe(false); // opus !fullGrid → validation
  });

  it("traditionValue returns coverage for a means cell and null for a missing one", () => {
    const tv = traditionValue(shards.a, "gemini-3.6-flash", "claude-sonnet-5", "unstated", "full", "all", 12);
    expect(tv).toEqual({ tradition: "a", value: 0.6, nJudged: 2, nExpected: 2 }); // means uses cell's own nExpected
    expect(traditionValue(shards.a, "gemini-3.6-flash", "missing", "unstated", "full", "all", 12)).toBeNull();
  });

  it("steadfastness coverage uses the full-grid denominator, not matched_n (Phase-5 badging)", () => {
    const tv = traditionValue(shards.a, "gemini-3.6-flash", "claude-sonnet-5", "unstated", "steadfastness", "all", 12);
    expect(tv).toEqual({ tradition: "a", value: 0.4, nJudged: 2, nExpected: 12 }); // 2/12, not 2/2
  });
});

// #120: the leaderboard ranks on the COMBINED two-judge block when the manifest declares a ranking.
describe("combined two-judge ranking (#120)", () => {
  const rankedManifest: ResultsManifest = {
    ...manifest,
    ranking: {
      rule: "mean_of_judges", scoreKey: "combined",
      judges: ["gemini-3.6-flash", "claude-opus-4-8"], singleJudgeCells: { count: 0 },
    },
  };
  // gem = the Gemini-only value; comb = the combined value (deliberately different so we can tell
  // which block the board ranks on).
  function combinedShard(tradition: string, gem: number, comb: number): ResultsShard {
    return {
      tradition, nScenarios: 2, judges: ["gemini-3.6-flash", "claude-opus-4-8"],
      means: {
        "gemini-3.6-flash": {
          "claude-sonnet-5": { unstated: { full: { all: [gem, 2, 2] }, turn1: { all: [0.1, 2, 2] } } },
        },
      },
      steadfastness: { "gemini-3.6-flash": { "claude-sonnet-5": { unstated: { all: [0.2, 2] } } } },
      combined: {
        "claude-sonnet-5": { unstated: { full: { all: [comb, 2, 2] }, turn1: { all: [0.15, 2, 2] } } },
      },
      combinedSteadfastness: { "claude-sonnet-5": { unstated: { all: [0.25, 2] } } },
    };
  }
  const cshards = { a: combinedShard("a", 0.6, 0.9), b: combinedShard("b", 0.8, 0.7) };

  it("rankingJudgeModel is the ranking.score_key ('combined') when a declaration is present", () => {
    expect(rankingJudgeModel(rankedManifest)).toBe("combined");
  });

  it("legacy manifest (no ranking) still falls back to the rankable/Gemini judge", () => {
    expect(rankingJudgeModel(manifest)).toBe("gemini-3.6-flash");
  });

  it("traditionValue reads the combined block for the combined key, not means[judge]", () => {
    const tv = traditionValue(cshards.a, "combined", "claude-sonnet-5", "unstated", "full", "all", 12);
    expect(tv?.value).toBe(0.9); // the combined value, not the 0.6 Gemini value
    const st = traditionValue(cshards.a, "combined", "claude-sonnet-5", "unstated", "steadfastness", "all", 12);
    expect(st).toEqual({ tradition: "a", value: 0.25, nJudged: 2, nExpected: 12 });
  });

  it("computeLeaderboardRows ranks on the combined block (differs from Gemini-only)", () => {
    const sonnet = computeLeaderboardRows(cshards, rankedManifest, { pressure: "all" })
      .find((r) => r.subject === "claude-sonnet-5")!;
    expect(sonnet.post).toBeCloseTo(0.8, 10); // mean of combined (0.9, 0.7); the Gemini mean is 0.7
  });
});

// Reconciliation against the REAL committed dataset (results/20260803/) — the SPA's mean-of-means
// must equal the paper's standings. Uses the committed artifact (no gitignored symlink needed);
// the paper values are the ones verified end-to-end in the Python export tests.
describe("committed dataset reconciles with the paper (Gemini standings)", () => {
  // vitest runs with cwd = apps/multibrowser; the committed dataset is at <repo>/results/.
  const root = resolve(process.cwd(), "../../results/20260803");
  const manifestPath = `${root}/manifest.json`;
  const hasCommitted = existsSync(manifestPath);
  // Paper standings (subj_overall) for ALL five subjects × three framings — committed here so the
  // reconciliation runs portably (no gitignored launch data needed).
  const PAPER: Record<string, Record<string, number>> = {
    "Qwen/Qwen3-235B-A22B-Instruct-2507": { unstated: -0.44739844429738396, stated: -0.13956766723971545, guided: 0.4360177612491137 },
    "claude-sonnet-5": { unstated: 0.5460820873085531, stated: 0.8389174367798489, guided: 0.955169687941307 },
    "gemini-3.6-flash": { unstated: 0.13878992434644954, stated: 0.5552255169248714, guided: 0.9392007764689806 },
    "gpt-5.6-terra": { unstated: 0.3665434394791269, stated: 0.6595724833623953, guided: 0.8600802417700205 },
    "thinkingmachines/Inkling": { unstated: 0.5434524040736548, stated: 0.8140794388849457, guided: 0.971569450432777 },
  };

  // #120 drift guard: parse the REAL committed manifest + shards with the production parsers
  // (parseResultsManifest/parseResultsShard) and confirm the board ranks on the combined block
  // end-to-end — so an exporter↔SPA schema drift in `ranking`/`combined` is caught. (loadCommitted
  // below deliberately omits ranking/combined to keep the GEMINI reconciliation on Gemini.)
  it.runIf(hasCommitted)("#120: committed manifest+shards parse with ranking+combined; board ranks on combined", () => {
    const { manifest: rm } = parseResultsManifest(readFileSync(manifestPath, "utf8"), "m");
    expect(rm?.ranking?.scoreKey).toBe("combined");
    expect(rankingJudgeModel(rm!)).toBe("combined");
    const shards: Record<string, ResultsShard> = {};
    for (const t of rm!.traditions) {
      const { shard } = parseResultsShard(readFileSync(`${root}/${t.shard}`, "utf8"), "s");
      expect(shard?.combined).toBeDefined();  // the real shard carries the combined block
      shards[t.id] = shard!;
    }
    const rows = computeLeaderboardRows(shards, rm!, { pressure: "all" });
    for (const r of rows) expect(r.post).not.toBeNull();  // combined ranking works on every subject
  });

  // Load the committed manifest + shards once (shape mirrors what queries.ts produces at runtime).
  // Deliberately omits `ranking`/`combined` so the Gemini-standings reconciliation below ranks on
  // Gemini (the paper's Gemini subj_overall); the combined path is covered by the drift guard above.
  function loadCommitted(): { m: ResultsManifest; realShards: Record<string, ResultsShard> } {
    const realManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const m: ResultsManifest = {
      ...manifest,
      subjects: realManifest.subjects,
      judges: realManifest.judges.map((j: { key: string; model: string; aliases: string[]; full_grid: boolean; rankable?: boolean; coverage?: number }) => ({
        key: j.key, model: j.model, aliases: j.aliases, fullGrid: j.full_grid, rankable: j.rankable, coverage: j.coverage,
      })),
      pressures: realManifest.pressures,
      pressureAll: realManifest.pressure_all,
      traditions: realManifest.traditions.map((t: { id: string; n_scenarios: number; shard: string }) => ({
        id: t.id, nScenarios: t.n_scenarios, shard: t.shard,
      })),
    };
    const realShards: Record<string, ResultsShard> = {};
    for (const t of m.traditions) {
      const s = JSON.parse(readFileSync(`${root}/${t.shard}`, "utf8"));
      realShards[t.id] = { tradition: s.tradition, nScenarios: s.n_scenarios, judges: s.judges, means: s.means, steadfastness: s.steadfastness };
    }
    return { m, realShards };
  }

  it.runIf(hasCommitted)("all 5 subjects × 3 framings (full/all) mean-of-means == subj_overall", () => {
    const { m, realShards } = loadCommitted();
    for (const framing of ["unstated", "stated", "guided"]) {
      const st = computeStandings(realShards, m, { framing, metric: "full", pressure: "all" });
      for (const subject of Object.keys(PAPER)) {
        const row = st.find((s) => s.subject === subject)!;
        expect(row.value).toBeCloseTo(PAPER[subject]![framing]!, 9);
        expect(row.nContributing).toBe(7);
      }
    }
  });

  // The named Phase-1 acceptance: the ROW BUILDER's post + strip reconcile with the paper on the
  // committed shards (Phase 2's page test defers exhaustive reconciliation here, so it must live here
  // against computeLeaderboardRows, not only computeStandings).
  it.runIf(hasCommitted)("computeLeaderboardRows: post == paper unstated, mean(non-null strip) == post (all 5)", () => {
    const { m, realShards } = loadCommitted();
    const rows = computeLeaderboardRows(realShards, m, { pressure: "all" });
    for (const subject of Object.keys(PAPER)) {
      const r = rows.find((x) => x.subject === subject)!;
      expect(r.post).toBeCloseTo(PAPER[subject]!.unstated!, 9); // headline == paper (unstated is framings[0])
      const nn = r.strip.map((c) => c.value).filter((v): v is number => v !== null);
      expect(nn).toHaveLength(7); // all 7 traditions covered for Gemini
      expect(nn.reduce((x, y) => x + y, 0) / nn.length).toBeCloseTo(r.post!, 9); // mean(non-null strip) == post
    }
  });

  // Companion to the Δ-distinctness fixture test: on the COMPLETE Gemini grid, matched-cell
  // steadfastness coincides with (full − turn1) to machine precision — so the distinctness the UI
  // must preserve is a property of asymmetric panels (Opus samples), not the Gemini launch data.
  it.runIf(hasCommitted)("Gemini Δ == post − initial on the committed (complete) grid", () => {
    const { m, realShards } = loadCommitted();
    const rows = computeLeaderboardRows(realShards, m, { pressure: "all" });
    for (const r of rows) {
      if (r.post !== null && r.initial !== null && r.delta !== null) {
        expect(r.delta).toBeCloseTo(r.post - r.initial, 9);
      }
    }
  });
});

// Reconciliation against the REAL committed 20260905 superset (Spec 119) — pins the accepted 8-row
// cross-faith numbers of record (protestant-unified 5th of 8; Waleed accepted run 20260905,
// 2026-09-06) the way the 20260803 block protects the record run. Every value is recomputed through
// the production parsers + accessor (parseResultsManifest / parseResultsShard / traditionValue on the
// combined key), so an exporter↔SPA drift that moved a number fails CI rather than shipping silently.
describe("committed 20260905 superset pins the accepted cross-faith numbers", () => {
  const root = resolve(process.cwd(), "../../results/20260905");
  const manifestPath = `${root}/manifest.json`;
  const hasCommitted = existsSync(manifestPath);
  const FRAMINGS = ["unstated", "stated", "guided"] as const;

  // Accepted per-tradition combined mean-of-means (equal-weight over subjects × framings, full/all) —
  // the numbers of record from `experiments/119_protestant_unified/data/output/paper_numbers.json`.
  const ACCEPTED: Record<string, number> = {
    buddhism: 0.6694978632478633,
    "secular-sage": 0.6348639455782313,
    taoism: 0.630787037037037,
    "eastern-christianity": 0.5405136268343816,
    "protestant-unified": 0.48626543209876544,
    judaism: 0.465625,
    "roman-catholicism": 0.3635233918128655,
    "sunni-islam": 0.35966269841269843,
  };
  const EXPECTED_ORDER = [
    "buddhism", "secular-sage", "taoism", "eastern-christianity",
    "protestant-unified", "judaism", "roman-catholicism", "sunni-islam",
  ];

  function loadShards(): { rm: ResultsManifest; shards: Record<string, ResultsShard> } {
    const { manifest: rm } = parseResultsManifest(readFileSync(manifestPath, "utf8"), "m");
    const shards: Record<string, ResultsShard> = {};
    for (const t of rm!.traditions) {
      const { shard } = parseResultsShard(readFileSync(`${root}/${t.shard}`, "utf8"), "s");
      shards[t.id] = shard!;
    }
    return { rm: rm!, shards };
  }

  // Per-tradition ranking score: equal-weight mean over subjects × framings of the combined
  // full/all cell, read via the production `traditionValue` accessor on the combined key.
  function traditionMeanOfMeans(rm: ResultsManifest, shard: ResultsShard): number {
    const judge = rankingJudgeModel(rm); // "combined" for this run
    const vals: number[] = [];
    for (const subject of rm.subjects) {
      for (const framing of FRAMINGS) {
        const tv = traditionValue(shard, judge, subject, framing, "full", "all", 0);
        if (tv) vals.push(tv.value);
      }
    }
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  it.runIf(hasCommitted)("ranks on the combined block over 8 traditions incl protestant-unified", () => {
    const { rm, shards } = loadShards();
    expect(rm.ranking?.scoreKey).toBe(COMBINED_SCORE_KEY);
    expect(rankingJudgeModel(rm)).toBe(COMBINED_SCORE_KEY);
    expect(Object.keys(shards).sort()).toEqual([...EXPECTED_ORDER].sort());
    expect(shards["protestant-unified"]!.combined).toBeDefined();
  });

  it.runIf(hasCommitted)("per-tradition combined mean-of-means == accepted numbers; PU ranks 5th", () => {
    const { rm, shards } = loadShards();
    const values: Record<string, number> = {};
    for (const [id, shard] of Object.entries(shards)) values[id] = traditionMeanOfMeans(rm, shard);

    for (const id of EXPECTED_ORDER) expect(values[id]).toBeCloseTo(ACCEPTED[id]!, 9);

    const order = Object.keys(values).sort((a, b) => values[b]! - values[a]!);
    expect(order).toEqual(EXPECTED_ORDER);
    expect(order.indexOf("protestant-unified")).toBe(4); // 5th of 8 (0-indexed)

    // protestant-unified sits within its accepted 95% CI [+0.368, +0.590].
    expect(values["protestant-unified"]!).toBeGreaterThanOrEqual(0.36804976851851856);
    expect(values["protestant-unified"]!).toBeLessThanOrEqual(0.590204475308642);
  });
});

// ============================================================================================
// Dense-table rows (leaderboard v2): computeLeaderboardRows / sortRows / subjectDrilldownRows.
// ============================================================================================

/** Build a Gemini-judged shard from a flat per-subject spec (only the given slices are present). */
type SubjSpec = { full?: number; turn1?: number; stead?: number; stated?: number; guided?: number };
function mkShard(tradition: string, data: Record<string, SubjSpec>, judge = "gemini-3.6-flash"): ResultsShard {
  const means: ResultsShard["means"] = { [judge]: {} };
  const steadfastness: ResultsShard["steadfastness"] = { [judge]: {} };
  for (const [subj, v] of Object.entries(data)) {
    const byFraming: Record<string, Record<string, Record<string, [number, number, number]>>> = {};
    if (v.full !== undefined || v.turn1 !== undefined) {
      const unstated: Record<string, Record<string, [number, number, number]>> = {};
      if (v.full !== undefined) unstated.full = { all: [v.full, 2, 2] };
      if (v.turn1 !== undefined) unstated.turn1 = { all: [v.turn1, 2, 2] };
      byFraming.unstated = unstated;
    }
    if (v.stated !== undefined) byFraming.stated = { full: { all: [v.stated, 2, 2] } };
    if (v.guided !== undefined) byFraming.guided = { full: { all: [v.guided, 2, 2] } };
    means[judge]![subj] = byFraming;
    if (v.stead !== undefined) steadfastness[judge]![subj] = { unstated: { all: [v.stead, 2] } };
  }
  return { tradition, nScenarios: 2, judges: [judge], means, steadfastness };
}

describe("computeLeaderboardRows — dense rows", () => {
  it("headline + framing columns + strip come from computeStandings (reconcile by construction)", () => {
    const rows = computeLeaderboardRows(shards, manifest, { pressure: "all" });
    const sonnet = rows.find((r) => r.subject === "claude-sonnet-5")!;
    expect(sonnet.post).toBeCloseTo(0.7, 10); // (0.6 + 0.8)/2
    expect(sonnet.initial).toBeCloseTo(0.1, 10); // (0.2 + 0.0)/2
    expect(sonnet.delta).toBeCloseTo(0.6, 10); // (0.4 + 0.8)/2 — from steadfastness slice
    expect(sonnet.byFraming.unstated).toBeCloseTo(0.7, 10); // Post == first-framing column, by definition
    // Every manifest framing id is present as a key (null when absent) — noUncheckedIndexedAccess-safe.
    expect(Object.keys(sonnet.byFraming).sort()).toEqual(["guided", "stated", "unstated"]);
    expect(sonnet.byFraming.stated).toBeNull();
    expect(sonnet.byFraming.guided).toBeNull();
  });

  it("strip is 1:1 with manifest.traditions (null for uncovered) and its non-null mean == post", () => {
    // Only tradition a has data → tradition b is a distinct null strip cell, not omitted, not 0.
    const rows = computeLeaderboardRows({ a: shards.a }, manifest, { pressure: "all" });
    const sonnet = rows.find((r) => r.subject === "claude-sonnet-5")!;
    expect(sonnet.strip.map((c) => c.tradition)).toEqual(["a", "b"]); // manifest order
    const a = sonnet.strip.find((c) => c.tradition === "a")!;
    const b = sonnet.strip.find((c) => c.tradition === "b")!;
    expect(a.value).toBeCloseTo(0.6, 10);
    // the strip carries per-tradition First + Δ for the tooltip, from the same slices (no 2nd path).
    expect(a.initial).toBeCloseTo(0.2, 10); // tradition a turn1
    expect(a.delta).toBeCloseTo(0.4, 10); // tradition a steadfastness
    expect(b.value).toBeNull();
    expect(b.nJudged).toBe(0); // uncovered cell: zero numerator
    expect(b.nExpected).toBe(2 * manifest.pressures.length); // manifest-derived denominator for "all"
    const nonNull = sonnet.strip.map((c) => c.value).filter((v): v is number => v !== null);
    const mean = nonNull.reduce((x, y) => x + y, 0) / nonNull.length;
    expect(mean).toBeCloseTo(sonnet.post!, 10); // mean(non-null strip) == post
  });

  it("rows come back in canonical rank order; rank is by post desc, nulls last", () => {
    const rows = computeLeaderboardRows(shards, manifest, { pressure: "all" });
    expect(rows[0]!.subject).toBe("claude-sonnet-5"); // has data
    expect(rows[0]!.rank).toBe(1);
    expect(rows[rows.length - 1]!.post).toBeNull(); // gemini subject: no data → last
    expect(rows[rows.length - 1]!.rank).toBe(rows.length);
  });

  it("cross-column assembly joins by subject id, NOT array index — for EVERY column (positional-zip guard)", () => {
    // Each column's ordering between the two subjects differs from the post-order, so a positional
    // zip over post-order would misattribute that column. Orderings (sonnet vs gemini-subject):
    //   post(full):   sonnet 0.9 > gemini 0.5   (this is the row/rank order)
    //   initial:      gemini 0.7 > sonnet 0.1
    //   delta(stead): gemini 0.8 > sonnet 0.2
    //   stated:       gemini 0.6 > sonnet 0.3
    //   guided:       sonnet 0.95 > gemini 0.05
    const cross = {
      a: mkShard("a", {
        "claude-sonnet-5": { full: 0.9, turn1: 0.1, stead: 0.2, stated: 0.3, guided: 0.95 },
        "gemini-3.6-flash": { full: 0.5, turn1: 0.7, stead: 0.8, stated: 0.6, guided: 0.05 },
      }),
    };
    const rows = computeLeaderboardRows(cross, manifest, { pressure: "all" });
    // For each column, assert BOTH subjects' values equal a direct single-slice computeStandings lookup.
    const direct = (framing: string, metric: "turn1" | "full" | "steadfastness") => {
      const st = computeStandings(cross, manifest, { framing, metric, pressure: "all" });
      return (s: string) => st.find((x) => x.subject === s)!.value;
    };
    const initOf = direct("unstated", "turn1");
    const deltaOf = direct("unstated", "steadfastness");
    const statedOf = direct("stated", "full");
    const guidedOf = direct("guided", "full");
    for (const s of ["claude-sonnet-5", "gemini-3.6-flash"]) {
      const row = rows.find((r) => r.subject === s)!;
      expect(row.initial).toBeCloseTo(initOf(s)!, 10);
      expect(row.delta).toBeCloseTo(deltaOf(s)!, 10);
      expect(row.byFraming.stated).toBeCloseTo(statedOf(s)!, 10);
      expect(row.byFraming.guided).toBeCloseTo(guidedOf(s)!, 10);
    }
    // Spot-check the exact misattribution a zip would produce: sonnet must keep its OWN low values.
    const sonnet = rows.find((r) => r.subject === "claude-sonnet-5")!;
    expect(sonnet.initial).toBeCloseTo(0.1, 10); // not gemini's 0.7
    expect(sonnet.delta).toBeCloseTo(0.2, 10); // not gemini's 0.8
    expect(sonnet.byFraming.stated).toBeCloseTo(0.3, 10); // not gemini's 0.6
  });

  it("ignores non-ranking-judge (Opus) data — the board is always the ranking judge by construction", () => {
    // Behavioral guarantee (stronger than a Function.length proxy): adding Opus judge data must not
    // change a single row, because computeLeaderboardRows takes no judge and hardwires the ranking one.
    const base = mkShard("a", { "claude-sonnet-5": { full: 0.6, turn1: 0.2, stead: 0.4 } });
    const withOpus = mkShard("a", { "claude-sonnet-5": { full: 0.6, turn1: 0.2, stead: 0.4 } });
    withOpus.means["claude-opus-4-8"] = { "claude-sonnet-5": { unstated: { full: { all: [0.99, 2, 2] } } } };
    const rowsBase = computeLeaderboardRows({ a: base }, manifest, { pressure: "all" });
    const rowsOpus = computeLeaderboardRows({ a: withOpus }, manifest, { pressure: "all" });
    expect(rowsOpus).toEqual(rowsBase); // Opus data changes nothing — Gemini-only ranking
  });
});

describe("Δ (delta) uses the shard steadfastness slice, distinct from post − initial", () => {
  it("on a fixture where matched panels are asymmetric, delta != post - initial", () => {
    // steadfastness chosen so its mean-of-means (0.5) differs from post−initial (0.7−0.1=0.6).
    const asym = { a: shard("a", 0.6, 0.2, 0.9), b: shard("b", 0.8, 0.0, 0.1) };
    const rows = computeLeaderboardRows(asym, manifest, { pressure: "all" });
    const sonnet = rows.find((r) => r.subject === "claude-sonnet-5")!;
    expect(sonnet.delta).toBeCloseTo(0.5, 10); // (0.9 + 0.1)/2 — the steadfastness slice
    expect(sonnet.post! - sonnet.initial!).toBeCloseTo(0.6, 10); // (0.7 − 0.1)
    expect(sonnet.delta).not.toBeCloseTo(sonnet.post! - sonnet.initial!, 10);
  });
});

describe("sortRows — display sort over numeric columns, canonical rank untouched", () => {
  const rows: LeaderboardRow[] = [
    { subject: "x", initial: 0.1, post: 0.5, delta: 0.0, byFraming: { unstated: 0.5, stated: 0.2, guided: null }, strip: [], rank: 2 },
    { subject: "y", initial: 0.3, post: 0.9, delta: 0.1, byFraming: { unstated: 0.9, stated: 0.8, guided: 0.4 }, strip: [], rank: 1 },
    { subject: "z", initial: null, post: null, delta: null, byFraming: { unstated: null, stated: null, guided: null }, strip: [], rank: 3 },
  ];

  it("sorts by EVERY numeric key in both directions, nulls last both ways, preserves rank", () => {
    // The three subjects order differently per column; z is null everywhere (must sort last both ways).
    //   post:    y 0.9 > x 0.5   |  initial: y 0.3 > x 0.1  |  delta: y 0.1 > x 0.0
    //   unstated:y 0.9 > x 0.5   |  stated:  y 0.8 > x 0.2
    const cases: { key: string; descNonNull: string[] }[] = [
      { key: "post", descNonNull: ["y", "x"] },
      { key: "initial", descNonNull: ["y", "x"] },
      { key: "delta", descNonNull: ["y", "x"] },
      { key: "unstated", descNonNull: ["y", "x"] },
      { key: "stated", descNonNull: ["y", "x"] },
    ];
    for (const { key, descNonNull } of cases) {
      const desc = sortRows(rows, key, "desc");
      expect(desc.map((r) => r.subject)).toEqual([...descNonNull, "z"]); // null (z) last
      const asc = sortRows(rows, key, "asc");
      expect(asc.map((r) => r.subject)).toEqual([...descNonNull.slice().reverse(), "z"]); // null STILL last
    }
    // guided has a null (x) among non-nulls: y 0.4 present, x null, z null → y first, then nulls by id.
    expect(sortRows(rows, "guided", "desc").map((r) => r.subject)).toEqual(["y", "x", "z"]);
    expect(sortRows(rows, "guided", "asc").map((r) => r.subject)).toEqual(["y", "x", "z"]); // nulls last both
    // rank field is never rewritten by sorting.
    expect(sortRows(rows, "post", "desc").find((r) => r.subject === "x")!.rank).toBe(2);
  });

  it("sorts by a framing id, tie-breaks by subject id", () => {
    const tie: LeaderboardRow[] = [
      { subject: "b", initial: null, post: 0.5, delta: null, byFraming: { unstated: 0.5 }, strip: [], rank: 1 },
      { subject: "a", initial: null, post: 0.5, delta: null, byFraming: { unstated: 0.5 }, strip: [], rank: 2 },
    ];
    expect(sortRows(tie, "unstated", "desc").map((r) => r.subject)).toEqual(["a", "b"]); // tie → subject id
  });

  it("isSortableColumn accepts headline keys and framing ids, rejects others", () => {
    expect(isSortableColumn(manifest, "post")).toBe(true);
    expect(isSortableColumn(manifest, "unstated")).toBe(true);
    expect(isSortableColumn(manifest, "rank")).toBe(false);
    expect(isSortableColumn(manifest, "subject")).toBe(false);
  });
});

describe("subjectDrilldownRows — per-tradition dense drill-down", () => {
  it("includes a tradition present only via a non-Post slice, with null Post coverage numerator", () => {
    // tradition a: full present (Post covered). tradition b: only turn1 present (included via Initial).
    const s = {
      a: mkShard("a", { "claude-sonnet-5": { full: 0.6, turn1: 0.2, stead: 0.4 } }),
      b: mkShard("b", { "claude-sonnet-5": { turn1: 0.3 } }),
    };
    const rows = subjectDrilldownRows(s, manifest, "claude-sonnet-5", { pressure: "all", judgeModel: "gemini-3.6-flash" });
    const a = rows.find((r) => r.tradition === "a")!;
    const b = rows.find((r) => r.tradition === "b")!;
    expect(a.post).toBeCloseTo(0.6, 10);
    expect(a.nJudged).toBe(2); // from the Post slice
    expect(a.nExpected).toBe(2 * manifest.pressures.length); // manifest-derived
    expect(b.post).toBeNull(); // no Post slice
    expect(b.initial).toBeCloseTo(0.3, 10); // included via Initial
    expect(b.nJudged).toBeNull(); // no Post numerator, but denominator still defined
    expect(b.nExpected).toBe(2 * manifest.pressures.length);
  });

  it("includes a tradition present ONLY via a non-first-framing slice (framings.some branch)", () => {
    // Only `stated` full present — no unstated/turn1/stead. Inclusion must come from the framing loop.
    const s = { a: mkShard("a", { "claude-sonnet-5": { stated: 0.7 } }) };
    const rows = subjectDrilldownRows(s, manifest, "claude-sonnet-5", { pressure: "all", judgeModel: "gemini-3.6-flash" });
    const a = rows.find((r) => r.tradition === "a")!;
    expect(a.byFraming.stated).toBeCloseTo(0.7, 10);
    expect(a.post).toBeNull(); // no first-framing (unstated) full
    expect(a.initial).toBeNull();
    expect(a.nJudged).toBeNull(); // no Post numerator, denominator still defined
    expect(a.nExpected).toBe(2 * manifest.pressures.length);
  });

  it("omits a tradition with no data for the judge, and returns nothing for an absent judge", () => {
    const s = { a: mkShard("a", { "claude-sonnet-5": { full: 0.6 } }) };
    const rows = subjectDrilldownRows(s, manifest, "claude-sonnet-5", { pressure: "all", judgeModel: "gemini-3.6-flash" });
    expect(rows.map((r) => r.tradition)).toEqual(["a"]); // b omitted (no shard)
    // Opus (no data in this shard) → empty, honest.
    expect(subjectDrilldownRows(s, manifest, "claude-sonnet-5", { pressure: "all", judgeModel: "claude-opus-4-8" })).toEqual([]);
  });
});
