import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocalResults } from "./LocalResults";
import {
  joinResults,
  parseJsonl,
  parseSummary,
  formatCell,
  type AnswerRow,
  type ScoreRow,
} from "../lib/localResults";
import { sampleAnswersJsonl, sampleScoresJsonl, sampleSummary } from "../local/sample";

describe("localResults lib", () => {
  it("joins scores with answers on (question_id, model_id)", () => {
    const scores = parseJsonl<ScoreRow>(sampleScoresJsonl);
    const answers = parseJsonl<AnswerRow>(sampleAnswersJsonl);
    const rows = joinResults(scores, answers);
    expect(rows).toHaveLength(4);
    const haikuCorrect = rows.find((r) => r.model_id === "haiku" && r.question_id === "retrieve_quote-aaa");
    expect(haikuCorrect?.correct).toBe(true);
    expect(haikuCorrect?.prompt).toContain("Orchards 1:1");
    expect(haikuCorrect?.expected).toContain("twelve trees");
  });

  it("formats cells (accuracy/n, n/a, missing)", () => {
    expect(formatCell({ n: 2, accuracy: 0.5 })).toBe("50% (n=2)");
    expect(formatCell({ n: 0, accuracy: null, missing: 3 })).toBe("miss 3");
    expect(formatCell(undefined)).toBe("—");
  });
});

describe("LocalResults", () => {
  it("renders the summary table and per-question scores from a fixture run", () => {
    const summary = parseSummary(sampleSummary);
    const scores = parseJsonl<ScoreRow>(sampleScoresJsonl);
    const answers = parseJsonl<AnswerRow>(sampleAnswersJsonl);
    render(<LocalResults summary={summary} results={joinResults(scores, answers)} />);

    // both models and the task appear (in the table and/or the per-question rows)
    expect(screen.getAllByText("haiku").length).toBeGreaterThan(0);
    expect(screen.getAllByText("gemma-4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("retrieve_quote").length).toBeGreaterThan(0);

    // per-question list shows all four cells and the correct/incorrect marks
    expect(screen.getByText(/Per-question scores \(4\)/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("correct")).toHaveLength(1); // only haiku/aaa is correct
    expect(screen.getAllByLabelText("incorrect")).toHaveLength(3);
  });
});
