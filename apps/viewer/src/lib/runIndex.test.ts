import { describe, it, expect } from "vitest";
import { fetchRunIndex } from "./runIndex";

/** A fetcher that answers `/runs/_index` with a fixed Response; any other URL 404s. */
function indexFetcher(res: Partial<Response> & { textBody?: string }): typeof fetch {
  return (async (url: string) => {
    if (url !== "/runs/_index") return { ok: false, status: 404 } as Response;
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      text: async () => res.textBody ?? "",
    } as Response;
  }) as unknown as typeof fetch;
}

describe("fetchRunIndex", () => {
  it("sorts newest-first (mtime desc, id asc) even when the endpoint returns them out of order", async () => {
    // Deliberately NOT newest-first, and with an equal-mtime pair to exercise the id tiebreak.
    const result = await fetchRunIndex(
      indexFetcher({
        textBody: JSON.stringify([
          { id: "old", mtimeMs: 1 },
          { id: "new-b", mtimeMs: 5 },
          { id: "new-a", mtimeMs: 5 },
        ]),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // mtime desc first; the 5/5 tie resolves id asc (new-a before new-b).
    expect(result.runs.map((r) => r.id)).toEqual(["new-a", "new-b", "old"]);
    expect(result.runs[0]!.mtimeMs).toBe(5);
  });

  it("treats a 200 HTML body (prod static host) as no runs, not a crash", async () => {
    const result = await fetchRunIndex(indexFetcher({ textBody: "<!doctype html><html></html>" }));
    expect(result).toEqual({ ok: true, runs: [] });
  });

  it("reports a non-200 as a fetch failure", async () => {
    const result = await fetchRunIndex(indexFetcher({ ok: false, status: 500 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("HTTP 500");
  });

  it("rejects a non-array body as malformed", async () => {
    const result = await fetchRunIndex(indexFetcher({ textBody: '{"not":"a list"}' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("not a list");
  });

  it("drops entries without a string id and defaults a missing mtime to 0", async () => {
    const result = await fetchRunIndex(
      indexFetcher({ textBody: JSON.stringify([{ id: "ok" }, { mtimeMs: 9 }, "garbage"]) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runs).toEqual([{ id: "ok", mtimeMs: 0 }]);
  });
});
