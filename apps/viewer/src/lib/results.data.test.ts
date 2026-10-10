import { describe, it, expect, afterEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  resultsRunIds,
  loadResultsRuns,
  loadResultsShard,
  loadResultsManifest,
} from "./queries";
import { parseResultsManifest, parseResultsShard, shardConsistencyNotices } from "./resultsModel";
import { tree } from "./github";
import { REPO } from "./constants";
import { buildTree, fakeFetch, resultsFiles } from "../test/fakeRepo";

const SHA = "deadbeef";

function newQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(() => vi.unstubAllGlobals());

describe("resultsRunIds discovery", () => {
  it("finds results/<id>/manifest.json dirs (sorted)", () => {
    const files = { ...resultsFiles("20260803"), ...resultsFiles("20260701") };
    expect(resultsRunIds(buildTree(files))).toEqual(["20260701", "20260803"]);
  });
  it("ignores non-results and non-manifest paths", () => {
    const entries = buildTree({
      "results/r1/manifest.json": "{}",
      "results/r1/buddhism.json": "{}",
      "traditions/x/tradition.yaml": "{}",
    });
    expect(resultsRunIds(entries)).toEqual(["r1"]);
  });
});

describe("loadResultsRuns (real QueryClient + stubbed fetch)", () => {
  it("defaults to the most recent run by generated_at", async () => {
    const files = {
      ...resultsFiles("older", { generatedAt: "2026-07-01T00:00:00+00:00" }),
      ...resultsFiles("newer", { generatedAt: "2026-08-03T00:00:00+00:00" }),
    };
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { runs, defaultRunId } = await loadResultsRuns(newQc(), SHA);
    expect(runs.map((r) => r.id).sort()).toEqual(["newer", "older"]);
    expect(defaultRunId).toBe("newer"); // latest by manifest date
  });

  it("an invalid manifest yields a notice and does not become the default", async () => {
    const files = {
      ...resultsFiles("good", { generatedAt: "2026-07-01T00:00:00+00:00" }),
      "results/bad/manifest.json": "{ not json",
    };
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { runs, defaultRunId } = await loadResultsRuns(newQc(), SHA);
    expect(defaultRunId).toBe("good");
    const bad = runs.find((r) => r.id === "bad")!;
    expect(bad.manifest).toBeNull();
    expect(bad.notices.length).toBeGreaterThan(0);
  });

  it("orders by parsed instant; an unparseable date warns and sorts last", async () => {
    const files = {
      ...resultsFiles("good", { generatedAt: "2026-08-03T00:00:00+00:00" }),
      ...resultsFiles("nodate", { generatedAt: "not-a-date" }),
    };
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { runs, defaultRunId } = await loadResultsRuns(newQc(), SHA);
    expect(defaultRunId).toBe("good"); // valid date wins; unparseable sorts last
    const nodate = runs.find((r) => r.id === "nodate")!;
    expect(nodate.manifest).not.toBeNull(); // still accepted (date is metadata)
    expect(nodate.notices.some((n) => /unparseable generated_at/.test(n.message))).toBe(true);
  });

  it("compares non-UTC offsets by instant, not lexically", async () => {
    // "2026-08-03T00:00:00+05:00" is EARLIER than "2026-08-02T21:00:00+00:00"? No — equal instant.
    // Use a case where lexical order would be wrong: +05:00 midnight vs +00:00 01:00 same day.
    const files = {
      ...resultsFiles("offset", { generatedAt: "2026-08-03T00:00:00+05:00" }), // = 2026-08-02T19:00Z
      ...resultsFiles("utc", { generatedAt: "2026-08-02T20:00:00+00:00" }), // later instant
    };
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { defaultRunId } = await loadResultsRuns(newQc(), SHA);
    expect(defaultRunId).toBe("utc"); // later instant wins (lexical would pick "offset")
  });
});

