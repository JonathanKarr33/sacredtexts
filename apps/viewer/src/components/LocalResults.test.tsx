import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocalResults } from "./LocalResults";
import {
  joinResults,
  loadRun,
  parseJsonl,
  parseSummary,
  formatCell,
  type AnswerRow,
  type QuestionRow,
  type ScoreRow,
} from "../lib/localResults";
import {
  sampleAnswersJsonl,
  sampleScoresJsonl,
  sampleSummary,
  sampleQuestionsJsonl,
  sampleQuestionsWithMissingJsonl,
} from "../local/sample";

function fakeFetcher(files: Record<string, string>): typeof fetch {
  return (async (url: string) => {
    const body = files[url];
    if (body === undefined) return { ok: false, status: 404 } as Response;
    return {
      ok: true, status: 200,
      json: async () => JSON.parse(body),
      text: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

describe("localResults lib", () => {
  it("joins scores with answers on (question_id, model_id), carrying per-metric scores", () => {
    const scores = parseJsonl<ScoreRow>(sampleScoresJsonl);
    const answers = parseJsonl<AnswerRow>(sampleAnswersJsonl);
    const rows = joinResults(scores, answers);
    expect(rows).toHaveLength(4);
    const haikuCorrect = rows.find((r) => r.model_id === "haiku" && r.question_id === "retrieve_quote-aaa");
    expect(haikuCorrect?.correct).toBe(true);
    expect(haikuCorrect?.missing).toBe(false);
    expect(haikuCorrect?.prompt).toContain("Orchards 1:1");
    expect(haikuCorrect?.expected).toContain("twelve trees");
    expect(haikuCorrect?.exact).toBe(1);
    expect(haikuCorrect?.token_f1).toBe(1);
  });

  it("surfaces un-answered roster questions as missing cells (panel × roster)", () => {
    const scores = parseJsonl<ScoreRow>(sampleScoresJsonl);
    const answers = parseJsonl<AnswerRow>(sampleAnswersJsonl);
    const roster = parseJsonl<QuestionRow>(sampleQuestionsWithMissingJsonl);
    const rows = joinResults(scores, answers, { roster, models: ["haiku", "gemma-4"] });
    expect(rows).toHaveLength(6); // 2 models × 3 roster questions
    const missing = rows.filter((r) => r.missing);
    expect(missing).toHaveLength(2); // the extra "ccc" question, for both models
    expect(missing.every((r) => r.question_id === "retrieve_quote-ccc")).toBe(true);
    expect(missing.every((r) => r.answer === "" && r.exact === null)).toBe(true);
    expect(rows.filter((r) => !r.missing)).toHaveLength(4);
  });

  it("formats cells (accuracy/n, n/a, missing)", () => {
    expect(formatCell({ n: 2, accuracy: 0.5 })).toBe("50% (n=2)");
    expect(formatCell({ n: 0, accuracy: null, missing: 3 })).toBe("miss 3");
    expect(formatCell(undefined)).toBe("—");
  });

  it("loadRun fetches + parses all four artifacts from a base path", async () => {
    const base = "/runs/demo";
    const run = await loadRun(base, fakeFetcher({
      [`${base}/summary.json`]: JSON.stringify(sampleSummary),
      [`${base}/scores.jsonl`]: sampleScoresJsonl,
      [`${base}/answers.jsonl`]: sampleAnswersJsonl,
      [`${base}/questions.jsonl`]: sampleQuestionsJsonl,
    }));
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.results).toHaveLength(4); // 2 models × 2 roster questions, all answered
    expect(Object.keys(run.summary.models)).toContain("haiku");
  });

  it("loadRun reports a missing artifact (404) rather than returning data", async () => {
    const base = "/runs/missing";
    const run = await loadRun(base, fakeFetcher({ [`${base}/summary.json`]: "{}" })); // others 404
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.kind).toBe("missing");
  });

  it("loadRun treats a 200 HTML body (SPA fallback) as a missing artifact, not data", async () => {
    const base = "/runs/htmlish";
    const run = await loadRun(base, fakeFetcher({
      [`${base}/summary.json`]: '<!doctype html><html><body><div id="root"></div></body></html>',
      [`${base}/scores.jsonl`]: sampleScoresJsonl,
      [`${base}/answers.jsonl`]: sampleAnswersJsonl,
      [`${base}/questions.jsonl`]: sampleQuestionsJsonl,
    }));
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.kind).toBe("missing");
  });

  it("loadRun reports malformed summary JSON as 'malformed', localized to the file", async () => {
    const base = "/runs/bad";
    const run = await loadRun(base, fakeFetcher({
      [`${base}/summary.json`]: "{ not json",
      [`${base}/scores.jsonl`]: sampleScoresJsonl,
      [`${base}/answers.jsonl`]: sampleAnswersJsonl,
      [`${base}/questions.jsonl`]: sampleQuestionsJsonl,
    }));
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.kind).toBe("malformed");
    expect(run.message).toContain("summary.json");
  });

  it("loadRun reports a malformed JSONL line with file + line context", async () => {
    const base = "/runs/badjsonl";
    const run = await loadRun(base, fakeFetcher({
      [`${base}/summary.json`]: JSON.stringify(sampleSummary),
      [`${base}/scores.jsonl`]: '{"question_id":"q","model_id":"m","task":"t","metrics":{"correct":1}}\nnot-json',
      [`${base}/answers.jsonl`]: sampleAnswersJsonl,
      [`${base}/questions.jsonl`]: sampleQuestionsJsonl,
    }));
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.kind).toBe("malformed");
    expect(run.message).toContain("scores.jsonl:2");
  });

  it("loadRun reports a non-404 HTTP failure as 'http'", async () => {
    const base = "/runs/boom";
    const fetcher = (async (url: string) => {
      if (url.endsWith("summary.json")) return { ok: false, status: 500 } as Response;
      const body = url.endsWith("questions.jsonl")
        ? sampleQuestionsJsonl
        : url.endsWith("scores.jsonl")
          ? sampleScoresJsonl
          : sampleAnswersJsonl;
      return { ok: true, status: 200, text: async () => body } as Response;
    }) as unknown as typeof fetch;
    const run = await loadRun(base, fetcher);
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.kind).toBe("http");
  });

  it("joinResults leaves per-metric scores null for a task that emits none", () => {
    const scores = parseJsonl<ScoreRow>(
      '{"question_id":"q1","model_id":"m","task":"verify_source","metrics":{"correct":1}}',
    );
    const answers = parseJsonl<AnswerRow>(
      JSON.stringify({
        question_id: "q1", model_id: "m", task: "verify_source", answer: "yes",
        question: { prompt: "p", expected: { answer: "yes" }, source: { tradition: ["X"] } },
      }),
    );
    const rows = joinResults(scores, answers);
    expect(rows[0]?.correct).toBe(true);
    expect(rows[0]?.exact).toBeNull();
    expect(rows[0]?.normalized).toBeNull();
    expect(rows[0]?.token_f1).toBeNull();
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
