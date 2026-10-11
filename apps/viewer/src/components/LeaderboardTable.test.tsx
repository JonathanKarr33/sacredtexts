import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LeaderboardTable } from "./LeaderboardTable";
import type { Summary } from "../lib/localResults";

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
  it("ranks models (best first, id tiebreak) with task/overall/token columns", () => {
    render(<LeaderboardTable summary={summary} />);
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

  it("renders the by-tradition breakdown including the LDS cell", () => {
    render(<LeaderboardTable summary={summary} />);
    expect(screen.getByText("By tradition")).toBeInTheDocument();
    expect(
      screen.getByText("The Church of Jesus Christ of Latter-Day Saints"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("72% (n=5)").length).toBeGreaterThan(0);
  });

  it("omits the by-tradition section when the run has no by_tradition data", () => {
    render(<LeaderboardTable summary={{ models: summary.models, by_tradition: {} }} />);
    expect(screen.queryByText("By tradition")).toBeNull();
  });

  it("renders a null-overall model as 'n/a' without crashing", () => {
    render(
      <LeaderboardTable
        summary={{ models: { x: { _overall: { n: 0, accuracy: null } } }, by_tradition: {} }}
      />,
    );
    // The model still appears, ranked last, and its null-overall cell formats as "n/a".
    expect(screen.getByText("x")).toBeInTheDocument();
    expect(screen.getAllByText("n/a").length).toBeGreaterThan(0);
  });

  it("renders a fully-missing model (real _overall shape: n=0, accuracy=null, missing=N) as 'n/a'", () => {
    // score.py emits a model that answered nothing as {n:0, accuracy:null, expected_n, missing}
    // on BOTH the task cell and _overall. The overall must read "n/a" (annotated), never a
    // bare "miss N" that hides the spec-required null-overall display.
    render(
      <LeaderboardTable
        summary={{
          models: {
            top: { retrieve_quote: { n: 10, accuracy: 0.5 }, _overall: { n: 10, accuracy: 0.5 } },
            gone: {
              retrieve_quote: { n: 0, accuracy: null, expected_n: 10, missing: 10 },
              _overall: { n: 0, accuracy: null, expected_n: 10, missing: 10 },
            },
          },
          by_tradition: {},
        }}
      />,
    );
    // the fully-missing model ranks last and both its task + overall cells read "n/a (miss 10)"
    const rows = screen.getAllByRole("row");
    const firstCells = rows.map((r) => within(r).queryAllByRole("cell")[0]?.textContent).filter(Boolean);
    expect(firstCells).toEqual(["top", "gone"]);
    expect(screen.getAllByText("n/a (miss 10)").length).toBe(2); // task column + overall column
    // and nothing renders the bare "miss 10" that would hide the n/a display
    expect(screen.queryByText("miss 10")).toBeNull();
  });
});
