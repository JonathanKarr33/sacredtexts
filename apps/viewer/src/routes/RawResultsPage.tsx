import { useMemo } from "react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useLatestSha, useRawScenario, useResultsRuns } from "../lib/queries";
import { asRateLimit } from "../lib/rateLimit";
import { catalogScoreColor } from "../lib/rampColor";
import { parseRawSelection, rawSelectionToSearch, type RawSelection } from "../lib/rawSelection";
import { findCell, type RawCatalog, type RawCell } from "../lib/rawModel";
import { RawComparison } from "../components/RawComparison";
import { CorpusContext } from "../components/CorpusContext";
import { Notices, Notice } from "../components/Notice";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { CenteredSpinner } from "../components/Loading";

const route = getRouteApi("/results/$runId/$groupId/$itemId");

/** All condition-tuples (the cartesian product of the catalog's condition axes) — the grid columns. */
function conditionColumns(catalog: RawCatalog): Record<string, string>[] {
  let cols: Record<string, string>[] = [{}];
  for (const axis of catalog.conditionAxes) {
    cols = cols.flatMap((c) => axis.values.map((v) => ({ ...c, [axis.key]: v.id })));
  }
  return cols;
}
const condKey = (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join("|");

function cellScore(cell: RawCell | undefined, judge: string, scope: string): number | null {
  const v = cell?.verdicts.find((vd) => vd.judge === judge && vd.scope === scope);
  return v ? v.score : null;
}

export function RawResultsPage() {
  const { runId, groupId, itemId } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();

  const shaQ = useLatestSha();
  const sha = shaQ.data;
  const runsQ = useResultsRuns(sha);
  const runsSettled = !!sha && !runsQ.isLoading;
  const fingerprint = runsQ.data?.runs.find((r) => r.id === runId)?.manifest?.fingerprint ?? null;
  // A raw-only run (no score tier) is reached from its `/raw/<runId>` explorer landing, not `/results`
  // — send the back-link there so the reader isn't dead-ended on a leaderboard without their run (#54).
  const isRawOnly = runsSettled && !runsQ.data?.runs.some((r) => r.id === runId);
  const backLink = isRawOnly
    ? <Link to="/raw/$runId" params={{ runId }} className="text-primary hover:underline">← Explorer</Link>
    : <Link to="/results" className="text-primary hover:underline">← Results</Link>;
  const rawQ = useRawScenario(runsSettled ? sha : undefined, runsSettled ? runId : undefined, groupId, itemId, fingerprint);

  const catalog = rawQ.data?.catalog ?? null;
  const shard = rawQ.data?.shard ?? null;
  const notices = rawQ.data?.notices ?? [];
  // Separate USER-facing data problems (prominent, top) from OPERATIONAL source notes — which copy
  // is serving (baked vs GitHub fallback). The latter are maintainer plumbing, not user concerns,
  // so they go to an unobtrusive footer, never a top-of-page banner (Waleed, iter-1 UX).
  const dataNotices = notices.filter((n) => n.kind !== "source");
  const sourceNotices = notices.filter((n) => n.kind === "source");

  const sel: RawSelection | null = useMemo(() => (catalog ? parseRawSelection(search, catalog) : null), [catalog, search]);
  const setSel = (patch: Partial<RawSelection>) => {
    if (!sel) return;
    navigate({ search: rawSelectionToSearch({ ...sel, ...patch }) });
  };

  const rl = asRateLimit(shaQ.error) ?? asRateLimit(runsQ.error) ?? asRateLimit(rawQ.error);
  const otherError = !rl && (shaQ.error || runsQ.error || rawQ.error);

  if ((shaQ.isLoading || runsQ.isLoading || rawQ.isLoading) && !catalog) return <CenteredSpinner label="Loading raw results…" />;
  if (!catalog && (rl || otherError)) {
    return (
      <div className="flex flex-col gap-4">
        {rl && <RateLimitBanner error={rl} />}
        <Notice notice={{ severity: "error", scope: "results-raw", where: runId,
          message: rl ? "Couldn't load raw results — GitHub's rate limit was reached and nothing is cached yet."
                      : `Couldn't load raw results: ${(otherError as Error).message}` }} />
        {backLink}
      </div>
    );
  }
  if (!catalog || !sel) {
    return (
      <div className="flex flex-col gap-4">
        <Notices notices={notices.length ? notices : [{ severity: "error", scope: "results-raw", where: runId, message: "No raw results for this run." }]} />
        {backLink}
      </div>
    );
  }

  const itemLabel = catalog.items.find((i) => i.id === itemId && i.group === groupId)?.label ?? itemId;
  const columns = conditionColumns(catalog);
  const selKey = condKey(sel.conditions);

  return (
    <div className="flex flex-col gap-6">
      {rl && <RateLimitBanner error={rl} />}
      <nav className="flex items-center gap-3 text-sm">
        {backLink}
        <span className="text-default-400">run {runId}</span>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{itemLabel}</h1>
        <p className="text-sm text-default-500">{catalog.groupBy.label}: {groupId} · {catalog.dataset.title}</p>
      </header>

      <Notices notices={dataNotices} />

      {/* Judge + scope + compare controls (generic over catalog vocab). */}
      <section className="flex flex-wrap items-end gap-3" data-testid="raw-controls">
        <Pills label="Judge" value={sel.judge} options={catalog.judges.map((j) => ({ id: j.key, label: j.label }))} onSelect={(judge) => setSel({ judge })} />
        <Pills label="Scope" value={sel.scope} options={catalog.scopes.map((s) => ({ id: s.id, label: s.label }))} onSelect={(scope) => setSel({ scope })} />
        <label className="flex flex-col text-xs text-default-500">
          Compare (B)
          <select className="mt-1 rounded border border-default-200 px-2 py-1 text-sm text-default-800"
            value={sel.b ?? ""} onChange={(e) => setSel({ b: e.target.value || null })}>
            <option value="">— none —</option>
            {catalog.subjects.filter((s) => s.id !== sel.a).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </section>

      {/* Cell-score grid: subjects × condition-tuples, colored by the catalog ramp for the selected
          judge+scope. The grid IS the navigation — click a chip to open that cell below. */}
      {shard && (
        <section className="overflow-x-auto" data-testid="score-grid">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="p-1 text-left text-default-500">subject \ condition</th>
                {columns.map((c) => (
                  <th key={condKey(c)} className="p-1 text-left font-normal text-default-400 whitespace-nowrap">
                    {Object.values(c).join(" / ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalog.subjects.map((s) => (
                <tr key={s.id}>
                  <td className="p-1 pr-2 font-medium text-default-700 whitespace-nowrap">{s.label}</td>
                  {columns.map((c) => {
                    const score = cellScore(findCell(shard, s.id, c), sel.judge, sel.scope);
                    const isA = s.id === sel.a && condKey(c) === selKey;
                    const isB = s.id === sel.b && condKey(c) === selKey;
                    return (
                      <td key={condKey(c)} className="p-0.5">
                        <button
                          type="button"
                          data-testid="grid-chip"
                          data-selected={isA ? "a" : isB ? "b" : undefined}
                          title={`${s.label} · ${Object.values(c).join(" / ")} · ${score ?? "—"}`}
                          onClick={() => setSel({ a: s.id, conditions: c })}
                          className={`h-6 w-8 rounded ${isA ? "ring-2 ring-primary" : isB ? "ring-2 ring-secondary" : ""}`}
                          style={{ backgroundColor: catalogScoreColor(catalog.scale, catalog.ramp, score) }}
                        >
                          <span className="sr-only">{score ?? "no data"}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Selected cell detail — the SAME jalees-style interleaved comparison as the scenario page
          (one renderer over one shape, no divergence). A alone, or A vs B side by side.
          The scenario's judge-guidance (binding ground truth) + corpus cross-link ride RawComparison's
          context slot — rendered AFTER the question, BEFORE the first response — so a deep-linked reader
          sees the question, then the guidance the judges use, then the answers (Waleed's reading-order
          fix, #73). CorpusContext stays the ONE corpus-coupled child, wired through the group→corpus
          mapping so this page stays MB-vocabulary-free (#54 guard); it renders nothing for a non-corpus
          catalog, and the slot then degrades to no gap. */}
      {!shard ? (
        <p className="text-sm text-default-500">Raw data for this item is unavailable — see the notices above.</p>
      ) : (
        <section data-testid="cell-details">
          <RawComparison catalog={catalog} shard={shard} a={sel.a} b={sel.b ?? null} conditions={sel.conditions}
            contextSlot={<CorpusContext sha={sha} catalog={catalog} group={groupId} item={itemId} />} />
        </section>
      )}

      {/* Operational source note (baked vs GitHub fallback) — unobtrusive footer, not a top banner. */}
      {sourceNotices.length > 0 && (
        <footer className="mt-2 flex flex-col gap-0.5 border-t border-default-100 pt-2 text-xs text-default-400"
                data-testid="source-notes">
          {sourceNotices.map((n, i) => (
            <span key={i} className="flex items-center gap-1">
              <Info size={12} className="shrink-0" aria-hidden />
              <span>{n.message}</span>
            </span>
          ))}
        </footer>
      )}
    </div>
  );
}

function Pills({ label, value, options, onSelect }: {
  label: string; value: string; options: { id: string; label: string }[]; onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col text-xs font-medium text-default-500">
      {label}
      <div className="mt-1 flex gap-1" role="group" aria-label={label}>
        {options.map((o) => (
          // Active/inactive styling mirrors the reviewed #55 Segmented/FilterBar pattern — the old
          // `bg-primary text-white` rendered the SELECTED pill near-invisible (Waleed iter-1).
          <button key={o.id} type="button" onClick={() => onSelect(o.id)} aria-pressed={o.id === value}
            className={
              "rounded-full border px-2.5 py-1 text-sm transition-colors " +
              (o.id === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-default-200 bg-default-50 text-default-600 hover:border-default-300")
            }>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
