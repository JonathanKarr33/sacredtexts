import { describe, it, expect } from "vitest";
import {
  applyFilters,
  computeFacets,
  filterAndSort,
  isActive,
  parseSelection,
  selectionToSearch,
  sortRows,
  type Row,
  type Selection,
} from "./filtering";
import type { ScenarioMeta } from "./model";

function row(
  id: string,
  tags: Record<string, string[]>,
  sourceLocus: number | null = 1,
  identitySignal = "clean",
  locusLabel = "",
): Row {
  const meta: ScenarioMeta = { id, tags, sourceLocus, locusLabel, identitySignal };
  return { id, meta };
}

const sel = (over: Partial<Selection> = {}): Selection => ({
  axes: {},
  identity: [],
  locusMin: null,
  locusMax: null,
  q: "",
  sort: "default",
  ...over,
});

// A mixed set spanning a 2-axis (sunni) and a 5-axis (judaism) shape — axis-agnostic.
const rows: Row[] = [
  row("JLS-001", { pillars: ["restraint", "justice"], hearts: ["patience"] }, 10, "clean", "Backbiting"),
  row("JLS-002", { pillars: ["justice"], hearts: ["vigilance"] }, 20, "leaky", "Justice"),
  row("MSR-001", { middot: ["anavah"], virtues: ["emet"], domain: ["speech"], register: ["plain"], middle_path: ["balance"] }, 5, "clean", "Humility"),
];

describe("axis filters (OR within axis, AND across axes; arbitrary axis names)", () => {
  it("OR within an axis", () => {
    const out = applyFilters(rows, sel({ axes: { pillars: ["restraint", "courage"] } }));
    expect(out.map((r) => r.id)).toEqual(["JLS-001"]); // has restraint
  });
  it("AND across axes", () => {
    const both = applyFilters(rows, sel({ axes: { pillars: ["justice"], hearts: ["vigilance"] } }));
    expect(both.map((r) => r.id)).toEqual(["JLS-002"]);
    const none = applyFilters(rows, sel({ axes: { pillars: ["justice"], hearts: ["patience"] } }));
    expect(none.map((r) => r.id)).toEqual(["JLS-001"]);
  });
  it("works over a 5-axis tradition's axes", () => {
    const out = applyFilters(rows, sel({ axes: { domain: ["speech"], register: ["plain"] } }));
    expect(out.map((r) => r.id)).toEqual(["MSR-001"]);
  });
});

describe("identity / locus / search", () => {
  it("identity_signal OR", () => {
    expect(applyFilters(rows, sel({ identity: ["leaky"] })).map((r) => r.id)).toEqual(["JLS-002"]);
    expect(applyFilters(rows, sel({ identity: ["clean", "leaky"] })).length).toBe(3);
  });
  it("source_locus range inclusive both ends; one-sided allowed", () => {
    expect(applyFilters(rows, sel({ locusMin: 10, locusMax: 20 })).map((r) => r.id)).toEqual(["JLS-001", "JLS-002"]);
    expect(applyFilters(rows, sel({ locusMin: 10 })).map((r) => r.id)).toEqual(["JLS-001", "JLS-002"]);
    expect(applyFilters(rows, sel({ locusMax: 5 })).map((r) => r.id)).toEqual(["MSR-001"]);
  });
  it("free-text over id and locus_label", () => {
    expect(applyFilters(rows, sel({ q: "msr" })).map((r) => r.id)).toEqual(["MSR-001"]);
    expect(applyFilters(rows, sel({ q: "backbiting" })).map((r) => r.id)).toEqual(["JLS-001"]);
  });
});

describe("incomplete rows (ghost/stub/loading: meta null)", () => {
  const withGhost: Row[] = [...rows, { id: "JLS-999", meta: null }];
  it("appears when unfiltered", () => {
    expect(applyFilters(withGhost, sel()).map((r) => r.id)).toContain("JLS-999");
  });
  it("is excluded by any active positive filter", () => {
    expect(applyFilters(withGhost, sel({ axes: { pillars: ["justice"] } })).map((r) => r.id)).not.toContain("JLS-999");
    expect(applyFilters(withGhost, sel({ identity: ["clean"] })).map((r) => r.id)).not.toContain("JLS-999");
    expect(applyFilters(withGhost, sel({ locusMin: 0 })).map((r) => r.id)).not.toContain("JLS-999");
  });
  it("is still findable by id search", () => {
    expect(applyFilters(withGhost, sel({ q: "999" })).map((r) => r.id)).toEqual(["JLS-999"]);
  });
});

describe("sort", () => {
  it("default preserves declared order", () => {
    expect(sortRows(rows, "default").map((r) => r.id)).toEqual(["JLS-001", "JLS-002", "MSR-001"]);
  });
  it("by id", () => {
    expect(sortRows(rows, "id").map((r) => r.id)).toEqual(["JLS-001", "JLS-002", "MSR-001"]);
  });
  it("by source_locus, with null last", () => {
    const withNull: Row[] = [...rows, { id: "ZZZ", meta: null }];
    const ids = sortRows(withNull, "source_locus").map((r) => r.id);
    expect(ids).toEqual(["MSR-001", "JLS-001", "JLS-002", "ZZZ"]); // 5,10,20,null
  });
});

