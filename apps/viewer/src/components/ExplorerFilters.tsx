import { type ExplorerFilters as Filters } from "../lib/explorer";

// The composing filter bar for the error explorer. Presentational: it renders native
// selects (provider-less, consistent with RunSelector) for task, tradition,
// correct/incorrect, and failure-mode, and calls `onChange` with the next full filter
// state. The parent (ExplorerPage) owns the URL and maps the change to the search params.

const ALL = "__all__";

function toUndef(v: string): string | undefined {
  return v === ALL ? undefined : v;
}

export function ExplorerFilters({
  tasks,
  traditions,
  value,
  onChange,
}: {
  tasks: string[];
  traditions: string[];
  value: Filters;
  onChange: (next: Filters) => void;
}) {
  const selectClass = "rounded border border-default-200 bg-background px-2 py-1 text-sm";

  // Keep the active value selectable even when it is not in the derived options (e.g. a
  // hand-edited URL, or a tradition with no matching question after other filters) so the
  // controlled <select> never renders blank.
  const withActive = (options: string[], active: string | undefined): string[] =>
    active && !options.includes(active) ? [...options, active] : options;
  const taskOptions = withActive(tasks, value.task);
  const traditionOptions = withActive(traditions, value.tradition);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-xs text-default-500">
        task
        <select
          aria-label="Filter by task"
          className={selectClass}
          value={value.task ?? ALL}
          onChange={(e) => onChange({ ...value, task: toUndef(e.target.value) })}
        >
          <option value={ALL}>all</option>
          {taskOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-default-500">
        tradition
        <select
          aria-label="Filter by tradition"
          className={selectClass}
          value={value.tradition ?? ALL}
          onChange={(e) => onChange({ ...value, tradition: toUndef(e.target.value) })}
        >
          <option value={ALL}>all</option>
          {traditionOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-default-500">
        result
        <select
          aria-label="Filter by correctness"
          className={selectClass}
          value={value.correct ?? ALL}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...value, correct: v === "correct" || v === "incorrect" ? v : undefined });
          }}
        >
          <option value={ALL}>all</option>
          <option value="correct">correct</option>
          <option value="incorrect">incorrect</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-default-500">
        failure mode
        <select
          aria-label="Filter by failure mode"
          className={selectClass}
          value={value.mode ?? ALL}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...value, mode: v === "missing" || v === "wrong" ? v : undefined });
          }}
        >
          <option value={ALL}>all</option>
          <option value="missing">missing cell</option>
          <option value="wrong">wrong answer</option>
        </select>
      </label>
    </div>
  );
}
