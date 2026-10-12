import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CenteredSpinner } from "../components/Loading";
import { formatCell, loadSummary } from "../lib/localResults";
import { fetchRunIndex } from "../lib/runIndex";
import { aggregate, type RunSummary } from "../lib/aggregate";
import { recencyDate } from "../lib/recency";

// The `/standings` view: cross-run "current standings" (Spec 2 requirement 6). For each
// model it shows its MOST RECENT result across every run under `runs/` — one row per model,
// keyed on the panel `(provider, model, tools)` identity, taken from the latest run that
// benchmarked it, with the source run's id/date and a link into that run's leaderboard
// (`/?run=<id>`). Unlike the leaderboard (one selected run), this loads EVERY run's
// `summary.json` and rolls them up via the pure `aggregate` helper.

type LoadState =
  | { status: "loading" }
  | { status: "empty" } // no runs under runs/ (or a prod static host with no /runs endpoint)
  | { status: "failed"; message: string } // the run index itself could not be fetched
  | { status: "ready"; runs: RunSummary[]; failed: string[] };

/** Fetch the run index, then load every run's summary.json in parallel. A run whose summary
 * is missing/malformed is skipped so one bad run can't take the page down — but the skipped
 * ids are returned in `failed` and surfaced in the UI, because a silently dropped newer run
 * could otherwise present an older result as the "current" standing. */
async function loadAllRunSummaries(fetcher: typeof fetch): Promise<LoadState> {
  const index = await fetchRunIndex(fetcher);
  if (!index.ok) return { status: "failed", message: index.message };
  if (index.runs.length === 0) return { status: "empty" };
  const loaded: RunSummary[] = [];
  const failed: string[] = [];
  await Promise.all(
    index.runs.map(async (r) => {
      const result = await loadSummary(`/runs/${encodeURIComponent(r.id)}`, fetcher);
      if (result.ok) loaded.push({ runId: r.id, mtimeMs: r.mtimeMs ?? 0, summary: result.summary });
      else failed.push(r.id);
    }),
  );
  if (loaded.length === 0) {
    return { status: "failed", message: "No run summaries could be loaded from the run index." };
  }
  failed.sort(); // stable display order (parallel loads finish in any order)
  return { status: "ready", runs: loaded, failed };
}

export function StandingsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    (async () => {
      const next = await loadAllRunSummaries(fetch);
      if (live) setState(next);
    })();
    return () => {
      live = false;
    };
  }, []);

  const rollup = useMemo(
    () => (state.status === "ready" ? aggregate(state.runs) : null),
    [state],
  );

  if (state.status === "loading") return <CenteredSpinner label="Loading standings…" />;
  if (state.status === "failed") {
    return (
      <div role="alert" className="mx-auto max-w-2xl py-16 text-center">
        <p className="font-semibold text-danger">Could not load standings</p>
        <p className="mt-1 text-sm text-default-500">{state.message}</p>
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-xl font-semibold">No runs yet</h1>
        <p className="mt-2 text-default-500">
          No benchmark run was found under <code>runs/</code>, so there are no standings to
          roll up. Produce a run with the pipeline, then reload.
        </p>
      </div>
    );
  }

  const { tasks, rows } = rollup!;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Current standings</h1>
      <p className="mt-1 text-sm text-default-500">
        Each model's most recent result across all {state.runs.length} run
        {state.runs.length === 1 ? "" : "s"} under <code>runs/</code>, keyed on the panel's
        provider, model, and tools setting. When a model was benchmarked in several runs,
        the newest wins.
      </p>
      {state.failed.length > 0 && (
        <p role="status" className="mt-2 text-sm text-warning">
          {state.failed.length} run{state.failed.length === 1 ? "" : "s"} could not be read and{" "}
          {state.failed.length === 1 ? "is" : "are"} omitted — standings may be out of date:{" "}
          {state.failed.join(", ")}.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-4">model</th>
              {tasks.map((t) => (
                <th key={t} className="py-1 pr-4">{t}</th>
              ))}
              <th className="py-1 pr-4">overall</th>
              <th className="py-1 pr-4">from run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b">
                <td className="py-1 pr-4">
                  <div className="font-medium">
                    <Link to="/" search={{ run: row.runId }} className="text-default-700 underline">
                      {row.modelId}
                    </Link>
                  </div>
                  {row.provider && row.model && (
                    <div className="text-xs text-default-400">
                      {row.provider} / {row.model}
                      {row.tools.length > 0 && ` · ${row.tools.join(", ")}`}
                    </div>
                  )}
                </td>
                {tasks.map((t) => (
                  <td key={t} className="py-1 pr-4">{formatCell(row.byTask[t])}</td>
                ))}
                <td className="py-1 pr-4 font-semibold">{formatCell(row.overall)}</td>
                <td className="py-1 pr-4 text-default-500">
                  <Link to="/" search={{ run: row.runId }} className="underline decoration-dotted">
                    {row.runId}
                  </Link>
                  <div className="text-xs text-default-400">
                    {row.recencyMs ? `dated ${recencyDate(row.recencyMs)}` : "date unknown"}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