describe("loadResultsShard / loadResultsManifest", () => {
  it("loads and parses a shard", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, resultsFiles("r1", { traditions: ["buddhism"] })));
    const { shard, notices } = await loadResultsShard(newQc(), SHA, "r1", "buddhism");
    expect(notices).toEqual([]);
    expect(shard?.tradition).toBe("buddhism");
    expect(shard?.means?.["gemini-3.6-flash"]?.["claude-sonnet-5"]?.unstated?.full?.all).toEqual([0.5, 2, 12]);
  });

  it("a tradition absent from the manifest yields a notice", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, resultsFiles("r1", { traditions: ["buddhism"] })));
    const { shard, notices } = await loadResultsShard(newQc(), SHA, "r1", "atlantis");
    expect(shard).toBeNull();
    expect(notices[0]?.message).toMatch(/not in manifest/);
  });

  it("a manifest-listed shard whose file is missing yields a notice", async () => {
    const files = resultsFiles("r1", { traditions: ["buddhism"] });
    delete files["results/r1/buddhism.json"]; // manifest lists it; file absent
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { shard, notices } = await loadResultsShard(newQc(), SHA, "r1", "buddhism");
    expect(shard).toBeNull();
    expect(notices[0]?.message).toMatch(/no results shard/);
  });

  it("uses the shard filename declared in the manifest (single source of truth)", async () => {
    const files = resultsFiles("r1", {
      traditions: ["buddhism"],
      shard: (t) => ({ tradition: t, n_scenarios: 2, judges: ["gemini-3.6-flash"], means: {}, steadfastness: {} }),
    });
    // Rename the shard file + point the manifest at the new name.
    const manifest = JSON.parse(files["results/r1/manifest.json"]!);
    manifest.traditions[0].shard = "buddhism.v2.json";
    files["results/r1/manifest.json"] = JSON.stringify(manifest);
    files["results/r1/buddhism.v2.json"] = files["results/r1/buddhism.json"]!;
    delete files["results/r1/buddhism.json"];
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { shard, notices } = await loadResultsShard(newQc(), SHA, "r1", "buddhism");
    expect(shard?.tradition).toBe("buddhism");
    expect(notices).toEqual([]);
  });

  it("unknown vocab + n_scenarios mismatch are warnings; the shard is still returned (display-first)", async () => {
    const files = resultsFiles("r1", {
      traditions: ["buddhism"],
      shard: () => ({
        tradition: "buddhism", // correct
        n_scenarios: 99, // warning: manifest says 2
        judges: ["gemini-3.6-flash"],
        means: {
          "mystery-judge": { "claude-sonnet-5": { unstated: { full: { bogus_pressure: [0.5, 1, 1] } } } },
        },
        steadfastness: {},
      }),
    });
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { shard, notices } = await loadResultsShard(newQc(), SHA, "r1", "buddhism");
    expect(shard).not.toBeNull(); // warnings keep the shard
    const msgs = notices.map((n) => n.message).join(" | ");
    expect(msgs).toMatch(/n_scenarios 99/);
    expect(msgs).toMatch(/unknown judge\(s\).*mystery-judge/);
    expect(msgs).toMatch(/unknown pressure\(s\).*bogus_pressure/);
  });

  it("a tradition-mismatched shard is EXCLUDED (never counted under the wrong tradition)", async () => {
    const files = resultsFiles("r1", {
      traditions: ["buddhism"],
      shard: () => ({
        tradition: "WRONG", // contract-breaking → error
        n_scenarios: 2, judges: ["gemini-3.6-flash"],
        means: { "gemini-3.6-flash": { "claude-sonnet-5": { unstated: { full: { all: [0.5, 2, 12] } } } } },
        steadfastness: {},
      }),
    });
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { shard, notices } = await loadResultsShard(newQc(), SHA, "r1", "buddhism");
    expect(shard).toBeNull(); // excluded from standings
    expect(notices.some((n) => n.severity === "error" && /does not match requested/.test(n.message))).toBe(true);
  });

  it("flags implausible coverage (n_judged > n_expected or wrong denominator)", async () => {
    const files = resultsFiles("r1", {
      traditions: ["buddhism"],
      shard: () => ({
        tradition: "buddhism", n_scenarios: 2, judges: ["gemini-3.6-flash"],
        means: { "gemini-3.6-flash": { "claude-sonnet-5": { unstated: { full: { all: [0.5, 99, 12] } } } } }, // 99 > 12
        steadfastness: {},
      }),
    });
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { shard, notices } = await loadResultsShard(newQc(), SHA, "r1", "buddhism");
    expect(shard).not.toBeNull(); // warning, not fatal
    expect(notices.some((n) => /implausible coverage/.test(n.message))).toBe(true);
  });

  it("an unknown judge in the shard's declared judges[] list surfaces even with empty tables", async () => {
    const files = resultsFiles("r1", {
      traditions: ["buddhism"],
      shard: (t) => ({
        tradition: t, n_scenarios: 2,
        judges: ["gemini-3.6-flash", "unknown-judge"], // unknown, but tables are empty
        means: {}, steadfastness: {},
      }),
    });
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { shard, notices } = await loadResultsShard(newQc(), SHA, "r1", "buddhism");
    expect(shard).not.toBeNull();
    expect(notices.map((n) => n.message).join(" | ")).toMatch(/unknown judge\(s\).*unknown-judge/);
  });

  it("rejects an unsafe (path-traversal) shard filename from the manifest", async () => {
    const files = resultsFiles("r1", { traditions: ["buddhism"] });
    const m = JSON.parse(files["results/r1/manifest.json"]!);
    m.traditions[0].shard = "../../etc/evil.json"; // hostile manifest
    files["results/r1/manifest.json"] = JSON.stringify(m);
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { shard, notices } = await loadResultsShard(newQc(), SHA, "r1", "buddhism");
    expect(shard).toBeNull();
    expect(notices[0]?.message).toMatch(/unsafe shard filename/);
  });

  it("a missing manifest yields a notice", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, {}));
    const { manifest, notices } = await loadResultsManifest(newQc(), SHA, "ghost");
    expect(manifest).toBeNull();
    expect(notices[0]?.message).toMatch(/not found/);
  });
});

