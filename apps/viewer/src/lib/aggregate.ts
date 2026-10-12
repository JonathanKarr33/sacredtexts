// Pure cross-run rollup for the "current standings" view (Spec 2 requirement 6): for each
// model, its MOST RECENT result across all runs — one row per model, taken from the latest
// run that benchmarked it. Side-effect-free and directly unit-testable from fixture
// summaries; StandingsPage does the fetching and rendering.

import { type Cell, type Summary } from "./localResults";
import { runRecencyMs } from "./recency";

/** One run's parsed summary, tagged with the run id and its directory mtime. Recency (the
 * most-recent-wins key) is derived from `summary.generated_at` → run-id date → `mtimeMs`
 * (Issue #7) — never the mtime alone, which collapses in a fresh clone. */
export interface RunSummary {
  runId: string;
  mtimeMs: number;
  summary: Summary;
}

/** One model's current standing: its result from the most recent run that includes it. */
export interface StandingRow {
  /** Identity key: `${provider}\u0000${model}\u0000${sortedTools}` from the source run's
   * `panel` (tools missing ⇒ `[]`), or the bare `model_id` when that run has no panel
   * entry (graceful fallback — see `aggregate`). */
  key: string;
  /** The model's display id (the `summary.models` key) in the source run. */
  modelId: string;
  /** Panel identity, or null when this row is keyed on `model_id` only (panel absent). */
  provider: string | null;
  model: string | null;
  /** The panel entry's tools setting (`[]` when absent), part of the standings identity. */
  tools: string[];
  /** The run this standing is taken from, and its resolved recency (epoch-ms; the
   * most-recent-wins key and the displayed date — see `runRecencyMs`). */
  runId: string;
  recencyMs: number;
  /** The "_overall" cell and per-task cells from the source run. */
  overall: Cell | undefined;
  byTask: Record<string, Cell | undefined>;
}

/**
 * Roll every run up into current standings: one row per model, keyed on the panel
 * `(provider, model, tools)` identity (architect-binding requirement 6 — so a model
 * renamed in its `summary.models` key across runs still dedupes to one row, while the same
 * model run with vs. without tools stays two rows). Tools are sorted into the key (and a
 * missing `tools` field defaults to `[]`), so a hand-written summary can't produce an
 * order-dependent key and a bare pre-Approach-B run dedupes against an explicit no-tools
 * run of the same model. For each key the row is taken from the run with the greatest
 * recency (`runRecencyMs`: generated_at → run-id date → mtime — never mtime alone, which
 * collapses in a fresh clone, Issue #7); an exact recency tie is broken by run id ascending
 * — the SAME ordering the run index uses (`listRuns`/`fetchRunIndex` sort recency desc, id
 * asc), so standings and the leaderboard's "most recent run" default never disagree about
 * which of two equally-recent runs is newest.
 *
 * A run that carries no `panel` entry for a model falls back to keying on the bare
 * `model_id`: the model still appears from that run, it simply cannot dedupe against a
 * panel-keyed sibling (panel-keyed and model_id-keyed rows for the same model would both
 * show). This is intentional graceful degradation, not a crash.
 *
 * Rows are ranked exactly like the leaderboard (overall accuracy descending, null-accuracy
 * last, model id ascending as a tiebreak), so over a single run the standings rows equal
 * that run's leaderboard rows. `tasks` is the sorted union of task columns across the
 * selected rows (runs benchmarked at different times may cover different tasks).
 */
export function aggregate(runs: RunSummary[]): { tasks: string[]; rows: StandingRow[] } {
  const best = new Map<string, StandingRow>();
  for (const { runId, mtimeMs, summary } of runs) {
    const recencyMs = runRecencyMs({ generatedAt: summary.generated_at, runId, mtimeMs });
    const panel = summary.panel ?? {};
    for (const [modelId, cells] of Object.entries(summary.models)) {
      const p = panel[modelId];
      const tools = [...(p?.tools ?? [])].sort();
      const key = p ? `${p.provider}\u0000${p.model}\u0000${tools.join(",")}` : modelId;
      const byTask: Record<string, Cell | undefined> = {};
      for (const [t, c] of Object.entries(cells)) if (t !== "_overall") byTask[t] = c;
      const candidate: StandingRow = {
        key,
        modelId,
        provider: p?.provider ?? null,
        model: p?.model ?? null,
        tools,
        runId,
        recencyMs,
        overall: cells._overall,
        byTask,
      };
      const prev = best.get(key);
      // Most recent wins; an exact recency tie is broken by run id ASCENDING, matching the
      // run index's newest-first order (recency desc, id asc) so standings agree with the
      // leaderboard default on which tied run is "most recent".
      if (
        !prev ||
        recencyMs > prev.recencyMs ||
        (recencyMs === prev.recencyMs && runId < prev.runId)
      ) {
        best.set(key, candidate);
      }
    }
  }

  const rows = [...best.values()];
  const taskSet = new Set<string>();
  for (const r of rows) for (const t of Object.keys(r.byTask)) taskSet.add(t);
  const tasks = [...taskSet].sort();

  rows.sort((a, b) => {
    const d = (b.overall?.accuracy ?? -1) - (a.overall?.accuracy ?? -1);
    return d !== 0 ? d : a.modelId < b.modelId ? -1 : a.modelId > b.modelId ? 1 : 0;
  });
  return { tasks, rows };
}
