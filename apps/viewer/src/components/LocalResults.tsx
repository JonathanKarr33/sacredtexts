import {
  formatCell,
  rankedModels,
  summaryTasks,
  type QuestionResult,
  type Summary,
} from "../lib/localResults";

// Minimal, local-only results view: a per-model × task summary table and a
// per-question list. Pure (takes parsed artifacts as props); no GitHub data layer.

export function LocalResults({ summary, results }: { summary: Summary; results: QuestionResult[] }) {
  const tasks = summaryTasks(summary);
  const models = rankedModels(summary);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Benchmark results (local)</h1>
      <p className="mt-1 text-sm text-default-500">
        A local view of a run's <code>summary.json</code> and per-question{" "}
        <code>scores.jsonl</code>. Local only — not the shared data layer.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Summary — accuracy by model × task</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-4">model</th>
              {tasks.map((t) => (
                <th key={t} className="py-1 pr-4">{t}</th>
              ))}
              <th className="py-1 pr-4">overall</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m} className="border-b">
                <td className="py-1 pr-4 font-medium">{m}</td>
                {tasks.map((t) => (
                  <td key={t} className="py-1 pr-4">{formatCell(summary.models[m]?.[t])}</td>
                ))}
                <td className="py-1 pr-4 font-semibold">{formatCell(summary.models[m]?._overall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary.by_tradition && Object.keys(summary.by_tradition).length > 0 && (
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
                {Object.keys(summary.by_tradition).sort().flatMap((m) =>
                  Object.keys(summary.by_tradition![m]!).sort().map((trad) => {
                    const cells = summary.by_tradition![m]![trad]!;
                    return (
                      <tr key={`${m}:${trad}`} className="border-b">
                        <td className="py-1 pr-4 font-medium">{m}</td>
                        <td className="py-1 pr-4">{trad}</td>
                        {tasks.map((t) => (<td key={t} className="py-1 pr-4">{formatCell(cells[t])}</td>))}
                        <td className="py-1 pr-4 font-semibold">{formatCell(cells._overall)}</td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="mt-8 text-lg font-semibold">Per-question scores ({results.length})</h2>
      <ul className="mt-2 space-y-3">
        {results.map((r) => (
          <li key={`${r.question_id}:${r.model_id}`} className="rounded border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={r.correct ? "font-semibold text-success" : "font-semibold text-danger"}
                aria-label={r.correct ? "correct" : "incorrect"}
              >
                {r.correct ? "✓" : "✗"}
              </span>
              <span className="text-default-500">{r.task}</span>
              <span className="text-default-400">·</span>
              <span className="font-medium">{r.model_id}</span>
              <span className="text-default-400">·</span>
              <span className="text-default-400">{r.question_id}</span>
            </div>
            <p className="mt-1">{r.prompt}</p>
            <p className="mt-1"><span className="text-default-500">answer:</span> {r.answer}</p>
            <p className="mt-1"><span className="text-default-500">expected:</span> {r.expected}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
