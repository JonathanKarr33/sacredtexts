import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderApp } from "../test/renderApp";
import {
  sampleAnswersJsonl,
  sampleScoresJsonl,
  sampleSummary,
  sampleQuestionsJsonl,
} from "../local/sample";

afterEach(() => vi.unstubAllGlobals());

/** A fetcher keyed by exact URL; unknown URLs 404. */
function mapFetcher(files: Record<string, string>): typeof fetch {
  return (async (url: string) => {
    const body = files[url];
    if (body === undefined) return { ok: false, status: 404 } as Response;
    return { ok: true, status: 200, text: async () => body } as Response;
  }) as unknown as typeof fetch;
}

/** The four artifacts for a run id, all answered, from the in-memory sample. */
function runFiles(id: string): Record<string, string> {
  const base = `/runs/${id}`;
  return {
    [`${base}/summary.json`]: JSON.stringify(sampleSummary),
    [`${base}/scores.jsonl`]: sampleScoresJsonl,
    [`${base}/answers.jsonl`]: sampleAnswersJsonl,
    [`${base}/questions.jsonl`]: sampleQuestionsJsonl,
  };
}

describe("LeaderboardPage — states & run selection", () => {
  it("shows the empty state when the run index is empty", async () => {
    vi.stubGlobal("fetch", mapFetcher({ "/runs/_index": "[]" }));
    renderApp("/");
    expect(await screen.findByText(/No runs yet/i)).toBeInTheDocument();
  });

  it("treats a 200 HTML body for /runs/_index (prod static host) as no runs, not a crash", async () => {
    const html = '<!doctype html><html><body><div id="root"></div></body></html>';
    vi.stubGlobal("fetch", (async () => ({ ok: true, status: 200, text: async () => html })) as unknown as typeof fetch);
    renderApp("/");
    expect(await screen.findByText(/No runs yet/i)).toBeInTheDocument();
  });

  it("distinguishes an index fetch failure from an empty index", async () => {
    vi.stubGlobal("fetch", (async () => ({ ok: false, status: 500, text: async () => "" })) as unknown as typeof fetch);
    renderApp("/");
    expect(await screen.findByText(/Could not load the run index/i)).toBeInTheDocument();
  });

  it("defaults to the most-recent run (index[0]) and renders its leaderboard", async () => {
    vi.stubGlobal("fetch", mapFetcher({
      "/runs/_index": JSON.stringify([{ id: "run-newer", mtimeMs: 2 }, { id: "run-older", mtimeMs: 1 }]),
      ...runFiles("run-newer"),
      ...runFiles("run-older"),
    }));
    renderApp("/");
    expect(await screen.findByText("Leaderboard")).toBeInTheDocument();
    expect((screen.getByLabelText("Run") as HTMLSelectElement).value).toBe("run-newer");
  });

  it("honours ?run=<id> for a known run", async () => {
    vi.stubGlobal("fetch", mapFetcher({
      "/runs/_index": JSON.stringify([{ id: "run-newer", mtimeMs: 2 }, { id: "run-older", mtimeMs: 1 }]),
      ...runFiles("run-newer"),
      ...runFiles("run-older"),
    }));
    renderApp("/?run=run-older");
    expect(await screen.findByText("Leaderboard")).toBeInTheDocument();
    expect((screen.getByLabelText("Run") as HTMLSelectElement).value).toBe("run-older");
  });

  it("falls back to the default when ?run= is an unknown (old base-path) value", async () => {
    vi.stubGlobal("fetch", mapFetcher({
      "/runs/_index": JSON.stringify([{ id: "run-newer", mtimeMs: 2 }, { id: "run-older", mtimeMs: 1 }]),
      ...runFiles("run-newer"),
      ...runFiles("run-older"),
    }));
    // Old Spec-1 semantics put the full base path in ?run=; it is not a known id now.
    renderApp("/?run=%2Fruns%2Frun-older");
    expect(await screen.findByText("Leaderboard")).toBeInTheDocument();
    expect((screen.getByLabelText("Run") as HTMLSelectElement).value).toBe("run-newer");
  });

  it("switching the selector re-renders the leaderboard for the newly selected run", async () => {
    vi.stubGlobal("fetch", mapFetcher({
      "/runs/_index": JSON.stringify([{ id: "run-newer", mtimeMs: 2 }, { id: "run-older", mtimeMs: 1 }]),
      ...runFiles("run-newer"),
      ...runFiles("run-older"),
    }));
    renderApp("/");
    const select = (await screen.findByLabelText("Run")) as HTMLSelectElement;
    expect(select.value).toBe("run-newer");
    await userEvent.selectOptions(select, "run-older");
    await waitFor(() => expect((screen.getByLabelText("Run") as HTMLSelectElement).value).toBe("run-older"));
  });

  it("surfaces a localized error for a bad run but keeps the selector usable", async () => {
    vi.stubGlobal("fetch", mapFetcher({
      // The index is newest-first (listRuns sorts mtime desc), so index[0] = 'broken' is the
      // default selection; only its summary.json is served → loadRun fails.
      "/runs/_index": JSON.stringify([{ id: "broken", mtimeMs: 2 }, { id: "good", mtimeMs: 1 }]),
      "/runs/broken/summary.json": JSON.stringify(sampleSummary),
      ...runFiles("good"),
    }));
    renderApp("/");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load run broken/i);
    // the selector is still present and lists the good run, which can still be chosen
    expect(screen.getByRole("option", { name: "good" })).toBeInTheDocument();
    // and selecting it recovers the view — the bad run did not take the page down
    await userEvent.selectOptions(screen.getByLabelText("Run"), "good");
    expect(await screen.findByText("Leaderboard")).toBeInTheDocument();
    expect(screen.getAllByText("haiku").length).toBeGreaterThan(0);
  });
});