describe("URL search <-> selection round-trip", () => {
  it("parseSelection separates axes from reserved keys", () => {
    const s = parseSelection(
      { pillars: ["restraint", "justice"], identity_signal: "clean", locusMin: "10", q: "x", sort: "id", unknownAxis: "z" },
      { pillars: ["restraint", "justice"], hearts: ["patience"] },
    );
    expect(s.axes).toEqual({ pillars: ["restraint", "justice"] }); // unknownAxis ignored (not declared)
    expect(s.identity).toEqual(["clean"]);
    expect(s.locusMin).toBe(10);
    expect(s.q).toBe("x");
    expect(s.sort).toBe("id");
  });
  it("selectionToSearch omits empty/default and round-trips", () => {
    const original = sel({ axes: { pillars: ["a", "b"] }, identity: ["leaky"], locusMax: 50, q: "hi", sort: "source_locus" });
    const search = selectionToSearch(original);
    expect(search).toEqual({ pillars: ["a", "b"], identity_signal: ["leaky"], locusMax: "50", q: "hi", sort: "source_locus" });
    expect(parseSelection(search, { pillars: ["a", "b"] })).toEqual(original);
  });

  it("drops unknown axis values and identity values fail-soft (spec §5.3)", () => {
    const s = parseSelection(
      { pillars: ["restraint", "bogus"], identity_signal: ["clean", "nope"], unknownAxis: "x" },
      { pillars: ["restraint", "justice"] },
    );
    expect(s.axes.pillars).toEqual(["restraint"]); // 'bogus' dropped
    expect(s.identity).toEqual(["clean"]); // 'nope' dropped
    expect(Object.keys(s.axes)).toEqual(["pillars"]); // unknownAxis not in the declared map -> ignored
  });

  it("drops an axis filter whose values are all unknown (no zero-row trap)", () => {
    const s = parseSelection({ pillars: ["bogus"] }, { pillars: ["restraint"] });
    expect(s.axes.pillars).toBeUndefined();
  });
  it("isActive reflects whether any filter is set", () => {
    expect(isActive(sel())).toBe(false);
    expect(isActive(sel({ q: "x" }))).toBe(true);
    expect(isActive(sel({ axes: { pillars: ["a"] } }))).toBe(true);
  });
});

describe("computeFacets (data-driven discovery + counts)", () => {
  const map = (fs: { value: string; count: number }[]) => Object.fromEntries(fs.map((f) => [f.value, f.count]));

  it("discovers only axes/values present in the loaded rows (never the manifest)", () => {
    const f = computeFacets(rows, sel());
    // pillars/hearts from the sunni rows; the five judaism axes from MSR-001 — nothing else.
    expect(Object.keys(f.axes).sort()).toEqual(
      ["domain", "hearts", "middle_path", "middot", "pillars", "register", "virtues"].sort(),
    );
    expect(f.axes.pillars!.map((x) => x.value).sort()).toEqual(["justice", "restraint"]);
    expect(f.axes.hearts!.map((x) => x.value).sort()).toEqual(["patience", "vigilance"]);
  });

  it("a tradition whose loaded scenarios carry no tags yields no axis facets (no tag UI)", () => {
    const untagged: Row[] = [
      { id: "A", meta: { id: "A", tags: {}, sourceLocus: 1, locusLabel: "", identitySignal: "clean" } },
      { id: "B", meta: null },
    ];
    const f = computeFacets(untagged, sel());
    expect(f.axes).toEqual({});
    expect(f.identity.map((x) => x.value)).toEqual(["clean"]); // identity still discovered
  });

  it("orders values by the manifest vocabulary first, then unknown extras alphabetically", () => {
    const order = { pillars: ["justice", "restraint", "courage"] as const };
    const withExtra: Row[] = [row("X", { pillars: ["zeta", "restraint", "alpha"] })];
    const f = computeFacets(withExtra, sel(), order);
    // declared 'restraint' first (justice/courage absent from rows), then extras alpha
    expect(f.axes.pillars!.map((x) => x.value)).toEqual(["restraint", "alpha", "zeta"]);
  });

  it("counts reflect the current filters but EXCLUDE the value's own axis", () => {
    const unfiltered = computeFacets(rows, sel());
    expect(map(unfiltered.axes.pillars!)).toEqual({ restraint: 1, justice: 2 });

    // Selecting pillars=justice leaves pillars' own counts untouched (own-axis excluded)…
    const withPillar = computeFacets(rows, sel({ axes: { pillars: ["justice"] } }));
    expect(map(withPillar.axes.pillars!)).toEqual({ restraint: 1, justice: 2 });
    // …but narrows OTHER axes to the pillars=justice subset (JLS-001 + JLS-002).
    expect(map(withPillar.axes.hearts!)).toEqual({ patience: 1, vigilance: 1 });
  });

  it("identity facets are discovered + counted, excluding the identity filter itself", () => {
    const f = computeFacets(rows, sel({ identity: ["leaky"] }));
    // own-filter excluded: counts span all rows -> clean 2, leaky 1
    expect(map(f.identity)).toEqual({ clean: 2, leaky: 1 });
  });

  it("counts respect a non-own active filter (locus range) on identity", () => {
    const f = computeFacets(rows, sel({ locusMin: 10 }));
    // locus>=10 keeps JLS-001 (clean) + JLS-002 (leaky); MSR-001 (locus 5) drops out
    expect(map(f.identity)).toEqual({ clean: 1, leaky: 1 });
  });
});

describe("filterAndSort composes", () => {
  it("filters then sorts", () => {
    const out = filterAndSort(rows, sel({ identity: ["clean"], sort: "source_locus" }));
    expect(out.map((r) => r.id)).toEqual(["MSR-001", "JLS-001"]); // clean rows, by locus
  });
});
