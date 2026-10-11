import { describe, it, expect } from "vitest";
import {
  explorerTasks,
  explorerTraditions,
  failureMode,
  filterQuestions,
  formatMetric,
  modelQuestions,
  questionStats,
} from "./explorer";
import {
  joinResults,
  parseJsonl,
  type AnswerRow,
  type QuestionResult,
  type QuestionRow,
  type ScoreRow,
} from "./localResults";
import {
  sampleAnswersJsonl,
  sampleScoresJsonl,
  sampleQuestionsWithMissingJsonl,
} from "../local/sample";

// A tiny hand-built result set spanning all three states and two tasks/traditions.
function q(partial: Partial<QuestionResult>): QuestionResult {
  return {
    question_id: "q",
    model_id: "m",
    task: "retrieve_quote",
    correct: false,
    missing: false,
    prompt: "p",
    answer: "a",
    expected: "e",
    tradition: ["Judaism"],
    exact: 0,
    normalized: 0,
    token_f1: 0,
    ...partial,
  };
}

describe("explorer — classification", () => {
  it("classifies correct (no failure), wrong, and missing", () => {
    expect(failureMode(q({ correct: true }))).toBeNull();
    expect(failureMode(q({ correct: false, missing: false }))).toBe("wrong");
    expect(failureMode(q({ correct: false, missing: true }))).toBe("missing");
  });
});

describe("explorer — filters compose", () => {
  const results: QuestionResult[] = [
    q({ question_id: "a", correct: true, task: "retrieve_quote", tradition: ["Judaism"] }),
    q({ question_id: "b", correct: false, missing: false, task: "retrieve_quote", tradition: ["Judaism"] }),
    q({ question_id: "c", correct: false, missing: true, task: "identify_version", tradition: ["Roman Catholic"] }),
    q({ question_id: "d", correct: false, missing: false, task: "identify_version", tradition: ["Judaism", "Roman Catholic"] }),
  ];

  it("filters by task", () => {
    expect(filterQuestions(results, { task: "identify_version" }).map((r) => r.question_id)).toEqual(["c", "d"]);
  });

  it("filters by tradition (membership, multi-tradition aware)", () => {
    expect(filterQuestions(results, { tradition: "Roman Catholic" }).map((r) => r.question_id)).toEqual(["c", "d"]);
  });

  it("filters by correct / incorrect", () => {
    expect(filterQuestions(results, { correct: "correct" }).map((r) => r.question_id)).toEqual(["a"]);
    expect(filterQuestions(results, { correct: "incorrect" }).map((r) => r.question_id)).toEqual(["b", "c", "d"]);
  });

  it("filters failures by mode — missing distinct from wrong", () => {
    expect(filterQuestions(results, { mode: "missing" }).map((r) => r.question_id)).toEqual(["c"]);
    expect(filterQuestions(results, { mode: "wrong" }).map((r) => r.question_id)).toEqual(["b", "d"]);
  });

  it("composes multiple active filters by AND", () => {
    expect(
      filterQuestions(results, { task: "identify_version", tradition: "Judaism", mode: "wrong" }).map((r) => r.question_id),
    ).toEqual(["d"]);
    // a contradictory composition honestly yields nothing (correct + missing)
    expect(filterQuestions(results, { correct: "correct", mode: "missing" })).toHaveLength(0);
  });

  it("derives sorted distinct task and tradition options", () => {
    expect(explorerTasks(results)).toEqual(["identify_version", "retrieve_quote"]);
    expect(explorerTraditions(results)).toEqual(["Judaism", "Roman Catholic"]);
  });

  it("counts total / correct / wrong / missing", () => {
    expect(questionStats(results)).toEqual({ total: 4, correct: 1, wrong: 2, missing: 1 });
  });
});

describe("explorer — formatMetric", () => {
  it("renders a number as-is and null (task emits no metric) as 'n/a'", () => {
    expect(formatMetric(0)).toBe("0");
    expect(formatMetric(0.2865)).toBe("0.2865");
    expect(formatMetric(null)).toBe("n/a");
  });
});

describe("explorer — over the missing-cell fixture", () => {
  // The Phase-1 `missing > 0` roster (aaa, bbb answered; ccc answered by no model).
  const results = joinResults(
    parseJsonl<ScoreRow>(sampleScoresJsonl),
    parseJsonl<AnswerRow>(sampleAnswersJsonl),
    { roster: parseJsonl<QuestionRow>(sampleQuestionsWithMissingJsonl), models: ["haiku", "gemma-4"] },
  );

  it("modelQuestions lists every roster question for the model, missing marked", () => {
    const haiku = modelQuestions(results, "haiku");
    expect(haiku.map((r) => r.question_id)).toEqual([
      "retrieve_quote-aaa",
      "retrieve_quote-bbb",
      "retrieve_quote-ccc",
    ]);
    const ccc = haiku.find((r) => r.question_id === "retrieve_quote-ccc")!;
    expect(ccc.missing).toBe(true);
    expect(ccc.answer).toBe("");
    expect(ccc.exact).toBeNull();
  });

  it("the missing-cell filter shows only the un-answered question, distinct from wrong answers", () => {
    const haiku = modelQuestions(results, "haiku");
    const missing = filterQuestions(haiku, { mode: "missing" });
    const wrong = filterQuestions(haiku, { mode: "wrong" });
    expect(missing.map((r) => r.question_id)).toEqual(["retrieve_quote-ccc"]);
    expect(wrong.map((r) => r.question_id)).toEqual(["retrieve_quote-bbb"]); // haiku bbb scored incorrect
    expect(missing[0]!.missing).toBe(true);
    expect(wrong[0]!.missing).toBe(false);
  });
});
