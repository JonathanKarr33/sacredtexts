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
