// Pure ranking / column-derivation / formatting helpers for the leaderboard home.
// Built on the localResults seam (rankedModels / summaryTasks / formatCell) and extended
// with per-model token totals and the per-tradition breakdown. Presentation components
// (LeaderboardTable) stay thin by consuming these; everything here is side-effect-free and
// directly unit-testable from a fixture Summary.

import {
  type Cell,
  type Summary,
  type UsageTotals,
  rankedModels,
  summaryTasks,
} from "./localResults";

export interface LeaderboardRow {
  modelId: string;
  /** The "_overall" cell (may be undefined / null-accuracy for a model with no data). */
  overall: Cell | undefined;
  /** One entry per task column (undefined where a model has no cell for that task). */
  byTask: Record<string, Cell | undefined>;
  /** Per-model token/call totals from summary.usage, or null when usage is absent. */
  tokens: UsageTotals | null;
}

/** The ranked leaderboard: the task column order plus one row per model (ranked by overall
 * accuracy desc, model_id tiebreak, null-overall last — the rankedModels contract). */
export function leaderboardRows(summary: Summary): { tasks: string[]; rows: LeaderboardRow[] } {
  const tasks = summaryTasks(summary);
  const rows = rankedModels(summary).map((modelId): LeaderboardRow => {
    const m = summary.models[modelId] ?? {};
    const byTask: Record<string, Cell | undefined> = {};
    for (const t of tasks) byTask[t] = m[t];
    return {
      modelId,
      overall: m._overall,
      byTask,
      tokens: summary.usage?.per_model?.[modelId] ?? null,
    };
  });
  return { tasks, rows };
}

export interface TraditionRow {
  modelId: string;
  tradition: string;
  byTask: Record<string, Cell | undefined>;
  overall: Cell | undefined;
}

/** Per-(model, tradition) rows for the by-tradition breakdown, grouped by model rank then
 * tradition name. Returns [] when the run carries no by_tradition block (parseSummary
 * normalizes an absent block to `{}`, so callers omit the section on emptiness, not
 * truthiness). */
export function traditionRows(summary: Summary, tasks: string[]): TraditionRow[] {
  const byTradition = summary.by_tradition ?? {};
  const out: TraditionRow[] = [];
  for (const modelId of rankedModels(summary)) {
    const perTradition = byTradition[modelId];
    if (!perTradition) continue;
    for (const tradition of Object.keys(perTradition).sort()) {
      const cells = perTradition[tradition]!;
      const byTask: Record<string, Cell | undefined> = {};
      for (const t of tasks) byTask[t] = cells[t];
      out.push({ modelId, tradition, byTask, overall: cells._overall });
    }
  }
  return out;
}

/** Whether the run has any by-tradition data to render (emptiness, not truthiness). */
export function hasTraditionData(summary: Summary): boolean {
  return Object.keys(summary.by_tradition ?? {}).length > 0;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

/** "5,810 in · 41,140 out · 100 calls", or "—" when a model has no usage totals. */
export function formatTokens(tokens: UsageTotals | null): string {
  if (!tokens) return "—";
  return `${formatInt(tokens.in)} in · ${formatInt(tokens.out)} out · ${formatInt(tokens.calls)} calls`;
}
