import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { CenteredSpinner } from "../components/Loading";
import { ExplorerFilters } from "../components/ExplorerFilters";
import { QuestionList } from "../components/QuestionList";
import {
  explorerTasks,
  explorerTraditions,
  filterQuestions,
  modelQuestions,
  questionStats,
  type ExplorerFilters as Filters,
} from "../lib/explorer";
import { loadFacct, loadRun, type FacctReport, type QuestionResult } from "../lib/localResults";
import { READING_LABELS, readingMix } from "../lib/readings";

// The error explorer: drill into one model of one run and inspect every roster question
// (answered or missing) with composing filters and, for each failure, the prompt, expected
// text, actual answer, and per-metric scores side by side.
//
// Route: `/run/$runId/model/$modelId`. Filter state lives in the URL as
// `?task=&tradition=&correct=&mode=`, validated by a plain validator on the route (zod is
// pruned). The run id resolves to the fetch base `/runs/${encodeURIComponent(id)}` before
// loadRun — the same contract as the leaderboard — and a stale-request guard keeps a slow
// earlier load from overwriting a newer one. "Back to leaderboard" targets `/?run=<runId>`.

type RunState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; results: QuestionResult[]; models: string[]; facct: FacctReport | null };

export function ExplorerPage() {
  const { runId, modelId } = useParams({ from: "/run/$runId/model/$modelId" });
  const search = useSearch({ from: "/run/$runId/model/$modelId" });
  const navigate = useNavigate();
  const [runState, setRunState] = useState<RunState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setRunState({ status: "loading" });
    (async () => {
      const base = `/runs/${encodeURIComponent(runId)}`;
      const [result, facct] = await Promise.all([loadRun(base, fetch), loadFacct(base, fetch)]);
      if (!live) return;
      setRunState(
        result.ok
          ? { status: "ready", results: result.results, models: Object.keys(result.summary.models), facct }
          : { status: "error", message: `${result.kind}: ${result.message}` },
      );
    })();
    return () => {
      live = false;
    };
  }, [runId]);

  const all = useMemo(() => {
    if (runState.status !== "ready") return [];
    const rows = modelQuestions(runState.results, modelId);
    const items = runState.facct?.items.filter((item) => item.model_id === modelId) ?? [];
    if (items.length === 0) return rows;
    const byQuestion = new Map(items.map((item) => [item.question_id, item]));
    return rows.map((row) => {
      const item = byQuestion.get(row.question_id);
      return item ? { ...row, reading: item.label, readingDetail: item.detail || undefined } : row;
    });
  }, [runState, modelId]);
  const kinds = useMemo(() => {
    const present = new Set(all.map((row) => row.reading).filter((label): label is string => Boolean(label)));
    return READING_LABELS.filter((label) => present.has(label));
  }, [all]);
  const kindLabels = useMemo(() => {
    const labels: Record<string, number> = {};
    for (const row of all) if (row.reading) labels[row.reading] = (labels[row.reading] ?? 0) + 1;
    return labels;
  }, [all]);
  const filtered = useMemo(() => filterQuestions(all, search), [all, search]);
  const stats = useMemo(() => questionStats(all), [all]);

  const onFilters = (next: Filters) => {
    navigate({ to: "/run/$runId/model/$modelId", params: { runId, modelId }, search: next });
  };

  const backLink = (
    <Link to="/" search={{ run: runId }} className="text-sm text-default-700 underline">
      ← Back to leaderboard
    </Link>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {backLink}
      <h1 className="mt-2 text-2xl font-semibold">Quotes</h1>
      <p className="mt-1 text-sm text-default-500">
        <span className="font-medium">{modelId}</span> over run <code>{runId}</code>. Each answer
        is labeled exact, verse plus extra, other tradition, other edition, near miss, refusal,
        empty, or made up.
      </p>

      {runState.status === "loading" && <CenteredSpinner label={`Loading run ${runId}…`} />}

      {runState.status === "error" && (
        <div role="alert" className="mt-6 rounded border border-danger-200 p-4">
          <p className="font-semibold text-danger">Could not load run {runId}</p>
          <p className="mt-1 text-sm text-default-500">{runState.message}</p>
        </div>
      )}

      {runState.status === "ready" && !runState.models.includes(modelId) && (
        <div role="alert" className="mt-6 rounded border border-warning-200 p-4">
          <p className="font-semibold text-warning-700">Model not in this run</p>
          <p className="mt-1 text-sm text-default-500">
            <code>{modelId}</code> is not one of this run's models ({runState.models.join(", ") || "none"}).
          </p>
        </div>
      )}

      {runState.status === "ready" && runState.models.includes(modelId) && (
        <>
          <p className="mt-3 text-sm text-default-600">
            {stats.total} question{stats.total === 1 ? "" : "s"} · {stats.correct} correct ·{" "}
            {stats.wrong} wrong · {stats.missing} missing
            {readingMix(kindLabels) ? ` · ${readingMix(kindLabels)}` : ""}
          </p>

          <div className="mt-4">
            <ExplorerFilters
              tasks={explorerTasks(all)}
              traditions={explorerTraditions(all)}
              kinds={kinds}
              value={search}
              onChange={onFilters}
            />
          </div>

          <p className="mt-4 text-xs text-default-400">
            <span className="font-medium">missing</span> = the model produced no answer for a
            roster question (a missing cell); <span className="font-medium">wrong</span> = it
            answered but scored incorrect. Per-metric <code>n/a</code> means the task emits no
            such similarity score.
          </p>

          <p className="mt-2 text-sm text-default-500">
            Showing {filtered.length} of {stats.total}.
          </p>

          <QuestionList results={filtered} />
        </>
      )}
    </div>
  );
}
