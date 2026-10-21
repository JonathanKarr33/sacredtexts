import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionList } from "./QuestionList";
import type { QuestionResult } from "../lib/localResults";

function q(partial: Partial<QuestionResult>): QuestionResult {
  return {
    question_id: "q",
    model_id: "m",
    task: "retrieve_quote",
    correct: false,
    missing: false,
    refused: false,
    prompt: "the prompt",
    answer: "the answer",
    expected: "the expected",
    tradition: ["Judaism"],
    exact: 0,
    normalized: 1,
    token_f1: 0.5,
    ...partial,
  };
}

describe("QuestionList", () => {
  it("shows prompt, expected, actual answer, and the three metrics for an answered question", () => {
    render(<QuestionList results={[q({ question_id: "a", correct: false })]} />);
    expect(screen.getByText("the prompt")).toBeInTheDocument();
    expect(screen.getByText("the expected")).toBeInTheDocument();
    expect(screen.getByText("the answer")).toBeInTheDocument();
    expect(screen.getByText("exact")).toBeInTheDocument();
    expect(screen.getByText("normalized")).toBeInTheDocument();
    expect(screen.getByText("token-F1")).toBeInTheDocument();
  });

  it("renders a metric the task does not emit (null) as 'n/a'", () => {
    // a metric a task does not emit arrives as null and must render "n/a" (here token_f1 is null)
    render(<QuestionList results={[q({ task: "cite_passage", exact: 1, normalized: 1, token_f1: null })]} />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  it("marks a missing cell distinctly and shows an all-'n/a' metric grid (spec AC6)", () => {
    render(
      <QuestionList
        results={[q({ question_id: "ccc", missing: true, answer: "", exact: null, normalized: null, token_f1: null })]}
      />,
    );
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText(/no answer produced/i)).toBeInTheDocument();
    // AC6: every failing row shows the per-metric grid; a missing cell has no scored answer,
    // so all three metrics read "n/a" (the badge + marker above convey its missing nature).
    expect(screen.getByText("exact")).toBeInTheDocument();
    expect(screen.getByText("normalized")).toBeInTheDocument();
    expect(screen.getByText("token-F1")).toBeInTheDocument();
    expect(screen.getAllByText("n/a")).toHaveLength(3);
  });

  it("marks a refused cell as 'refused', not 'wrong' (Spec 15 — distinct from an incorrect answer)", () => {
    render(
      <QuestionList
        results={[q({ question_id: "r", correct: false, refused: true, answer: "I can't reproduce that." })]}
      />,
    );
    expect(screen.getByText("refused")).toBeInTheDocument();
    expect(screen.queryByText("wrong")).not.toBeInTheDocument();
    // the decline text is still shown as the model's answer
    expect(screen.getByText("I can't reproduce that.")).toBeInTheDocument();
  });

  it("shows an empty-state line when nothing matches", () => {
    render(<QuestionList results={[]} />);
    expect(screen.getByText(/No questions match/i)).toBeInTheDocument();
  });
});
