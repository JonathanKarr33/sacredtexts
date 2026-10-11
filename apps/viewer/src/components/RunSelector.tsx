import { type RunRef } from "../lib/runIndex";

// The run picker on the leaderboard home. Presentational: it lists the enumerated runs
// and calls `onSelect` with the chosen id; the parent owns the URL (`?run=`) and the
// load. When `error` is set (the selected run failed to load), the message is shown but
// the selector stays enabled and keeps every run listed, so the user can pick another —
// a bad run never takes the page down.

export function RunSelector({
  runs,
  selectedId,
  onSelect,
  error,
}: {
  runs: RunRef[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  error?: string | null;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="run-selector" className="text-sm text-default-500">
          Run
        </label>
        <select
          id="run-selector"
          className="rounded border border-default-200 bg-background px-2 py-1 text-sm"
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
        >
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id}
            </option>
          ))}
        </select>
        <span className="text-xs text-default-400">
          {runs.length} run{runs.length === 1 ? "" : "s"} under <code>runs/</code>
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
