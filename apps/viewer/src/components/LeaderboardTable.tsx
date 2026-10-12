import { Link } from "@tanstack/react-router";
import {
  formatCell,
  type Summary,
} from "../lib/localResults";
import {
  formatTokens,
  hasTraditionData,
  leaderboardRows,
  traditionRows,
} from "../lib/leaderboard";

// The benchmark leaderboard for a single run: one row per model ranked by overall
// accuracy, a column per task, an overall column, per-model token totals, and a
// per-tradition breakdown below. Pure/presentational — it takes a parsed Summary and the
// run id (so model rows and task cells link into the error explorer); data loading and run
// selection live in LeaderboardPage.

export function LeaderboardTable({
  summary,
  runId,
  secondary = false,
}: {
  summary: Summary;
  runId: string;
  secondary?: boolean;
}) {
  const { tasks, rows } = leaderboardRows(summary);
  const showTraditions = hasTraditionData(summary);
  const tRows = showTraditions ? traditionRows(summary, tasks) : [];

  const body = (
    <>
      {secondary ? (
        <summary className="cursor-pointer text-lg font-semibold">Stored headline</summary>
      ) : (
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
      )}
      <p className="mt-1 text-sm text-default-500">
        {secondary
          ? "Strict string match, kept closed. The whole answer has to be the named edition and nothing else. Ordering models by this percentage puts a refusal and a fabrication in the same zero."
          : "Models ranked by overall accuracy over the selected run. Local only — read from the run's summary.json."}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-4">model</th>
              {tasks.map((t) => (
                <th key={t} className="py-1 pr-4">{t}</th>
              ))}
              <th className="py-1 pr-4">overall</th>
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
                <td className="py-1 pr-4 text-default-500">{formatTokens(row.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </>
  );

  if (secondary) {
    return <details className="mx-auto max-w-5xl px-4 py-4">{body}</details>;
  }
  return <div className="mx-auto max-w-5xl px-4 py-8">{body}</div>;
}
