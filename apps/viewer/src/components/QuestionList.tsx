import { type QuestionResult } from "../lib/localResults";
import { formatMetric } from "../lib/explorer";

// The per-question list for one model under the error explorer. Presentational: it takes
// the (already filtered) QuestionResult[] and renders each question with its pass/fail
// state. A missing cell (the model produced no answer) is marked distinctly from a wrong
// answer; every answered question shows its prompt, expected text, the model's actual
// answer, and the per-metric similarity scores (exact / normalized / token-F1) side by
// side — "n/a" where the task emits no such metric.

function StatusBadge({ r }: { r: QuestionResult }) {
  if (r.correct) {
    return <span className="rounded bg-success-100 px-2 py-0.5 text-xs font-medium text-success-700">correct</span>;
  }
  if (r.missing) {
    return <span className="rounded bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700">missing</span>;
  }
  return <span className="rounded bg-danger-100 px-2 py-0.5 text-xs font-medium text-danger-700">wrong</span>;
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded border border-default-200 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-default-400">{label}</div>
      <div className="font-mono text-sm">{formatMetric(value)}</div>
    </div>
  );
}

export function QuestionList({ results }: { results: QuestionResult[] }) {
  if (results.length === 0) {
    return (
      <p className="mt-6 text-sm text-default-500">No questions match the current filters.</p>
    );
  }

  return (
    <ul className="mt-4 flex flex-col gap-4">
      {results.map((r) => (
        <li key={r.question_id} className="rounded-lg border border-default-200 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
            <StatusBadge r={r} />
            <span className="font-mono">{r.question_id}</span>
            <span>·</span>
            <span>{r.task}</span>
            {r.tradition.length > 0 && (
              <>
                <span>·</span>
                <span>{r.tradition.join(", ")}</span>
              </>
            )}
          </div>

          <dl className="mt-3 grid gap-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-default-400">prompt</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{r.prompt}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-default-400">expected</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{r.expected}</dd>
            </div>
            {r.missing ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-default-400">answer</dt>
                <dd className="mt-0.5 italic text-warning-600">
                  no answer produced (missing cell — the model returned no row for this question)
                </dd>
              </div>
            ) : (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-default-400">answer</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{r.answer}</dd>
              </div>
            )}
          </dl>

          {!r.missing && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Metric label="exact" value={r.exact} />
              <Metric label="normalized" value={r.normalized} />
              <Metric label="token-F1" value={r.token_f1} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
