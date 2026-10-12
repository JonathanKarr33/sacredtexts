import { describe, it, expect } from "vitest";
import { runRecencyMs, recencyDate } from "./recency";

describe("runRecencyMs — precedence (Issue #7)", () => {
  it("prefers generated_at over both the run-id date and mtime", () => {
    // generated_at is a day LATER than the id date and mtime is ancient — generated_at wins.
    const ms = runRecencyMs({
      generatedAt: "2026-10-12T01:20:16.523576+00:00",
      runId: "tutorial-2026-10-11",
      mtimeMs: 1,
    });
    expect(ms).toBe(Date.parse("2026-10-12T01:20:16.523576+00:00"));
    expect(recencyDate(ms)).toBe("2026-10-12");
  });

  it("falls back to the run-id date when generated_at is absent/null/non-string", () => {
    const expected = Date.UTC(2026, 9, 11); // 2026-10-11 UTC midnight
    for (const generatedAt of [undefined, null, "" as string, 123 as unknown as string]) {
      expect(
        runRecencyMs({ generatedAt: generatedAt as string | null, runId: "first-run-2026-10-11", mtimeMs: 999 }),
      ).toBe(expected);
    }
  });

  it("falls back to mtime when neither generated_at nor a run-id date is available", () => {
    expect(runRecencyMs({ runId: "nameless-run", mtimeMs: 4242 })).toBe(4242);
  });

  it("returns 0 when no signal at all is available (sorts oldest, never throws)", () => {
    expect(runRecencyMs({ runId: "nameless-run" })).toBe(0);
    expect(runRecencyMs({ runId: "nameless-run", mtimeMs: NaN })).toBe(0);
  });

  it("ignores an unparseable generated_at and a non-date id, dropping to mtime", () => {
    expect(runRecencyMs({ generatedAt: "not-a-timestamp", runId: "run-xyz", mtimeMs: 7 })).toBe(7);
  });

  it("rejects an invalid calendar date embedded in the id (does not roll over)", () => {
    // 2026-13-40 is not a real date; Date.UTC would silently roll it over, so it must be
    // rejected and recency must drop to mtime.
    expect(runRecencyMs({ runId: "bad-2026-13-40", mtimeMs: 55 })).toBe(55);
  });

  it("mines the FIRST YYYY-MM-DD in the id", () => {
    expect(runRecencyMs({ runId: "exp-2026-01-02-redo-2025-12-31" })).toBe(Date.UTC(2026, 0, 2));
  });

  it("orders two fresh-clone runs (equal mtime) by their true recency, not id-ascending", () => {
    // The Issue #7 scenario: both share the checkout mtime. By mtime+id-asc, the OLDER
    // `first-run` would wrongly rank newest. generated_at/run-id date fix the order.
    const first = runRecencyMs({ runId: "first-run-2026-10-11", mtimeMs: 100 });
    const tutorial = runRecencyMs({
      generatedAt: "2026-10-12T01:20:16+00:00",
      runId: "tutorial-2026-10-11",
      mtimeMs: 100,
    });
    expect(tutorial).toBeGreaterThan(first);
  });
});

describe("recencyDate", () => {
  it("renders epoch-ms as a timezone-independent ISO calendar day", () => {
    expect(recencyDate(Date.UTC(2026, 9, 12))).toBe("2026-10-12");
  });
});
