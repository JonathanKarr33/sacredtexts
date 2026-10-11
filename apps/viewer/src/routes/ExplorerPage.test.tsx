import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderApp } from "../test/renderApp";
import {
  sampleAnswersJsonl,
  sampleScoresJsonl,
  sampleSummary,
  sampleQuestionsWithMissingJsonl,
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

// A run whose roster carries an extra question (ccc) that no model answered — the Phase-1
// `missing > 0` fixture — so the missing-cell path is exercisable end-to-end.
const missingFixtureFiles = {
  "/runs/fix/summary.json": JSON.stringify(sampleSummary),
  "/runs/fix/scores.jsonl": sampleScoresJsonl,
  "/runs/fix/answers.jsonl": sampleAnswersJsonl,
  "/runs/fix/questions.jsonl": sampleQuestionsWithMissingJsonl,
};

describe("ExplorerPage — missing-cell vs wrong-answer (fixture)", () => {
  it("lists every roster question for the model, including the missing one", async () => {
    vi.stubGlobal("fetch", mapFetcher(missingFixtureFiles));
    renderApp("/run/fix/model/haiku");
    expect(await screen.findByText("Error explorer")).toBeInTheDocument();
    // haiku's three roster questions: aaa (correct), bbb (wrong), ccc (missing)
    expect(screen.getByText("retrieve_quote-aaa")).toBeInTheDocument();
    expect(screen.getByText("retrieve_quote-bbb")).toBeInTheDocument();
    expect(screen.getByText("retrieve_quote-ccc")).toBeInTheDocument();
    expect(screen.getByText(/no answer produced/i)).toBeInTheDocument();
    // 3 questions · 1 correct · 1 wrong · 1 missing
    expect(
      screen.getByText((c) => c.includes("3 questions") && c.includes("1 missing")),
    ).toBeInTheDocument();
  });

  it("the missing-cell filter shows only the un-answered question, distinct from wrong", async () => {
    vi.stubGlobal("fetch", mapFetcher(missingFixtureFiles));
    renderApp("/run/fix/model/haiku?mode=missing");
    expect(await screen.findByText("Error explorer")).toBeInTheDocument();
    expect(screen.getByText("retrieve_quote-ccc")).toBeInTheDocument();
    expect(screen.getByText(/no answer produced/i)).toBeInTheDocument();
    // the wrong answer (bbb) and the correct one (aaa) are filtered out
    expect(screen.queryByText("retrieve_quote-bbb")).toBeNull();
    expect(screen.queryByText("retrieve_quote-aaa")).toBeNull();
  });

  it("the wrong-answer filter shows the answered-but-incorrect question, not the missing one", async () => {
    vi.stubGlobal("fetch", mapFetcher(missingFixtureFiles));
    renderApp("/run/fix/model/haiku?mode=wrong");
    expect(await screen.findByText("Error explorer")).toBeInTheDocument();
    expect(screen.getByText("retrieve_quote-bbb")).toBeInTheDocument();
    expect(screen.queryByText("retrieve_quote-ccc")).toBeNull();
    // a wrong answer shows its three per-metric scores
    expect(screen.getAllByText("exact").length).toBeGreaterThan(0);
    expect(screen.getAllByText("normalized").length).toBeGreaterThan(0);
    expect(screen.getAllByText("token-F1").length).toBeGreaterThan(0);
  });

  it("selecting a failure-mode filter narrows the list, and 'all' restores it (clearing)", async () => {
    vi.stubGlobal("fetch", mapFetcher(missingFixtureFiles));
    renderApp("/run/fix/model/haiku");
    expect(await screen.findByText("Error explorer")).toBeInTheDocument();
    expect(screen.getByText(/Showing 3 of 3/)).toBeInTheDocument();

    // drive the actual <select> → onChange → navigate(search) → URL → re-filter
    await userEvent.selectOptions(screen.getByLabelText("Filter by failure mode"), "missing");
    await waitFor(() => expect(screen.getByText(/Showing 1 of 3/)).toBeInTheDocument());
    expect(screen.getByText("retrieve_quote-ccc")).toBeInTheDocument();
    expect(screen.queryByText("retrieve_quote-bbb")).toBeNull();

    // clearing back to "all" restores the full list
    await userEvent.selectOptions(screen.getByLabelText("Filter by failure mode"), "all");
    await waitFor(() => expect(screen.getByText(/Showing 3 of 3/)).toBeInTheDocument());
    expect(screen.getByText("retrieve_quote-bbb")).toBeInTheDocument();
  });

  it("parses a tradition from the URL (the leaderboard link's '+'↔space round-trip)", async () => {
    vi.stubGlobal("fetch", mapFetcher(missingFixtureFiles));
    // The sample's questions are all tradition "Protestant Christian" (a value with a space);
    // the leaderboard links it as tradition=Protestant+Christian, which must parse back.
    renderApp("/run/fix/model/haiku?tradition=Protestant+Christian");
    expect(await screen.findByText("Error explorer")).toBeInTheDocument();
    expect(screen.getByText(/Showing 3 of 3/)).toBeInTheDocument();
    expect(screen.getByText("retrieve_quote-aaa")).toBeInTheDocument();
    // a tradition that matches nothing yields the empty state
    renderApp("/run/fix/model/haiku?tradition=Nonexistent");
    await waitFor(() => expect(screen.getByText(/Showing 0 of 3/)).toBeInTheDocument());
  });

  it("flags a model that is not in the run rather than showing an empty run", async () => {
    vi.stubGlobal("fetch", mapFetcher(missingFixtureFiles));
    renderApp("/run/fix/model/does-not-exist");
    expect(await screen.findByText(/Model not in this run/i)).toBeInTheDocument();
    // not the "0 questions" / "No questions match" empty-run phrasing
    expect(screen.queryByText(/No questions match/i)).toBeNull();
  });

  it("the back-to-leaderboard link targets /?run=<runId>", async () => {
    vi.stubGlobal("fetch", mapFetcher(missingFixtureFiles));
    renderApp("/run/fix/model/haiku");
    const back = await screen.findByRole("link", { name: /back to leaderboard/i });
    expect(back).toHaveAttribute("href", "/?run=fix");
  });

  it("surfaces a localized error for a run that fails to load", async () => {
    vi.stubGlobal("fetch", mapFetcher({ "/runs/fix/summary.json": JSON.stringify(sampleSummary) }));
    renderApp("/run/fix/model/haiku");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load run fix/i);
  });
});

