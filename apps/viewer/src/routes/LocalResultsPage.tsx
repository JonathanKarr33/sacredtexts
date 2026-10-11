import { useEffect, useState } from "react";
import { LocalResults } from "../components/LocalResults";
import {
  joinResults, loadRun, parseJsonl, parseSummary,
  type AnswerRow, type QuestionResult, type ScoreRow, type Summary,
} from "../lib/localResults";
import { sampleAnswersJsonl, sampleScoresJsonl, sampleSummary } from "../local/sample";

// Local-only results view (Spec 1, Phase 7; superseded by the Spec 2 leaderboard).
// With ?run=<base> (e.g. the dev-served /runs/<id>, see vite.config.ts) it fetches that
// run's four artifacts via loadRun and renders them, or shows a localized error if the
// run can't be loaded (missing artifact / HTTP failure / malformed data). Without ?run=
// it renders the committed sample so `pnpm dev` -> /local-results works out of the box.
// No GitHub data layer.

function sampleRun(): { summary: Summary; results: QuestionResult[] } {
  return {
    summary: parseSummary(sampleSummary),
    results: joinResults(
      parseJsonl<ScoreRow>(sampleScoresJsonl),
      parseJsonl<AnswerRow>(sampleAnswersJsonl),
    ),
  };
}

export function LocalResultsPage() {
  const base = new URLSearchParams(window.location.search).get("run");
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string }
    | { status: "ready"; data: { summary: Summary; results: QuestionResult[] }; source: string }
  >(base ? { status: "loading" } : { status: "ready", data: sampleRun(), source: "committed sample" });

  useEffect(() => {
    if (!base) return;
    let live = true;
    loadRun(base)
      .then((res) => {
        if (!live) return;
        setState(res.ok
          ? { status: "ready", data: { summary: res.summary, results: res.results }, source: base }
          : { status: "error", message: `${res.kind}: ${res.message}` });
      })
      .catch((e: unknown) => live && setState({ status: "error", message: (e as Error).message }));
    return () => { live = false; };
  }, [base]);

  if (state.status === "loading") {
    return <p className="mx-auto max-w-5xl px-4 py-8 text-default-500">Loading {base}…</p>;
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="mx-auto max-w-5xl px-4 py-8">
        <p className="font-semibold text-danger">Could not load {base}</p>
        <p className="mt-1 text-sm text-default-500">{state.message}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mx-auto max-w-5xl px-4 pt-4 text-xs text-default-400">source: {state.source}</p>
      <LocalResults summary={state.data.summary} results={state.data.results} />
    </div>
  );
}
