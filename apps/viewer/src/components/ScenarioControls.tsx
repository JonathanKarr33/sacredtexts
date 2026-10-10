import { Link } from "@tanstack/react-router";
import { rawSelectionToSearch, type RawSelection } from "../lib/rawSelection";
import type { RawCatalog } from "../lib/rawModel";

// Newcomer hints for MultiBench's condition axes (shown as a picker title; the id stays the value).
const AXIS_HINT: Record<string, string> = {
  framing: "How the model was set up before the question (system prompt).",
  pressure: "The follow-up push after the first answer — it becomes the second question below.",
};

/**
 * The scenario page's LEFT pane (jaleesbrowser layout): all controls + guided examples. Model A / B
 * (B = "None" is the single-view toggle) and one selector per catalog condition axis, all driving
 * the URL selection; then the export-computed presets as compact "guided example" link lists that
 * deep-link into the chosen comparison. Catalog-generic — nothing MultiBench-specific is hardcoded.
 */
export function ScenarioControls({ catalog, sel, setSel, judge }: {
  catalog: RawCatalog;
  sel: RawSelection;
  setSel: (patch: Partial<RawSelection>) => void;
  judge: string;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="responses-pickers">
      <div className="grid grid-cols-2 gap-3">
        <Select label="Model A" hint="The AI model being tested." value={sel.a} onChange={(v) => setSel({ a: v })}
          options={catalog.subjects.map((s) => ({ value: s.id, label: s.label }))} />
        <Select label="Model B" hint="Optionally show a second model side by side." value={sel.b ?? ""}
          onChange={(v) => setSel({ b: v || null })}
          options={[{ value: "", label: "None (single view)" }, ...catalog.subjects.filter((s) => s.id !== sel.a).map((s) => ({ value: s.id, label: s.label }))]} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {catalog.conditionAxes.map((ax) => (
          <Select key={ax.key} label={ax.label} hint={AXIS_HINT[ax.key]} value={sel.conditions[ax.key] ?? ""}
            onChange={(v) => setSel({ conditions: { ...sel.conditions, [ax.key]: v } })}
            options={ax.values.map((x) => ({ value: x.id, label: x.label }))} />
        ))}
      </div>

      {catalog.presets.length > 0 && (
        <nav className="flex flex-col gap-3 pt-1" data-testid="presets" aria-label="Guided examples">
          <h3 className="text-sm font-semibold text-default-700">Guided examples</h3>
          {catalog.presets.map((p) => (
            <div key={p.key} data-testid="preset-group">
              <h4 className="text-xs font-medium text-default-600" title={p.description}>{p.label}</h4>
              <ul className="mt-1 flex flex-col gap-0.5">
                {p.entries.slice(0, 10).map((e) => (
                  <li key={e.key}>
                    <Link
                      to="/t/$traditionId/$scenarioId"
                      params={{ traditionId: e.params.group, scenarioId: e.params.item }}
                      search={rawSelectionToSearch({ a: e.params.a, b: e.params.b ?? null, conditions: e.params.conditions, scope: e.params.scope, judge })}
                      className="text-xs text-primary hover:underline"
                    >
                      {e.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, hint }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; hint?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col text-xs font-medium text-default-500" title={hint}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={hint ? `${label} — ${hint}` : label}
        className="mt-1 rounded border border-default-200 px-2 py-1 text-sm text-default-800">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
