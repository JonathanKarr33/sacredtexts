import { describe, it, expect } from "vitest";
import {
  DEFAULTS,
  parseResultsSelection,
  selectionToResultsSearch,
  type ResultsSelection,
} from "./resultsSelection";
import type { ResultsManifest } from "./resultsModel";

const manifest = {
  subjects: ["claude-sonnet-5", "gemini-3.6-flash"],
  framings: ["unstated", "stated", "guided"],
  pressures: ["secularize", "insistence"],
  pressureAll: "all",
  judges: [{ key: "gemini" }, { key: "opus" }],
} as unknown as ResultsManifest;

describe("parseResultsSelection", () => {
  it("returns defaults on an empty search", () => {
    expect(parseResultsSelection({})).toEqual({
      runId: null, judge: DEFAULTS.judge, pressure: DEFAULTS.pressure, sort: null, expanded: [],
    });
  });

  it("reads valid run / judge / pressure / sort / expanded", () => {
    const sel = parseResultsSelection(
      { run: "20260803", judge: "opus", pressure: "secularize", sort: "post.asc", expanded: "claude-sonnet-5,gemini-3.6-flash" }, manifest);
    expect(sel).toEqual({
      runId: "20260803", judge: "opus", pressure: "secularize",
      sort: { key: "post", dir: "asc" }, expanded: ["claude-sonnet-5", "gemini-3.6-flash"],
    });
  });

  it("accepts a framing id as a sort key (validated against the manifest)", () => {
    expect(parseResultsSelection({ sort: "stated.desc" }, manifest).sort).toEqual({ key: "stated", dir: "desc" });
  });

  it("clamps out-of-vocab judge/pressure to defaults; drops an invalid sort key", () => {
    const sel = parseResultsSelection({ judge: "bogus", pressure: "bribery", sort: "vibes.desc" }, manifest);
    expect(sel).toMatchObject({ judge: DEFAULTS.judge, pressure: DEFAULTS.pressure, sort: null });
  });

  it("defaults an unspecified sort direction to desc", () => {
    expect(parseResultsSelection({ sort: "delta" }, manifest).sort).toEqual({ key: "delta", dir: "desc" });
  });

  it("ignores stale ?framing= / ?metric= params (removed in v2) without error", () => {
    const sel = parseResultsSelection({ framing: "stated", metric: "turn1" }, manifest);
    expect(sel).toEqual({ runId: null, judge: DEFAULTS.judge, pressure: DEFAULTS.pressure, sort: null, expanded: [] });
  });

  it("dedupes and trims the expanded list", () => {
    expect(parseResultsSelection({ expanded: "a, b ,a, ,c" }).expanded).toEqual(["a", "b", "c"]);
  });

  it("drops unknown expanded subject ids when a manifest is supplied (ignored, not carried)", () => {
    const sel = parseResultsSelection({ expanded: "claude-sonnet-5,bogus,gemini-3.6-flash" }, manifest);
    expect(sel.expanded).toEqual(["claude-sonnet-5", "gemini-3.6-flash"]); // 'bogus' filtered out
    // and it does not survive a re-serialization round-trip.
    expect(selectionToResultsSearch(sel).expanded).toBe("claude-sonnet-5,gemini-3.6-flash");
  });
});

describe("selectionToResultsSearch", () => {
  it("omits defaults (clean base URL)", () => {
    const sel: ResultsSelection = { runId: null, ...DEFAULTS };
    expect(selectionToResultsSearch(sel)).toEqual({});
  });

  it("emits only non-default values", () => {
    const sel: ResultsSelection = {
      runId: "r9", judge: "opus", pressure: "flattery",
      sort: { key: "guided", dir: "asc" }, expanded: ["x", "y"],
    };
    expect(selectionToResultsSearch(sel)).toEqual({
      run: "r9", judge: "opus", pressure: "flattery", sort: "guided.asc", expanded: "x,y",
    });
  });

  it("round-trips a non-default selection through parse", () => {
    const sel: ResultsSelection = {
      runId: null, judge: "gemini", pressure: "insistence",
      sort: { key: "initial", dir: "desc" }, expanded: ["claude-sonnet-5"],
    };
    expect(parseResultsSelection(selectionToResultsSearch(sel), manifest)).toEqual(sel);
  });
});
