import { Chip } from "@heroui/react";
import type { TaxonomyAxis } from "../lib/model";

// Renders the tradition's declared taxonomy axes straight from the manifest — names, provenance,
// and controlled values. NOTHING here is hardcoded; it adapts to 2-axis or 5-axis traditions.
export function TaxonomyAxes({ taxonomies }: { taxonomies: Record<string, TaxonomyAxis> }) {
  const axes = Object.entries(taxonomies);
  if (axes.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="Taxonomy axes">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-default-500">Taxonomies</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {axes.map(([name, axis]) => (
          <div key={name} className="rounded-lg border border-default-200 p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{name}</span>
              {axis.appliesTo && (
                <Chip size="sm" variant="soft" color="accent">
                  {axis.appliesTo}
                </Chip>
              )}
            </div>
            {axis.description && <p className="mt-1 text-xs text-default-500">{axis.description}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              {axis.values.map((v) => (
                <Chip key={v} size="sm" variant="soft" color="default">
                  {v}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