describe("LeaderboardPage — stale-request guard (rapid run switch)", () => {
  it("a slow earlier load cannot overwrite a newer selection", async () => {
    // Default selection ('slow') hangs until released; switching to 'fast' must win even
    // after 'slow' finally resolves.
    let releaseSlow!: () => void;
    const slowGate = new Promise<void>((r) => { releaseSlow = r; });

    const slowSummary = { ...sampleSummary, models: { slowmodel: { _overall: { n: 1, accuracy: 0.1 } } } };
    const fastSummary = { ...sampleSummary, models: { fastmodel: { _overall: { n: 1, accuracy: 0.9 } } } };
    const files: Record<string, string> = {
      "/runs/_index": JSON.stringify([{ id: "slow", mtimeMs: 2 }, { id: "fast", mtimeMs: 1 }]),
      "/runs/slow/summary.json": JSON.stringify(slowSummary),
      "/runs/slow/scores.jsonl": sampleScoresJsonl,
      "/runs/slow/answers.jsonl": sampleAnswersJsonl,
      "/runs/slow/questions.jsonl": sampleQuestionsJsonl,
      "/runs/fast/summary.json": JSON.stringify(fastSummary),
      "/runs/fast/scores.jsonl": sampleScoresJsonl,
      "/runs/fast/answers.jsonl": sampleAnswersJsonl,
      "/runs/fast/questions.jsonl": sampleQuestionsJsonl,
    };
    vi.stubGlobal("fetch", (async (url: string) => {
      if (url.startsWith("/runs/slow/")) await slowGate; // slow run stays pending
      const body = files[url];
      if (body === undefined) return { ok: false, status: 404 } as Response;
      return { ok: true, status: 200, text: async () => body } as Response;
    }) as unknown as typeof fetch);

    renderApp("/");
    const select = (await screen.findByLabelText("Run")) as HTMLSelectElement;
    expect(select.value).toBe("slow"); // default = most-recent, still loading

    await userEvent.selectOptions(select, "fast");
    // fast resolves immediately and renders
    expect(await screen.findByText("fastmodel")).toBeInTheDocument();

    // now let the earlier (slow) load finish: it must be ignored, not overwrite fast
    releaseSlow();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("slowmodel")).toBeNull();
    expect(screen.getByText("fastmodel")).toBeInTheDocument();
  });
});

// The committed-run gate, reworked onto the leaderboard: rendering runs/first-run-2026-10-11
// through the `/` page shows the 4 models ranked (claude-haiku first), the retrieve_quote +
// overall columns, the four traditions, and per-model token totals.
const runDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..", "runs/first-run-2026-10-11");
const present = existsSync(resolve(runDir, "summary.json"));

function committedRunFetcher(): typeof fetch {
  return (async (url: string) => {
    if (url === "/runs/_index") {
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: "first-run-2026-10-11", mtimeMs: 1 }]) } as Response;
    }
    const m = url.match(/^\/runs\/first-run-2026-10-11\/(.+)$/);
    if (m) {
      try {
        const body = readFileSync(resolve(runDir, m[1]!), "utf-8");
        return { ok: true, status: 200, text: async () => body } as Response;
      } catch {
        return { ok: false, status: 404 } as Response;
      }
    }
    return { ok: false, status: 404 } as Response;
  }) as unknown as typeof fetch;
}

describe.skipIf(!present)("LeaderboardPage — committed run gate", () => {
  it("renders the committed run's leaderboard: ranking, columns, traditions, tokens", async () => {
    vi.stubGlobal("fetch", committedRunFetcher());
    renderApp("/");
    expect(await screen.findByText("Leaderboard")).toBeInTheDocument();

    // ranking (main table): claude-haiku (0.24) first, the two 0.0 models last (id tiebreak)
    const mainTable = screen.getAllByRole("table")[0]!;
    const dataRows = within(mainTable).getAllByRole("row").slice(1); // drop header
    const order = dataRows.map((r) => within(r).getAllByRole("cell")[0]!.textContent);
    expect(order).toEqual(["claude-haiku", "llama-3.1-8b", "gemma-3-4b", "gpt-oss-20b"]);

    // task + overall columns
    expect(within(mainTable).getByText("retrieve_quote")).toBeInTheDocument();
    expect(within(mainTable).getByText("overall")).toBeInTheDocument();

    // per-model token totals (claude-haiku: 5,810 in / 41,140 out / 100 calls)
    expect(screen.getByText("5,810 in · 41,140 out · 100 calls")).toBeInTheDocument();

    // four traditions (each repeats once per model row in the by-tradition table)
    expect(screen.getAllByText("Judaism").length).toBe(4);
    expect(screen.getAllByText("Protestant Christian").length).toBe(4);
    expect(screen.getAllByText("Roman Catholic").length).toBe(4);
    expect(screen.getAllByText("The Church of Jesus Christ of Latter-Day Saints").length).toBe(4);
    // the LDS cell at 76% for claude-haiku (Spec 15: +1 wrapped-exact flip in the LDS tradition, 18/25→19/25)
    expect(screen.getAllByText("76% (n=25)").length).toBeGreaterThan(0);
  });
});
