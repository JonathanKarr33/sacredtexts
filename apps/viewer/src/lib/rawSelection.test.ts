import { describe, expect, it } from "vitest";
import { parseRawSelection, rawSelectionToSearch } from "./rawSelection";
import { rawFixtureCatalog } from "../test/rawFixture";
import { parseRawCatalog, type RawCatalog } from "./rawModel";

const catalog = parseRawCatalog(JSON.stringify(rawFixtureCatalog), "c").catalog as RawCatalog;

describe("parseRawSelection", () => {
  it("defaults to first subject, each axis's first value, first scope, the full-grid judge", () => {
    const sel = parseRawSelection({}, catalog);
    expect(sel.a).toBe("claude-sonnet-5");
    expect(sel.b).toBeNull();
    expect(sel.conditions).toEqual({ framing: "unstated", pressure: "secularize" });
    expect(sel.scope).toBe("turn1");
    expect(sel.judge).toBe("gemini"); // rankable judge (Gemini) is the default, not Opus
  });

  it("#110: defaults to the rankable judge even when a validation judge is also full-grid", () => {
    // Opus listed first and full-grid, but rankable:false → Gemini stays the default judge.
    const c = {
      ...catalog,
      judges: [
        { key: "opus", label: "opus", fullGrid: true, rankable: false, coverage: 0.999 },
        { key: "gemini", label: "gemini", fullGrid: true, rankable: true, coverage: 1.0 },
      ],
    };
    expect(parseRawSelection({}, c).judge).toBe("gemini");
  });

  it("honors valid values and falls back on out-of-vocab ones (fail-soft deep links)", () => {
    const sel = parseRawSelection(
      { a: "gpt-5.6-terra", b: "claude-sonnet-5", framing: "stated", pressure: "nope", scope: "full", judge: "opus" },
      catalog,
    );
    expect(sel.a).toBe("gpt-5.6-terra");
    expect(sel.b).toBe("claude-sonnet-5");
    expect(sel.conditions.framing).toBe("stated");
    expect(sel.conditions.pressure).toBe("secularize"); // "nope" → first value
    expect(sel.scope).toBe("full");
    expect(sel.judge).toBe("opus");
  });

  it("drops b when it equals a or is unknown", () => {
    expect(parseRawSelection({ a: "gpt-5.6-terra", b: "gpt-5.6-terra" }, catalog).b).toBeNull();
    expect(parseRawSelection({ a: "gpt-5.6-terra", b: "who?" }, catalog).b).toBeNull();
  });

  it("round-trips through search (each condition axis as its own param)", () => {
    const sel = parseRawSelection({ a: "gpt-5.6-terra", framing: "stated", scope: "full", judge: "opus" }, catalog);
    const search = rawSelectionToSearch(sel);
    expect(search).toMatchObject({ a: "gpt-5.6-terra", framing: "stated", pressure: "secularize", scope: "full", judge: "opus" });
    expect("b" in search).toBe(false); // null b omitted
    expect(parseRawSelection(search, catalog)).toEqual(sel);
  });
});
