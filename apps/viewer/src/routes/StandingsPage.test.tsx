import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderApp } from "../test/renderApp";
import { type Summary } from "../lib/localResults";

afterEach(() => vi.unstubAllGlobals());

const ANTHROPIC = { provider: "anthropic", model: "claude-haiku-5-5", endpoint: "api.anthropic.com", served_by: null };

/** A fetcher that serves `/runs/_index` and each run's `summary.json` (standings only reads
 * summary.json); any other URL 404s. */
function standingsFetcher(
  index: { id: string; mtimeMs: number }[],
  summaries: Record<string, Summary>,
): typeof fetch {
  return (async (url: string) => {
    if (url === "/runs/_index") {
      return { ok: true, status: 200, text: async () => JSON.stringify(index) } as Response;
    }
    const m = url.match(/^\/runs\/([^/]+)\/summary\.json$/);
    if (m && summaries[m[1]!]) {
      return { ok: true, status: 200, text: async () => JSON.stringify(summaries[m[1]!]) } as Response;
    }
    return { ok: false, status: 404 } as Response;
  }) as unknown as typeof fetch;
}

describe("StandingsPage — states", () => {
  it("shows the empty state when there are no runs", async () => {
    vi.stubGlobal("fetch", standingsFetcher([], {}));
    renderApp("/standings");
    expect(await screen.findByText(/No runs yet/i)).toBeInTheDocument();
  });

  it("shows a localized error when the run index cannot be fetched", async () => {
    vi.stubGlobal("fetch", (async () => ({ ok: false, status: 500, text: async () => "" })) as unknown as typeof fetch);
    renderApp("/standings");
    expect(await screen.findByText(/Could not load standings/i)).toBeInTheDocument();
  });
});

