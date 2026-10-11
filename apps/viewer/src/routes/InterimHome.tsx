import { useEffect, useState } from "react";
import { LocalResults } from "../components/LocalResults";
import { CenteredSpinner } from "../components/Loading";
import { loadRun, type QuestionResult, type Summary } from "../lib/localResults";

// Interim `/` home for Spec 2 (superseded by the leaderboard in a later phase). It reads the
// dev server's run index (GET /runs/_index — served by the dev-only Vite middleware under
// vite/), defaults to the most-recent run, and renders it through the retained LocalResults
// view. The run index is authoritative for "most recent": the middleware returns entries
// newest-first (mtime desc, id asc tiebreak), so the first entry is the default.
//
// Robust on a production static host that has no /runs endpoint: such a host answers /runs/_index
// with the SPA's index.html (a 200 HTML body), so fetchRunIndex shape-sniffs a leading "<" (and a
// non-array / parse failure) and treats it as "no runs" — the empty state, never a crash.

interface RunRef {
  id: string;
}

async function fetchRunIndex(fetcher: typeof fetch): Promise<RunRef[]> {
  let res: Response;
  try {
    res = await fetcher("/runs/_index");
  } catch {
    return [];
  }
  if (!res.ok) return [];
  let text: string;
  try {
    text = await res.text();
  } catch {
    return [];
  }
  // A static host returns index.html (HTML, 200) for an unknown path — treat as "no runs".
  if (text.trimStart().startsWith("<")) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.filter((e): e is RunRef => !!e && typeof (e as RunRef).id === "string");
}

type State =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; id: string; message: string }
  | { status: "ready"; id: string; summary: Summary; results: QuestionResult[] };

export function InterimHome({ fetcher = fetch }: { fetcher?: typeof fetch } = {}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let live = true;
    (async () => {
      const runs = await fetchRunIndex(fetcher);
      if (!live) return;
      if (runs.length === 0) {
        setState({ status: "empty" });
        return;
      }
      const id = runs[0]!.id;
      const res = await loadRun(`/runs/${id}`, fetcher);
      if (!live) return;
      setState(
        res.ok
          ? { status: "ready", id, summary: res.summary, results: res.results }
          : { status: "error", id, message: `${res.kind}: ${res.message}` },
      );
    })().catch((e: unknown) => {
      if (live) setState({ status: "error", id: "", message: (e as Error).message });
    });
    return () => {
      live = false;
    };
  }, [fetcher]);

  if (state.status === "loading") {
    return <CenteredSpinner label="Loading the most recent run…" />;
  }
  if (state.status === "empty") {
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
  if (state.status === "error") {
    return (
      <div role="alert" className="mx-auto max-w-2xl py-16 text-center">
        <p className="font-semibold text-danger">Could not load run {state.id}</p>
        <p className="mt-1 text-sm text-default-500">{state.message}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mx-auto max-w-5xl px-4 pt-4 text-xs text-default-400">run: {state.id}</p>
      <LocalResults summary={state.summary} results={state.results} />
    </div>
  );
}
