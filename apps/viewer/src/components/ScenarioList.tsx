import { ScenarioRow } from "./ScenarioRow";
import type { Row } from "../lib/filtering";

export interface ListRow extends Row {
  loading: boolean;
}

export function ScenarioList({ traditionId, rows }: { traditionId: string; rows: ListRow[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-default-500">No scenarios match these filters.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5" data-testid="scenario-list">
      {rows.map((r) => (
        <ScenarioRow key={r.id} traditionId={traditionId} id={r.id} meta={r.meta} loading={r.loading} />
      ))}
    </div>
  );
}
