import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CenteredSpinner } from "../components/Loading";
import { LeaderboardTable } from "../components/LeaderboardTable";
import { RunSelector, type RunRef } from "../components/RunSelector";
import { loadRun, type Summary } from "../lib/localResults";

// The `/` home: the benchmark leaderboard over a selectable run.
//
// Run selection lives in the URL as a bare run id (`/?run=<id>`), validated by the plain
// validateSearch fn on the index route (zod is pruned). The id is resolved to the fetch
// base `/runs/${encodeURIComponent(id)}` before loadRun. A `?run=` that is not a known run
// id (e.g. an old Spec-1 `?run=/runs/<id>` base-path value) falls back to the default —
// the most-recent run — rather than erroring. The selector reads and writes `?run=`, so a
// selection is shareable and refresh-safe.
//
// Two independent concerns: (1) the run index — which runs exist — fetched once; its
// failure modes are distinguished (empty vs index-fetch-failed vs the prod static host
// that has no /runs endpoint and answers with HTML, treated as empty). (2) the selected
// run's load, re-run whenever the selection changes, guarded by a `live` flag so a slow
// earlier load cannot overwrite a newer selection (rapid run switching).

type IndexState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "failed"; message: string }
  | { status: "ready"; runs: RunRef[] };

/** Fetch the run index, distinguishing empty (no runs) from a genuine fetch/parse failure.
 * A 200 HTML body (a production static host with no /runs endpoint serving the SPA shell)
 * is treated as "no runs" — the empty state, never a crash. */
async function fetchRunIndex(
  fetcher: typeof fetch,
): Promise<{ ok: true; runs: RunRef[] } | { ok: false; message: string }> {
  let res: Response;
  try {
    res = await fetcher("/runs/_index");
  } catch (e) {
    return { ok: false, message: `/runs/_index: ${(e as Error).message}` };
  }
  if (!res.ok) return { ok: false, message: `/runs/_index: HTTP ${res.status}` };
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    return { ok: false, message: `/runs/_index: ${(e as Error).message}` };
  }
  // Prod static host: /runs/_index falls through to index.html (200 HTML) → no runs.
  if (text.trimStart().startsWith("<")) return { ok: true, runs: [] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "/runs/_index: run index is not valid JSON" };
  }
  if (!Array.isArray(data)) return { ok: false, message: "/runs/_index: run index is not a list" };
  return {
    ok: true,
    runs: data.filter((e): e is RunRef => !!e && typeof (e as RunRef).id === "string"),
  };
}

type RunState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: Summary };

export function LeaderboardPage() {
  const { run } = useSearch({ from: "/" });
  const navigate = useNavigate();
  const [index, setIndex] = useState<IndexState>({ status: "loading" });
  const [runState, setRunState] = useState<RunState>({ status: "loading" });

  // (1) Enumerate the runs once.
  useEffect(() => {
    let live = true;
    (async () => {
      const result = await fetchRunIndex(fetch);
      if (!live) return;
      if (!result.ok) setIndex({ status: "failed", message: result.message });
      else if (result.runs.length === 0) setIndex({ status: "empty" });
      else setIndex({ status: "ready", runs: result.runs });
    })();
    return () => {
      live = false;
    };
  }, []);

  const runs = index.status === "ready" ? index.runs : [];
  // The selected run id: the `?run=` value when it names a known run, else the default
  // (most recent — the index is newest-first, so runs[0]).
  const selectedId = useMemo(() => {
    if (runs.length === 0) return undefined;
    if (run && runs.some((r) => r.id === run)) return run;
    return runs[0]!.id;
  }, [run, runs]);

  // (2) Load the selected run; re-run on selection change with a stale-request guard.
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    setRunState({ status: "loading" });
    (async () => {
      const result = await loadRun(`/runs/${encodeURIComponent(selectedId)}`, fetch);
      if (!live) return;
      setRunState(
        result.ok
          ? { status: "ready", summary: result.summary }
          : { status: "error", message: `${result.kind}: ${result.message}` },
      );
    })();
    return () => {
      live = false;
    };
  }, [selectedId]);

  if (index.status === "loading") {
    return <CenteredSpinner label="Discovering runs…" />;
  }
  if (index.status === "failed") {
    return (
      <div role="alert" className="mx-auto max-w-2xl py-16 text-center">
        <p className="font-semibold text-danger">Could not load the run index</p>
        <p className="mt-1 text-sm text-default-500">{index.message}</p>
      </div>
    );
  }
  if (index.status === "empty") {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-xl font-semibold">No runs yet</h1>
        <p className="mt-2 text-default-500">
          No benchmark run was found under <code>runs/</code>. Produce one with the
          pipeline (<code>uv --project pipelines run python -m sacredbench …</code>), then
          reload — the dev server serves each <code>runs/&lt;id&gt;/</code> automatically.
        </p>
      </div>
    );
  }

  const onSelect = (id: string) => {
    navigate({ to: "/", search: { run: id } });
  };

  return (
    <div>
      <RunSelector
        runs={runs}
        selectedId={selectedId}
        onSelect={onSelect}
        error={
          runState.status === "error"
            ? `Could not load run ${selectedId}: ${runState.message}`
            : null
        }
      />
      {runState.status === "loading" && <CenteredSpinner label={`Loading run ${selectedId}…`} />}
      {runState.status === "ready" && <LeaderboardTable summary={runState.summary} runId={selectedId!} />}
    </div>
  );
}
