import { Link } from "@tanstack/react-router";
import {
  formatCell,
  formatCoverage,
  type Cell,
  type Summary,
} from "../lib/localResults";
import {
  formatTokens,
  hasTraditionData,
  leaderboardRows,
  searchContrast,
  traditionRows,
} from "../lib/leaderboard";

/** Accuracy as a whole-percent, or "n/a" (null = every answered cell refused / no data). */
function pct(accuracy: number | null | undefined): string {
  return accuracy === null || accuracy === undefined ? "n/a" : `${Math.round(accuracy * 100)}%`;
}

/** Signed whole-point accuracy delta between two overall cells, or "—" when either is null. */
function accuracyDelta(on: Cell | undefined, off: Cell | undefined): string {
  if (!on || !off || on.accuracy === null || off.accuracy === null) return "—";
  const d = Math.round((on.accuracy - off.accuracy) * 100);
  return `${d > 0 ? "+" : ""}${d} pt`;
}

// The benchmark leaderboard for a single run: one row per model ranked by overall
// accuracy, a column per task, an overall column, per-model token totals, and a
// per-tradition breakdown below. Pure/presentational — it takes a parsed Summary and the
// run id (so model rows and task cells link into the error explorer); data loading and run
// selection live in LeaderboardPage.

export function LeaderboardTable({ summary, runId }: { summary: Summary; runId: string }) {
  const { tasks, rows } = leaderboardRows(summary);
  const showTraditions = hasTraditionData(summary);
  const tRows = showTraditions ? traditionRows(summary, tasks) : [];
  const contrast = searchContrast(summary);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <p className="mt-1 text-sm text-default-500">
        Ranked by overall accuracy (how often a model is right <em>when it answers</em>);{" "}
        <span className="font-medium">coverage</span> is how often it answers — read the pair
        together. Local only — from the run's <code>summary.json</code>.
      </p>
      {summary.evaluators && summary.evaluators.length > 0 && (
        <p className="mt-1 text-xs text-default-400">
          Scored by evaluator{summary.evaluators.length === 1 ? "" : "s"}:{" "}
          <span className="font-medium">{summary.evaluators.join(" + ")}</span>
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
              <th className="py-1 pr-4">coverage</th>
              <th className="py-1 pr-4">tokens</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.modelId} className="border-b">
                <td className="py-1 pr-4 font-medium">
                  <Link
                    to="/run/$runId/model/$modelId"
                    params={{ runId, modelId: row.modelId }}
                    className="text-default-700 underline"
                  >
                    {row.modelId}
                  </Link>
                </td>
                {tasks.map((t) => (
                  <td key={t} className="py-1 pr-4">
                    <Link
                      to="/run/$runId/model/$modelId"
                      params={{ runId, modelId: row.modelId }}
                      search={{ task: t }}
                      className="underline decoration-dotted"
                    >
                      {formatCell(row.byTask[t])}
                    </Link>
                  </td>
                ))}
                <td className="py-1 pr-4 font-semibold">{formatCell(row.overall)}</td>
                <td className="py-1 pr-4 font-semibold">{formatCoverage(row.overall)}</td>
                <td className="py-1 pr-4 text-default-500">{formatTokens(row.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {contrast.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold">Search on vs off</h2>
          <p className="text-xs text-default-400">
            same base model with web search enabled vs disabled — accuracy and coverage side by side
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1 pr-4">model</th>
                  <th className="py-1 pr-4">search off</th>
                  <th className="py-1 pr-4">search on</th>
                  <th className="py-1 pr-4">Δ accuracy</th>
                </tr>
              </thead>
              <tbody>
                {contrast.map((p) => (
                  <tr key={p.base} className="border-b">
                    <td className="py-1 pr-4 font-medium">{p.base}</td>
                    <td className="py-1 pr-4">
                      {pct(p.off.overall?.accuracy)} acc · {formatCoverage(p.off.overall)} cov
                    </td>
                    <td className="py-1 pr-4">
                      {pct(p.on.overall?.accuracy)} acc · {formatCoverage(p.on.overall)} cov
                    </td>
                    <td className="py-1 pr-4 font-semibold">{accuracyDelta(p.on.overall, p.off.overall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showTraditions && (
        <>
          <h2 className="mt-8 text-lg font-semibold">By tradition</h2>
          <p className="text-xs text-default-400">each observation counts once per listed tradition</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1 pr-4">model</th>
                  <th className="py-1 pr-4">tradition</th>
                  {tasks.map((t) => (<th key={t} className="py-1 pr-4">{t}</th>))}
                  <th className="py-1 pr-4">overall</th>
                </tr>
              </thead>
              <tbody>
                {tRows.map((row) => (
                  <tr key={`${row.modelId}:${row.tradition}`} className="border-b">
                    <td className="py-1 pr-4 font-medium">{row.modelId}</td>
                    <td className="py-1 pr-4">{row.tradition}</td>
                    {tasks.map((t) => (
                      <td key={t} className="py-1 pr-4">
                        <Link
                          to="/run/$runId/model/$modelId"
                          params={{ runId, modelId: row.modelId }}
                          search={{ task: t, tradition: row.tradition }}
                          className="underline decoration-dotted"
                        >
                          {formatCell(row.byTask[t])}
                        </Link>
                      </td>
                    ))}
                    <td className="py-1 pr-4 font-semibold">{formatCell(row.overall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
