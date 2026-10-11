import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { LeaderboardTable } from "./LeaderboardTable";
import type { Summary } from "../lib/localResults";

// LeaderboardTable now renders TanStack <Link>s into the explorer, so it needs a router
// context. Mount it under a throwaway router whose root renders the table and which
// registers the explorer route path so the links resolve to real hrefs.
async function renderTable(summary: Summary, runId = "run-1") {
  const rootRoute = createRootRoute({
    component: () => <LeaderboardTable summary={summary} runId={runId} />,
  });
  const explorerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/run/$runId/model/$modelId",
    component: () => null,
    validateSearch: (s: Record<string, unknown>) => s,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([explorerRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const result = render(<RouterProvider router={router} />);
  // The router resolves its initial route asynchronously; wait for the table to mount
  // (the "Leaderboard" heading is unique, unlike the two tables when traditions render).
  await screen.findByText("Leaderboard");
  return result;
}

const summary: Summary = {
  models: {
    gpt: { retrieve_quote: { n: 10, accuracy: 0.0 }, _overall: { n: 10, accuracy: 0.0 } },
    gemma: { retrieve_quote: { n: 10, accuracy: 0.0 }, _overall: { n: 10, accuracy: 0.0 } },
    haiku: { retrieve_quote: { n: 10, accuracy: 0.6 }, _overall: { n: 10, accuracy: 0.6 } },
  },
  by_tradition: {
    haiku: {
      Judaism: { retrieve_quote: { n: 5, accuracy: 0.4 }, _overall: { n: 5, accuracy: 0.4 } },
      "The Church of Jesus Christ of Latter-Day Saints": {
        retrieve_quote: { n: 5, accuracy: 0.72 },
        _overall: { n: 5, accuracy: 0.72 },
      },
    },
  },
  usage: {
    per_model: { haiku: { calls: 10, in: 5810, out: 41140 } },
    total: { calls: 10, in: 5810, out: 41140 },
  },
};

describe("LeaderboardTable", () => {
  it("ranks models (best first, id tiebreak) with task/overall/token columns", async () => {
    await renderTable(summary);
    const rows = screen.getAllByRole("row");
    // header + 3 model rows + by-tradition header + 2 tradition rows
    const modelCells = rows
      .map((r) => within(r).queryAllByRole("cell")[0]?.textContent)
      .filter(Boolean);
    // first three data rows are the ranked models: haiku (0.6), then gemma/gpt (0.0, id tiebreak)
    expect(modelCells.slice(0, 3)).toEqual(["haiku", "gemma", "gpt"]);
    expect(screen.getAllByText("60% (n=10)").length).toBeGreaterThan(0);
    expect(screen.getByText("5,810 in · 41,140 out · 10 calls")).toBeInTheDocument();
  });

  it("links the model name into the explorer and task cells with a task prefilter", async () => {
    await renderTable(summary, "run-xyz");
    const haikuLink = screen.getByRole("link", { name: "haiku" });
    expect(haikuLink).toHaveAttribute("href", "/run/run-xyz/model/haiku");
    // the per-task cell links carry the task as a prefilter (?task=retrieve_quote)
    const taskLink = screen.getAllByRole("link", { name: "60% (n=10)" })[0]!;
    expect(taskLink.getAttribute("href")).toBe("/run/run-xyz/model/haiku?task=retrieve_quote");
  });

  it("renders the by-tradition breakdown including the LDS cell", async () => {
    await renderTable(summary);
    expect(screen.getByText("By tradition")).toBeInTheDocument();
    expect(
      screen.getByText("The Church of Jesus Christ of Latter-Day Saints"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("72% (n=5)").length).toBeGreaterThan(0);
  });

  it("tradition task cells link with both task and tradition prefilters", async () => {
    await renderTable(summary, "run-xyz");
    const ldsLink = screen.getAllByRole("link", { name: "72% (n=5)" })[0]!;
    const href = ldsLink.getAttribute("href")!;
    expect(href).toContain("/run/run-xyz/model/haiku?");
    expect(href).toContain("task=retrieve_quote");
    // TanStack form-encodes query spaces as '+' (not %20)
    expect(href).toContain("tradition=The+Church+of+Jesus+Christ+of+Latter-Day+Saints");
  });

  it("omits the by-tradition section when the run has no by_tradition data", async () => {
    await renderTable({ models: summary.models, by_tradition: {} });
    expect(screen.queryByText("By tradition")).toBeNull();
  });

  it("renders a null-overall model as 'n/a' without crashing", async () => {
    await renderTable({ models: { x: { _overall: { n: 0, accuracy: null } } }, by_tradition: {} });
    // The model still appears, ranked last, and its null-overall cell formats as "n/a".
    expect(screen.getByText("x")).toBeInTheDocument();
    expect(screen.getAllByText("n/a").length).toBeGreaterThan(0);
  });

  it("renders a fully-missing model (real _overall shape: n=0, accuracy=null, missing=N) as 'n/a'", async () => {
    // score.py emits a model that answered nothing as {n:0, accuracy:null, expected_n, missing}
    // on BOTH the task cell and _overall. The overall must read "n/a" (annotated), never a
    // bare "miss N" that hides the spec-required null-overall display.
    await renderTable({
      models: {
        top: { retrieve_quote: { n: 10, accuracy: 0.5 }, _overall: { n: 10, accuracy: 0.5 } },
        gone: {
          retrieve_quote: { n: 0, accuracy: null, expected_n: 10, missing: 10 },
          _overall: { n: 0, accuracy: null, expected_n: 10, missing: 10 },
        },
      },
      by_tradition: {},
    });
    // the fully-missing model ranks last and both its task + overall cells read "n/a (miss 10)"
    const rows = screen.getAllByRole("row");
    const firstCells = rows.map((r) => within(r).queryAllByRole("cell")[0]?.textContent).filter(Boolean);
    expect(firstCells).toEqual(["top", "gone"]);
    expect(screen.getAllByText("n/a (miss 10)").length).toBe(2); // task column + overall column
    // and nothing renders the bare "miss 10" that would hide the n/a display
    expect(screen.queryByText("miss 10")).toBeNull();
  });
});
