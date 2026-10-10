import { Chip } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { SkeletonRow } from "./Loading";
import { identityColor } from "../lib/identity";
import type { ScenarioMeta } from "../lib/model";

export function ScenarioRow({
  traditionId,
  id,
  meta,
  loading,
}: {
  traditionId: string;
  id: string;
  meta: ScenarioMeta | null;
  loading: boolean;
}) {
  if (loading) return <SkeletonRow />;

  return (
    <Link
      to="/t/$traditionId/$scenarioId"
      params={{ traditionId, scenarioId: id }}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-default-200 px-3 py-2 hover:border-primary/40 hover:bg-default-50"
      data-testid="scenario-row"
    >
      <span className="font-mono text-sm font-medium">{id}</span>
      {meta ? (
        <>
          {meta.sourceLocus != null && (
            <span className="text-xs text-default-400">#{meta.sourceLocus}</span>
          )}
          <span className="flex-1 truncate text-sm text-default-600">{meta.locusLabel ?? ""}</span>
          {meta.identitySignal && (
            <Chip size="sm" variant="soft" color={identityColor(meta.identitySignal)}>
              {meta.identitySignal}
            </Chip>
          )}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {Object.entries(meta.tags).map(([axis, values]) => (
              <span key={axis} className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-default-400">{axis}</span>
                {values.map((v) => (
                  <Chip key={`${axis}-${v}`} size="sm" variant="soft" color="default">
                    {v}
                  </Chip>
                ))}
              </span>
            ))}
          </span>
        </>
      ) : (
        <span className="text-xs text-warning-600">metadata unavailable</span>
      )}
    </Link>
  );
}