describe("parseResultsManifest / parseResultsShard validation (fail-soft)", () => {
  it("rejects an unsupported schema_version", () => {
    const text = resultsFiles("r1", { schemaVersion: 99 })["results/r1/manifest.json"]!;
    const { manifest, notices } = parseResultsManifest(text, "m");
    expect(manifest).toBeNull();
    expect(notices[0]?.message).toMatch(/unsupported schema_version 99/);
  });

  it("maps snake_case manifest fields to camelCase + coverage", () => {
    const text = resultsFiles("r1")["results/r1/manifest.json"]!;
    const { manifest } = parseResultsManifest(text, "m");
    expect(manifest?.runId).toBe("r1");
    expect(manifest?.judges.find((j) => j.key === "opus")?.fullGrid).toBe(false);
    expect(manifest?.coverage?.["gemini-3.6-flash"]?.unstated).toEqual({ nJudged: 10, nExpected: 10 });
  });

  it("#110: round-trips the optional per-judge rankable + coverage fields", () => {
    const text = resultsFiles("r1")["results/r1/manifest.json"]!;
    const { manifest } = parseResultsManifest(text, "m");
    const gem = manifest?.judges.find((j) => j.key === "gemini");
    const opus = manifest?.judges.find((j) => j.key === "opus");
    expect([gem?.rankable, gem?.coverage]).toEqual([true, 1.0]);
    expect([opus?.rankable, opus?.coverage]).toEqual([false, 0.14]);
  });

  it("#110: a manifest WITHOUT rankable/coverage still parses (backward compat)", () => {
    const m = JSON.parse(resultsFiles("r1")["results/r1/manifest.json"]!);
    for (const j of m.judges) { delete j.rankable; delete j.coverage; }
    const { manifest, notices } = parseResultsManifest(JSON.stringify(m), "m");
    expect(manifest).not.toBeNull();
    expect(notices).toEqual([]);
    expect(manifest?.judges.find((j) => j.key === "gemini")?.rankable).toBeUndefined();
  });

  // #120: the manifest `ranking` declaration + the combined shard block.
  const _validRanking = {
    rule: "mean_of_judges", score_key: "combined",
    judges: ["gemini-3.6-flash", "claude-opus-4-8"],
    single_judge_cells: { count: 2, attempts: 3, cells: [{ tradition: "buddhism", subject: "x" }] },
  };
  function _manifestWith(ranking: unknown) {
    const m = JSON.parse(resultsFiles("r1")["results/r1/manifest.json"]!);
    m.ranking = ranking;
    return JSON.stringify(m);
  }

  it("#120: parses a valid ranking declaration", () => {
    const { manifest, notices } = parseResultsManifest(_manifestWith(_validRanking), "m");
    expect(notices).toEqual([]);
    expect(manifest?.ranking?.scoreKey).toBe("combined");
    expect(manifest?.ranking?.rule).toBe("mean_of_judges");
    expect(manifest?.ranking?.singleJudgeCells).toEqual({ count: 2, attempts: 3, cells: [{ tradition: "buddhism", subject: "x" }] });
  });

  it("#120: a manifest WITHOUT ranking still parses (legacy → Gemini fallback)", () => {
    const { manifest, notices } = parseResultsManifest(resultsFiles("r1")["results/r1/manifest.json"]!, "m");
    expect(manifest).not.toBeNull();
    expect(manifest?.ranking).toBeUndefined();
    expect(notices).toEqual([]);
  });

  it.each([
    ["unknown rule", { ..._validRanking, rule: "median_of_judges" }, /unknown ranking.rule/],
    ["score_key collides with a real judge", { ..._validRanking, score_key: "gemini-3.6-flash" }, /collides with a real judge/],
    ["judges not in manifest", { ..._validRanking, judges: ["gemini-3.6-flash", "made-up"] }, /ranking.judges not in manifest/],
    ["duplicate judges", { ..._validRanking, judges: ["gemini-3.6-flash", "gemini-3.6-flash"] }, /ranking.judges has duplicates/],
    ["unsupported score_key", { ..._validRanking, score_key: "median" }, /unsupported ranking.score_key/],
  ])("#120: a malformed ranking (%s) surfaces a visible error, not a silent revert", (_name, ranking, re) => {
    const { manifest, notices } = parseResultsManifest(_manifestWith(ranking), "m");
    // The manifest still parses (fail-soft) but carries a loud error notice.
    expect(manifest).not.toBeNull();
    expect(notices.some((n) => n.severity === "error" && re.test(n.message))).toBe(true);
  });

  it("#120: parses the combined shard block", () => {
    const bad = JSON.stringify({
      tradition: "b", n_scenarios: 2, judges: ["gemini-3.6-flash", "claude-opus-4-8"],
      means: { "gemini-3.6-flash": { s: { unstated: { full: { all: [0.5, 2, 12] } } } } },
      steadfastness: {},
      combined: { s: { unstated: { full: { all: [0.4, 2, 12] } } } },
      combined_steadfastness: { s: { unstated: { all: [0.1, 2] } } },
    });
    const { shard } = parseResultsShard(bad, "s");
    expect(shard?.combined?.["s"]?.["unstated"]?.["full"]?.["all"]).toEqual([0.4, 2, 12]);
    expect(shard?.combinedSteadfastness?.["s"]?.["unstated"]?.["all"]).toEqual([0.1, 2]);
  });

  it("#120: shardConsistencyNotices flags a ranking on combined when the shard lacks the block", () => {
    const { manifest } = parseResultsManifest(_manifestWith(_validRanking), "m");
    const { shard } = parseResultsShard(JSON.stringify({
      tradition: "buddhism", n_scenarios: 2, judges: ["gemini-3.6-flash"],
      means: {}, steadfastness: {},  // no combined block
    }), "s");
    const notices = shardConsistencyNotices(shard!, manifest!, "buddhism", "s");
    expect(notices.some((n) => n.severity === "error" && /no combined block/.test(n.message))).toBe(true);
  });

  it("rejects an out-of-range score in a shard cell", () => {
    const bad = JSON.stringify({
      tradition: "b", n_scenarios: 2, judges: ["gemini-3.6-flash"],
      means: { "gemini-3.6-flash": { s: { unstated: { full: { all: [1.5, 2, 2] } } } } },
      steadfastness: {},
    });
    const { shard, notices } = parseResultsShard(bad, "s");
    expect(shard).toBeNull();
    expect(notices[0]?.message).toMatch(/invalid shard/);
  });

  it("rejects a non-finite / malformed cell", () => {
    const bad = JSON.stringify({
      tradition: "b", n_scenarios: 2, judges: ["g"],
      means: { g: { s: { unstated: { full: { all: [0.5, 2] } } } } }, // wrong tuple arity
      steadfastness: {},
    });
    expect(parseResultsShard(bad, "s").shard).toBeNull();
  });

  it("malformed JSON yields a notice, not a throw", () => {
    expect(parseResultsShard("{oops", "s").shard).toBeNull();
    expect(parseResultsManifest("{oops", "m").manifest).toBeNull();
  });

  it("flags an unknown framing/pressure/scope/metric in the manifest's OWN vocab", () => {
    const m = JSON.parse(resultsFiles("r1")["results/r1/manifest.json"]!);
    m.framings = ["unstated", "sideways"]; // sideways is not a known framing
    m.pressures = [...m.pressures, "bribery"];
    m.scopes = ["turn1", "full", "turn7"];
    m.metrics = ["turn1", "full", "steadfastness", "vibes"];
    const { manifest, notices } = parseResultsManifest(JSON.stringify(m), "m");
    expect(manifest).not.toBeNull(); // display-first: still usable
    const msgs = notices.map((n) => n.message).join(" | ");
    expect(msgs).toMatch(/unknown framing.*sideways/);
    expect(msgs).toMatch(/unknown pressure.*bribery/);
    expect(msgs).toMatch(/unknown scope.*turn7/);
    expect(msgs).toMatch(/unknown metric.*vibes/);
  });

  it("does NOT restrict subjects/judges (new models must appear without a code change)", () => {
    const m = JSON.parse(resultsFiles("r1")["results/r1/manifest.json"]!);
    m.subjects = [...m.subjects, "some/new-model-7"];
    m.judges = [...m.judges, { key: "newjudge", model: "new-judge-9", aliases: ["new-judge-9"], full_grid: false }];
    const { manifest, notices } = parseResultsManifest(JSON.stringify(m), "m");
    expect(manifest).not.toBeNull();
    expect(notices.map((n) => n.message).join(" ")).not.toMatch(/subject|judge/);
  });

  it("warns (does not fail) when required counts fields are absent", () => {
    const m = JSON.parse(resultsFiles("r1")["results/r1/manifest.json"]!);
    delete m.counts;
    const { manifest, notices } = parseResultsManifest(JSON.stringify(m), "m");
    expect(manifest).not.toBeNull();
    expect(notices.some((n) => /missing counts/.test(n.message))).toBe(true);
  });
});

describe("truncation fallback discovers results/", () => {
  it("a truncated recursive tree still yields results/ + traditions/ entries", async () => {
    const files = {
      ...resultsFiles("20260803", { traditions: ["buddhism", "taoism"] }),
      "traditions/sunni-islam/tradition.yaml": "id: sunni-islam",
    };
    const entries = await tree(REPO, SHA, fakeFetch(REPO, SHA, files, { truncated: true }));
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("results/20260803/manifest.json");
    expect(paths).toContain("results/20260803/buddhism.json");
    expect(paths).toContain("traditions/sunni-islam/tradition.yaml");
    // and resultsRunIds still works off the fallback-built tree
    expect(resultsRunIds(entries)).toEqual(["20260803"]);
  });
});