// The committed-run drill-in gate: claude-haiku over runs/first-run-2026-10-11.
const runDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..", "runs/first-run-2026-10-11");
const present = existsSync(resolve(runDir, "summary.json"));

function committedRunFetcher(): typeof fetch {
  return (async (url: string) => {
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

describe.skipIf(!present)("ExplorerPage — committed run drill-in gate", () => {
  it("claude-haiku: 100 questions, 24 correct; a failing row shows all three metrics", async () => {
    expect(present).toBe(true); // a vanished committed run should fail loudly, not silently skip
    vi.stubGlobal("fetch", committedRunFetcher());
    renderApp("/run/first-run-2026-10-11/model/claude-haiku");
    expect(await screen.findByText("Error explorer")).toBeInTheDocument();
    // 100 roster questions, 24 correct (overall accuracy 0.24), 0 missing
    expect(
      screen.getByText((c) => c.includes("100 questions") && c.includes("24 correct") && c.includes("0 missing")),
    ).toBeInTheDocument();
    expect(screen.getByText(/Showing 100 of 100/)).toBeInTheDocument();
    // per-metric scores render for the (many) failing rows
    expect(screen.getAllByText("exact").length).toBeGreaterThan(0);
    expect(screen.getAllByText("normalized").length).toBeGreaterThan(0);
    expect(screen.getAllByText("token-F1").length).toBeGreaterThan(0);
  });

  it("filtering by correct=correct narrows to the 24 correct answers", async () => {
    expect(present).toBe(true);
    vi.stubGlobal("fetch", committedRunFetcher());
    renderApp("/run/first-run-2026-10-11/model/claude-haiku?correct=correct");
    expect(await screen.findByText("Error explorer")).toBeInTheDocument();
    expect(screen.getByText(/Showing 24 of 100/)).toBeInTheDocument();
  });
});
