import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, render } from "@testing-library/react";
import { renderApp } from "../test/renderApp";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { InterimHome } from "./InterimHome";
import {
  sampleAnswersJsonl,
  sampleScoresJsonl,
  sampleSummary,
  sampleQuestionsJsonl,
} from "../local/sample";

afterEach(() => vi.unstubAllGlobals());

/** A fetcher that returns 200 with one body for every URL (for the index-only tests). */
function constFetcher(body: string): typeof fetch {
  return (async () => ({ ok: true, status: 200, text: async () => body })) as unknown as typeof fetch;
}

/** A fetcher keyed by exact URL; unknown URLs 404. */
function mapFetcher(files: Record<string, string>): typeof fetch {
  return (async (url: string) => {
    const body = files[url];
    if (body === undefined) return { ok: false, status: 404 } as Response;
    return { ok: true, status: 200, text: async () => body } as Response;
  }) as unknown as typeof fetch;
}

describe("routing", () => {
  it("renders an in-SPA 404 for an unknown route", async () => {
    renderApp("/totally/unknown/path");
    expect(await screen.findByText("404")).toBeInTheDocument();
  });
});

describe("app shell", () => {
  it("shows the Sacred Texts brand and no multibrowser nav/GitHub link", async () => {
    vi.stubGlobal("fetch", constFetcher("[]")); // empty run index → home resolves to empty state
    renderApp("/");
    expect(await screen.findByRole("link", { name: /Sacred Texts/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /traditions on GitHub/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Results$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Review$/ })).toBeNull();
  });
});

describe("InterimHome (interim local-results home)", () => {
  it("shows the empty state when the run index is empty", async () => {
    render(<InterimHome fetcher={constFetcher("[]")} />);
    expect(await screen.findByText(/No runs yet/i)).toBeInTheDocument();
  });

  it("treats a 200 HTML body for /runs/_index (prod static host) as no runs, not a crash", async () => {
    // A production static host has no /runs endpoint, so /runs/_index falls through to the SPA
    // index.html (200 HTML). The home page must shape-sniff that into the empty state.
    const html = '<!doctype html><html><body><div id="root"></div></body></html>';
    render(<InterimHome fetcher={constFetcher(html)} />);
    expect(await screen.findByText(/No runs yet/i)).toBeInTheDocument();
  });

  it("loads and renders the most-recent run (index[0]) through LocalResults", async () => {
    const files = {
      // index is newest-first (listRuns sorts mtime desc); InterimHome picks the first entry.
      "/runs/_index": JSON.stringify([
        { id: "run-newer", mtimeMs: 2 },
        { id: "run-older", mtimeMs: 1 },
      ]),
      "/runs/run-newer/summary.json": JSON.stringify(sampleSummary),
      "/runs/run-newer/scores.jsonl": sampleScoresJsonl,
      "/runs/run-newer/answers.jsonl": sampleAnswersJsonl,
      "/runs/run-newer/questions.jsonl": sampleQuestionsJsonl,
    };
    render(<InterimHome fetcher={mapFetcher(files)} />);
    expect(await screen.findByText(/run: run-newer/)).toBeInTheDocument();
    expect(screen.getAllByText("haiku").length).toBeGreaterThan(0);
    expect(screen.getByText(/Per-question scores \(4\)/)).toBeInTheDocument();
  });

  it("surfaces a localized error when the most-recent run cannot be loaded", async () => {
    const files = {
      "/runs/_index": JSON.stringify([{ id: "broken", mtimeMs: 1 }]),
      // Only summary.json is served; the other three artifacts 404, so loadRun returns a typed
      // failure and the home page surfaces a localized error instead of crashing.
      "/runs/broken/summary.json": JSON.stringify(sampleSummary),
    };
    render(<InterimHome fetcher={mapFetcher(files)} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load run broken/i);
  });
});

describe("ErrorBoundary", () => {
  it("catches a thrown render error and shows a message, not a blank page", () => {
    const Boom = () => {
      throw new Error("kaboom");
    };
    // Silence the expected console.error from the boundary.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/Something went wrong/);
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    spy.mockRestore();
  });
});
