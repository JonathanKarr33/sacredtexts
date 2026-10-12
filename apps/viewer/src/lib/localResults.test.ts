import { describe, it, expect } from "vitest";
import {
  joinResults,
  loadFacct,
  loadRun,
  loadSummary,
  parseJsonl,
  parseSummary,
  formatCell,
  type AnswerRow,
  type QuestionRow,
  type ScoreRow,
} from "./localResults";
import { leaderboardRows } from "./leaderboard";
import {
  sampleAnswersJsonl,
  sampleScoresJsonl,
  sampleSummary,
  sampleQuestionsJsonl,
  sampleQuestionsWithMissingJsonl,
} from "../local/sample";

// Loader/join unit tests for the localResults seam (relocated here from the deleted
// components/LocalResults.test.tsx when the flat LocalResults view was retired in favour of
// the leaderboard). These exercise lib/localResults.ts directly — the foundation the
// leaderboard, run selector, and error explorer all build on.

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
    expect(formatCell({ n: 2, accuracy: 0.5, missing: 1 })).toBe("50% (n=2) −1");
    // A null-accuracy cell formats as "n/a" (spec edge case), not a dash. Real `_overall`
    // cells for a fully-missing model always carry a `missing` count, which we annotate —
    // still "n/a", never the bare "miss N" that would hide the required n/a display.
    expect(formatCell({ n: 0, accuracy: null })).toBe("n/a");
    expect(formatCell({ n: 0, accuracy: null, expected_n: 100, missing: 100 })).toBe("n/a (miss 100)");
    expect(formatCell({ n: 0, accuracy: null, missing: 3 })).toBe("n/a (miss 3)");
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

describe("loadSummary (standings reads only summary.json)", () => {
  it("parses a single summary.json without needing the other three artifacts", async () => {
    const base = "/runs/x";
    const res = await loadSummary(base, fakeFetcher({ [`${base}/summary.json`]: JSON.stringify(sampleSummary) }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.summary.models).sort()).toEqual(["gemma-4", "haiku"]);
  });

  it("reports a missing summary.json as 'missing'", async () => {
    const res = await loadSummary("/runs/gone", fakeFetcher({})); // 404
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.kind).toBe("missing");
  });

  it("treats a 200 HTML body (prod static host) as a missing artifact, not a crash", async () => {
    const base = "/runs/prod";
    const res = await loadSummary(base, fakeFetcher({ [`${base}/summary.json`]: "<!doctype html><html></html>" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.kind).toBe("missing");
  });

  it("reports malformed summary JSON as 'malformed', localized to the file", async () => {
    const base = "/runs/bad";
    const res = await loadSummary(base, fakeFetcher({ [`${base}/summary.json`]: "{ not json" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.kind).toBe("malformed");
    expect(res.message).toContain(`${base}/summary.json`);
  });

  // parseSummary must reject a structurally-malformed-but-valid-JSON summary with the typed
  // "malformed" result, rather than letting a TypeError surface in the render path
  // (rankedModels/summaryTasks/leaderboardRows all dereference the nested shape).
  it("reports a non-object model entry ({\"models\":{\"m\":null}}) as 'malformed', not a render crash", async () => {
    const base = "/runs/nullmodel";
    const res = await loadSummary(base, fakeFetcher({ [`${base}/summary.json`]: '{"models":{"m":null}}' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.kind).toBe("malformed");
    expect(res.message).toContain("models['m']");
  });

  it("reports a non-object 'models' as 'malformed'", async () => {
    const base = "/runs/badmodels";
    const res = await loadSummary(base, fakeFetcher({ [`${base}/summary.json`]: '{"models":"nope"}' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.kind).toBe("malformed");
  });

  it("reports a 'usage' without a per_model object as 'malformed'", async () => {
    const base = "/runs/badusage";
    const res = await loadSummary(
      base,
      fakeFetcher({ [`${base}/summary.json`]: '{"models":{"m":{}},"usage":{"total":{"calls":1,"in":2,"out":3}}}' }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.kind).toBe("malformed");
  });
});

describe("loadFacct", () => {
  it("returns null when the card is absent, so a run without one still loads", async () => {
    const report = await loadFacct("/runs/plain", fakeFetcher({}));
    expect(report).toBeNull();
  });

  it("returns null for a card whose shape this view does not understand", async () => {
    const report = await loadFacct(
      "/runs/odd",
      fakeFetcher({ "/runs/odd/facct.json": '{"note":"x"}' }),
    );
    expect(report).toBeNull();
  });
});

describe("parseSummary nested-shape validation (render-path safety)", () => {
  it("throws on {\"models\":{\"m\":null}} before the render path can TypeError", () => {
    expect(() => parseSummary({ models: { m: null } })).toThrow(/models\['m'\]/);
  });

  it("rejects a non-object by_tradition entry", () => {
    expect(() => parseSummary({ models: { m: {} }, by_tradition: { m: null } })).toThrow(/by_tradition\['m'\]/);
  });

  it("a validated summary never throws in leaderboardRows even with sparse usage", () => {
    // usage present with a per_model that omits a ranked model → leaderboardRows must read
    // null tokens, not throw (the per_model?.[modelId] guard + the parseSummary contract).
    const summary = parseSummary({
      models: { a: { _overall: { n: 1, accuracy: 0.5 } } },
      usage: { per_model: {}, total: { calls: 0, in: 0, out: 0 } },
    });
    const { rows } = leaderboardRows(summary);
    expect(rows[0]?.tokens).toBeNull();
  });
});