describe("StandingsPage — cross-run rollup", () => {
  it("sources shared models from the newer run, older-only models from the older, one row per identity", async () => {
    const summaries: Record<string, Summary> = {
      "run-b": {
        models: { claude: { retrieve_quote: { n: 2, accuracy: 0.5 }, _overall: { n: 2, accuracy: 0.5 } } },
        by_tradition: {},
        panel: { claude: ANTHROPIC },
      },
      "run-a": {
        models: {
          claude: { retrieve_quote: { n: 2, accuracy: 0.2 }, _overall: { n: 2, accuracy: 0.2 } },
          legacy: { retrieve_quote: { n: 2, accuracy: 0.1 }, _overall: { n: 2, accuracy: 0.1 } },
        },
        by_tradition: {},
        panel: { claude: ANTHROPIC, legacy: { provider: "openai", model: "legacy-x", endpoint: "e", served_by: null } },
      },
    };
    vi.stubGlobal("fetch", standingsFetcher(
      [{ id: "run-b", mtimeMs: 2 }, { id: "run-a", mtimeMs: 1 }],
      summaries,
    ));
    renderApp("/standings");
    expect(await screen.findByText("Current standings")).toBeInTheDocument();

    const table = screen.getByRole("table");
    const dataRows = within(table).getAllByRole("row").slice(1); // drop header
    expect(dataRows).toHaveLength(2); // one row per (provider,model) identity
    // ranked by overall desc: claude (0.5, from run-b) first, legacy (0.1, from run-a) last
    expect(within(dataRows[0]!).getByRole("link", { name: "claude" })).toBeInTheDocument();
    expect(within(dataRows[1]!).getByRole("link", { name: "legacy" })).toBeInTheDocument();

    // claude's standing comes from the NEWER run (run-b, overall 0.5) and links into it
    expect(within(dataRows[0]!).getAllByText("50% (n=2)").length).toBeGreaterThan(0);
    expect(within(dataRows[0]!).getByRole("link", { name: "run-b" }).getAttribute("href")).toContain("run=run-b");
    // legacy appears only in the older run and is sourced from it
    expect(within(dataRows[1]!).getByRole("link", { name: "run-a" }).getAttribute("href")).toContain("run=run-a");
  });

  it("surfaces the tools setting in the subtext so a search-on row is visibly distinct from off", async () => {
    // Two arms of one model (same provider/model, tools on vs. off) are distinct identities
    // under Approach B; the standings row must show the tools setting so they're not two
    // visually identical rows. (Spec: "the standings page visibly distinguishes a search-on
    // row from a search-off row".)
    const summaries: Record<string, Summary> = {
      "run-a": {
        models: {
          haiku: { retrieve_quote: { n: 1, accuracy: 0.5 }, _overall: { n: 1, accuracy: 0.5 } },
          "haiku-search": { retrieve_quote: { n: 1, accuracy: 0.4 }, _overall: { n: 1, accuracy: 0.4 } },
        },
        by_tradition: {},
        panel: {
          haiku: { ...ANTHROPIC, tools: [] },
          "haiku-search": { ...ANTHROPIC, tools: ["web_search"] },
        },
      },
    };
    vi.stubGlobal("fetch", standingsFetcher([{ id: "run-a", mtimeMs: 1 }], summaries));
    renderApp("/standings");
    expect(await screen.findByText("Current standings")).toBeInTheDocument();

    const table = screen.getByRole("table");
    const dataRows = within(table).getAllByRole("row").slice(1);
    expect(dataRows).toHaveLength(2); // two tool-arm identities, not collapsed into one row

    const rowFor = (modelId: string) =>
      dataRows.find((r) => within(r).queryByRole("link", { name: modelId }))!;
    // the search-on row shows its tools setting as a `· web_search` tag; the no-tools row shows none
    expect(rowFor("haiku-search").textContent).toContain("anthropic / claude-haiku-5-5 · web_search");
    expect(rowFor("haiku").textContent).toContain("anthropic / claude-haiku-5-5");
    expect(rowFor("haiku").textContent).not.toContain("web_search");
  });

  it("shows the resolved recency date (from generated_at), and 'date unknown' when no signal exists", async () => {
    const summaries: Record<string, Summary> = {
      // Has generated_at → recency Oct 12, shown as "dated 2026-10-12".
      dated: {
        models: { claude: { _overall: { n: 1, accuracy: 0.5 } } },
        by_tradition: {},
        panel: { claude: ANTHROPIC },
        generated_at: "2026-10-12T01:20:16+00:00",
      },
      // No generated_at, no date in the id, and mtime 0 → recency 0 → "date unknown".
      nameless: {
        models: { legacy: { _overall: { n: 1, accuracy: 0.1 } } },
        by_tradition: {},
        panel: { legacy: { provider: "openai", model: "legacy-x", endpoint: "e", served_by: null } },
      },
    };
    vi.stubGlobal("fetch", standingsFetcher(
      [{ id: "dated", mtimeMs: 0 }, { id: "nameless", mtimeMs: 0 }],
      summaries,
    ));
    renderApp("/standings");
    expect(await screen.findByText("Current standings")).toBeInTheDocument();

    const table = screen.getByRole("table");
    const rowFor = (model: string) =>
      within(table).getAllByRole("row").find((r) => within(r).queryByRole("link", { name: model }));
    expect(within(rowFor("claude")!).getByText("dated 2026-10-12")).toBeInTheDocument();
    expect(within(rowFor("legacy")!).getByText("date unknown")).toBeInTheDocument();
  });

  it("skips a run whose summary.json is missing but surfaces it as omitted (never silently)", async () => {
    vi.stubGlobal("fetch", standingsFetcher(
      // 'broken' has no summary entry → skipped; 'good' still rolls up.
      [{ id: "broken", mtimeMs: 2 }, { id: "good", mtimeMs: 1 }],
      { good: { models: { claude: { _overall: { n: 1, accuracy: 0.4 } } }, by_tradition: {}, panel: { claude: ANTHROPIC } } },
    ));
    renderApp("/standings");
    expect(await screen.findByText("Current standings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "claude" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "good" }).getAttribute("href")).toContain("run=good");
    // the dropped run is named so a stale "current" standing is never presented as complete
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/could not be read and is omitted/i);
    expect(notice).toHaveTextContent("broken");
  });
});

// The committed-run gate: standings over the single committed run must equal that run's
// leaderboard rows — same 4 models, same ranking (claude-haiku first), each keyed on its
// panel (provider, model) identity and linking back into the run via /?run=<id>.
const runDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..", "runs/first-run-2026-10-11");
const present = existsSync(resolve(runDir, "summary.json"));

function committedStandingsFetcher(): typeof fetch {
  return (async (url: string) => {
    if (url === "/runs/_index") {
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: "first-run-2026-10-11", mtimeMs: 1 }]) } as Response;
    }
    if (url === "/runs/first-run-2026-10-11/summary.json") {
      const body = readFileSync(resolve(runDir, "summary.json"), "utf-8");
      return { ok: true, status: 200, text: async () => body } as Response;
    }
    return { ok: false, status: 404 } as Response;
  }) as unknown as typeof fetch;
}

