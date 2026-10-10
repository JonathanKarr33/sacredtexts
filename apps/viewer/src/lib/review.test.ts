import { describe, it, expect } from "vitest";
import {
  emptyCheck,
  emptyScenarioChecks,
  emptyState,
  evenSample,
  parseReviewState,
  seededSample,
  traditionProgress,
  withSample,
  withScenarioCheck,
  withTraditionCheck,
  withoutTradition,
  type ReviewState,
} from "./review";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `S-${String(i + 1).padStart(3, "0")}`);

describe("evenSample (the default assignment)", () => {
  it("returns every id when the corpus is at or under the sample size", () => {
    expect(evenSample(ids(7), 10)).toEqual(ids(7));
    expect(evenSample(ids(10), 10)).toEqual(ids(10));
  });

  it("picks n evenly spread ids, starting at the first, preserving corpus order", () => {
    const sample = evenSample(ids(100), 10);
    expect(sample).toHaveLength(10);
    expect(sample[0]).toBe("S-001");
    expect(sample).toEqual([...sample].sort()); // corpus order == lexical for this fixture
    expect(new Set(sample).size).toBe(10);
  });

  it("is deterministic — every cold-opening reviewer gets the same assignment", () => {
    expect(evenSample(ids(140), 10)).toEqual(evenSample(ids(140), 10));
  });
});

describe("seededSample (the reshuffle path)", () => {
  it("is reproducible from the seed recorded in the report", () => {
    expect(seededSample(ids(100), 10, "abc123")).toEqual(seededSample(ids(100), 10, "abc123"));
  });

  it("draws n distinct known ids in corpus order", () => {
    const all = ids(48);
    const sample = seededSample(all, 10, "xyz");
    expect(sample).toHaveLength(10);
    expect(new Set(sample).size).toBe(10);
    for (const s of sample) expect(all).toContain(s);
    const positions = sample.map((s) => all.indexOf(s));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("different seeds give different draws; the empty seed falls back to the even spread", () => {
    expect(seededSample(ids(100), 10, "seed-a")).not.toEqual(seededSample(ids(100), 10, "seed-b"));
    expect(seededSample(ids(100), 10, "")).toEqual(evenSample(ids(100), 10));
  });
});

describe("parseReviewState (tolerant persistence)", () => {
  it("null / corrupt JSON / non-object payloads degrade to the empty state", () => {
    expect(parseReviewState(null)).toEqual(emptyState());
    expect(parseReviewState("{not json")).toEqual(emptyState());
    expect(parseReviewState('"a string"')).toEqual(emptyState());
  });

  it("round-trips a real state", () => {
    let s: ReviewState = emptyState();
    // Reviewer identity comes from the account in production; seed it directly for the round-trip.
    s = { ...s, reviewer: { name: "Imam Test", contact: "t@example.com", background: "scholar" } };
    s = withSample(s, "sunni-islam", ["JLS-001", "JLS-002"], "seed1");
    s = withTraditionCheck(s, "sunni-islam", "guide", { status: "approved", notes: "sound" });
    s = withScenarioCheck(s, "sunni-islam", "JLS-001", "scoring", {
      status: "flagged",
      notes: "wrong ruling",
      suggestion: "cite Q4:148",
    });
    expect(parseReviewState(JSON.stringify(s))).toEqual(s);
  });

  it("a corrupt subfield falls back alone — the rest of the work survives", () => {
    const s = withScenarioCheck(emptyState(), "t", "S-1", "scenario", { status: "approved", notes: "keep me" });
    const raw = JSON.parse(JSON.stringify(s));
    raw.traditions.t.scenarios["S-1"].scenario.status = "bogus-status"; // corrupt one enum
    raw.reviewer.name = 42; // and one reviewer field
    const parsed = parseReviewState(JSON.stringify(raw));
    expect(parsed.traditions.t?.scenarios["S-1"]?.scenario.status).toBe("unreviewed");
    expect(parsed.traditions.t?.scenarios["S-1"]?.scenario.notes).toBe("keep me");
    expect(parsed.reviewer.name).toBe("");
  });
});

describe("state updaters", () => {
  it("withScenarioCheck creates the nested tradition/scenario slots on first touch", () => {
    const s = withScenarioCheck(emptyState(), "buddhism", "MB-001", "pressures", { status: "flagged" });
    const checks = s.traditions.buddhism?.scenarios["MB-001"];
    expect(checks?.pressures.status).toBe("flagged");
    expect(checks?.scenario).toEqual(emptyCheck());
    expect(s.traditions.buddhism?.sampleIds).toEqual([]);
  });

  it("withoutTradition drops exactly that tradition", () => {
    let s = withTraditionCheck(emptyState(), "a", "source", { status: "approved" });
    s = withTraditionCheck(s, "b", "source", { status: "flagged" });
    s = withoutTradition(s, "a");
    expect(s.traditions.a).toBeUndefined();
    expect(s.traditions.b?.source.status).toBe("flagged");
  });
});

describe("traditionProgress", () => {
  it("is empty for an unopened tradition", () => {
    expect(traditionProgress(undefined)).toEqual({ done: 0, contentful: 0, total: 0, flagged: 0, beyondSample: 0 });
  });

  it("counts source + guide + four checks per sampled scenario; flags counted separately", () => {
    let s = withSample(emptyState(), "t", ["S-1", "S-2"], "");
    s = withTraditionCheck(s, "t", "source", { status: "approved" });
    s = withScenarioCheck(s, "t", "S-1", "scenario", { status: "approved" });
    s = withScenarioCheck(s, "t", "S-1", "judgement", { status: "flagged" });
    const p = traditionProgress(s.traditions.t);
    expect(p.total).toBe(2 + 4 * 2);
    expect(p.done).toBe(3);
    expect(p.flagged).toBe(1);
  });

  it("counts notes-only checks as `contentful` (not `done`), so a review with no verdict isn't 'empty'", () => {
    let s = withSample(emptyState(), "t", ["S-1"], "");
    s = withTraditionCheck(s, "t", "source", { notes: "wrong base text" }); // notes, no verdict
    const p = traditionProgress(s.traditions.t);
    expect(p.done).toBe(0); // completion bar counts only verdicts
    expect(p.contentful).toBe(1); // but there IS content to submit
  });

  it("an unsampled scenario's stray checks don't count toward the sample's progress", () => {
    let s = withSample(emptyState(), "t", ["S-1"], "");
    s = withScenarioCheck(s, "t", "S-99", "scenario", { status: "approved" });
    expect(traditionProgress(s.traditions.t)).toEqual({ done: 0, contentful: 0, total: 6, flagged: 0, beyondSample: 1 });
  });

  it("scenarioChecks default shape covers all four keys", () => {
    expect(Object.keys(emptyScenarioChecks()).sort()).toEqual(["judgement", "pressures", "scenario", "scoring"]);
  });
});
