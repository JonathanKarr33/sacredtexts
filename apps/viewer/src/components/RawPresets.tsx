import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { RawCatalog } from "../lib/rawModel";

/**
 * The run-level highlight presets: export-computed curated deep links into the raw explorer (each may
 * target a different item). Presets are RUN-scoped, not item-scoped — they live on the run landing
 * (`/results`), not on every raw item page. Rendered as an index of compact cards (header + aligned
 * rows + show-all), catalog-generic (the `presets` field drives everything). Renders nothing when the
 * catalog declares no presets.
 */
export function RawPresets({ presets, runId, judge }: {
  presets: RawCatalog["presets"]; runId: string; judge: string;
}) {
  if (presets.length === 0) return null;
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="presets">
      {presets.map((p) => (
        <PresetCard key={p.key} preset={p} runId={runId} judge={judge} />
      ))}
    </section>
  );
}

/** One preset as a compact, scannable card: header + an aligned list of a few entries + show-all. */
function PresetCard({ preset, runId, judge }: {
  preset: RawCatalog["presets"][number]; runId: string; judge: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const VISIBLE = 6;
  const shown = expanded ? preset.entries : preset.entries.slice(0, VISIBLE);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-default-200 p-3" data-testid="preset-card">
      <div>
        <h3 className="text-sm font-semibold text-default-700">{preset.label}</h3>
        {preset.description && <p className="text-xs text-default-500">{preset.description}</p>}
      </div>
      <ul className="flex flex-col">
        {shown.map((e) => {
          const sep = e.label.indexOf(" · ");
          const desc = sep >= 0 ? e.label.slice(sep + 3) : e.label; // strip the leading "ID · " (item id shown separately)
          return (
            <li key={e.key}>
              <Link
                to="/results/$runId/$groupId/$itemId"
                params={{ runId, groupId: e.params.group, itemId: e.params.item }}
                // conditions first so the reserved keys always win (matches rawSelectionToSearch)
                search={{ ...e.params.conditions, a: e.params.a, ...(e.params.b ? { b: e.params.b } : {}), scope: e.params.scope, judge }}
                className="group flex items-baseline gap-2 rounded px-1.5 py-1 hover:bg-default-100"
              >
                <span className="w-20 shrink-0 font-mono text-xs text-primary group-hover:underline">{e.params.item}</span>
                <span className="truncate text-xs text-default-600" title={desc}>{desc}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {preset.entries.length > VISIBLE && (
        <button type="button" onClick={() => setExpanded((v) => !v)}
          className="self-start text-xs text-primary hover:underline" data-testid="preset-toggle">
          {expanded ? "Show fewer" : `Show all ${preset.entries.length}`}
        </button>
      )}
    </div>
  );
}