describe.skipIf(!present)("StandingsPage — committed run gate", () => {
  it("over the committed run alone, standings equal that run's leaderboard rows", async () => {
    expect(present).toBe(true); // a vanished committed fixture must fail loudly, not skip silently
    vi.stubGlobal("fetch", committedStandingsFetcher());
    renderApp("/standings");
    expect(await screen.findByText("Current standings")).toBeInTheDocument();

    const table = screen.getByRole("table");
    const dataRows = within(table).getAllByRole("row").slice(1);
    const order = dataRows.map((r) => within(r).getAllByRole("link")[0]!.textContent);
    expect(order).toEqual(["claude-haiku", "llama-3.1-8b", "gemma-3-4b", "gpt-oss-20b"]);

    // panel identity is shown, and claude-haiku's overall is its leaderboard value (Spec 15 phase 3:
    // accuracy excludes the 55 refusals → 25 correct / 45 graded = 56%, up from the phase-1 25%/100)
    // (retrieve_quote is the only task, so the task cell and the overall cell both read it)
    expect(screen.getByText("anthropic / claude-haiku-5-5")).toBeInTheDocument();
    expect(within(dataRows[0]!).getAllByText("56% (n=100)").length).toBeGreaterThan(0);
    // every row links back into the source run
    expect(within(dataRows[0]!).getByRole("link", { name: "first-run-2026-10-11" }).getAttribute("href")).toContain(
      "run=first-run-2026-10-11",
    );
  });
});

describe("StandingsPage — evaluator provenance (Spec 15)", () => {
  const ANTH = (model: string) => ({ provider: "anthropic", model, tools: [], endpoint: "e", served_by: null });
  const cell = (acc: number) => ({ n: 2, accuracy: acc, coverage: 1.0, correct: 2, incorrect: 0, refused: 0 });

  it("flags standings that mix runs scored under different evaluator contracts", async () => {
    const summaries: Record<string, Summary> = {
      "run-strict": {
        models: { a: { retrieve_quote: cell(0.5), _overall: cell(0.5) } },
        by_tradition: {},
        panel: { a: ANTH("model-a") },
        evaluators: ["strict"],
      },
      "run-default": {
        models: { b: { retrieve_quote: cell(0.9), _overall: cell(0.9) } },
        by_tradition: {},
        panel: { b: ANTH("model-b") },
        evaluators: ["strict", "containment"],
      },
    };
    vi.stubGlobal("fetch", standingsFetcher([{ id: "run-default", mtimeMs: 2 }, { id: "run-strict", mtimeMs: 1 }], summaries));
    renderApp("/standings");
    expect(await screen.findByText("Current standings")).toBeInTheDocument();
    // the heterogeneous-contract warning names both contracts (role=status is the banner <p>)
    const warn = screen.getByRole("status");
    expect(warn.textContent).toMatch(/different evaluator contracts/i);
    expect(warn.textContent).toContain("strict");
    expect(warn.textContent).toContain("strict + containment");
  });

  it("shows a single-contract subtext (no warning) when all runs share evaluators", async () => {
    const summaries: Record<string, Summary> = {
      "run-1": {
        models: { a: { retrieve_quote: cell(0.5), _overall: cell(0.5) } },
        by_tradition: {},
        panel: { a: ANTH("model-a") },
        evaluators: ["strict", "containment"],
      },
    };
    vi.stubGlobal("fetch", standingsFetcher([{ id: "run-1", mtimeMs: 1 }], summaries));
    renderApp("/standings");
    expect(await screen.findByText("Current standings")).toBeInTheDocument();
    expect(screen.queryByText(/different evaluator contracts/i)).toBeNull();
    expect(screen.getByText(/All runs scored by evaluators:/i).textContent).toContain("strict + containment");
  });
});
