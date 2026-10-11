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
    // identify_version emits exact+normalized but no token_f1 → null → "n/a"
    render(<QuestionList results={[q({ task: "identify_version", exact: 1, normalized: 1, token_f1: null })]} />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  it("marks a missing cell distinctly and shows no metric grid", () => {
    render(
      <QuestionList
        results={[q({ question_id: "ccc", missing: true, answer: "", exact: null, normalized: null, token_f1: null })]}
      />,
    );
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText(/no answer produced/i)).toBeInTheDocument();
    // a missing cell has no per-metric grid
    expect(screen.queryByText("token-F1")).toBeNull();
  });

  it("shows an empty-state line when nothing matches", () => {
    render(<QuestionList results={[]} />);
    expect(screen.getByText(/No questions match/i)).toBeInTheDocument();
  });
});
