import { Link, useParams } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useLatestSha, useRawCatalog } from "../lib/queries";
import { asRateLimit } from "../lib/rateLimit";
import { CenteredSpinner } from "../components/Loading";
import { Notice } from "../components/Notice";
import { RateLimitBanner } from "../components/RateLimitBanner";
import type { RawCatalog, RawPresetEntry } from "../lib/rawModel";

/** What (if anything) the catalog's presets say about one item: the deep-link params to use and the
 *  label(s) of every preset it appears in — i.e. the "large-difference" highlight machinery. */
interface Highlight { entry: RawPresetEntry; presetLabels: string[] }

/**
 * Index a catalog's presets by `group/item`. Presets are the export-computed "biggest movers"
 * (e.g. AFB's `|Δ| dpo vs base`), so preset membership IS the catalog's own, dataset-agnostic
 * signal for which items deserve emphasis — no hardcoded threshold. An item may appear in several
 * presets; we keep the first entry's link params and collect every preset label as a badge.
 */
function highlightsByItem(catalog: RawCatalog): Map<string, Highlight> {
  const byItem = new Map<string, Highlight>();
  for (const p of catalog.presets) {
    for (const e of p.entries) {
      const key = `${e.params.group}/${e.params.item}`;
      const existing = byItem.get(key);
      if (existing) {
        if (!existing.presetLabels.includes(p.label)) existing.presetLabels.push(p.label);
      } else {
        byItem.set(key, { entry: e, presetLabels: [p.label] });
      }
    }
  }
  return byItem;
}

/**
 * Landing for a standalone raw-only explorer (a `results-raw/<runId>/` catalog with no `results/`
 * score tier — e.g. the AFB before/after dataset, #54). Fully **catalog-generic**: every label,
 * subject, and item comes from the manifest, so no dataset-specific vocabulary lives here.
 *
 * Resolves the catalog with a `null` expected fingerprint (a raw-only run has no cross-tier score
 * partner). Renders ONE single-column list of EVERY `catalog.items` entry (full question text,
 * wrapped — never clipped). Items the catalog's presets flag as large-difference movers are
 * emphasized in place and carry a badge per preset (derived from the preset data, not a hardcoded
 * threshold); their link uses the preset entry's exact a/b/scope/conditions so they open the curated
 * before/after comparison. Every other item links with `a`/`b` (the first two subjects) so it still
 * opens two-column, not single (`parseRawSelection` defaults `b` to null → one column otherwise).
 */
export function RawRunPage() {
  const { runId } = useParams({ from: "/raw/$runId" });
  const shaQ = useLatestSha();
  const catQ = useRawCatalog(shaQ.data, runId, null); // raw-only: no cross-tier fingerprint to check
  const catalog = catQ.data?.catalog ?? null;
  const notices = catQ.data?.notices ?? [];
  // Separate user-facing data problems (prominent) from OPERATIONAL source notes (which copy is
  // serving — baked vs GitHub fallback). The AFB run is GitHub-served by design (the baked bundle
  // ships only the MB run), so its "no baked bundle" note must be an unobtrusive footer, never a
  // top banner (matches RawResultsPage / the model.ts contract, Waleed iter-1 UX).
  const dataNotices = notices.filter((n) => n.kind !== "source");
  const sourceNotices = notices.filter((n) => n.kind === "source");

  const rl = asRateLimit(shaQ.error) ?? asRateLimit(catQ.error);
  const otherError = !rl && (shaQ.error || catQ.error);

  // Spin while the SHA or the catalog is still resolving — NOT a premature "not found" (the catalog
  // query is disabled until the SHA arrives, so `catQ.isLoading` alone is false during SHA loading).
  if ((shaQ.isLoading || catQ.isLoading) && !catalog) return <CenteredSpinner label="Loading explorer…" />;
  if (!catalog && (rl || otherError)) {
    return (
      <div className="flex flex-col gap-4">
        {rl && <RateLimitBanner error={rl} />}
        <Notice notice={{ severity: "error", scope: "results-raw", where: runId,
          message: rl ? "Couldn't load this explorer — GitHub's rate limit was reached and nothing is cached yet."
                      : `Couldn't load this explorer: ${(otherError as Error).message}` }} />
        <Link to="/" className="text-primary hover:underline">← Home</Link>
      </div>
    );
  }
  if (!catalog) {
    return (
      <div className="flex flex-col gap-4">
        {dataNotices.map((n, i) => <Notice key={i} notice={n} />)}
        {dataNotices.length === 0 && (
          <Notice notice={{ severity: "error", scope: "results-raw", where: runId, message: `Explorer "${runId}" not found.` }} />
        )}
        <Link to="/" className="text-primary hover:underline">← Home</Link>
      </div>
    );
  }

  const judge =
    catalog.judges.find((j) => j.rankable)?.key ??
    catalog.judges.find((j) => j.fullGrid)?.key ??
    catalog.judges[0]?.key ?? "";
  const a = catalog.subjects[0]?.id ?? "";
  const b = catalog.subjects[1]?.id ?? "";
  const scope = catalog.scopes[0]?.id ?? "";
  const highlights = highlightsByItem(catalog);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/" className="text-sm text-primary hover:underline">← Home</Link>
      {dataNotices.map((n, i) => <Notice key={i} notice={n} />)}
      <div>
        <h1 className="text-2xl font-semibold">{catalog.dataset.title}</h1>
        {catalog.dataset.description && <p className="text-default-500">{catalog.dataset.description}</p>}
      </div>

      <section>
        <h2 className="text-lg font-semibold">{catalog.groupBy.label}</h2>
        {/* ONE single-column list of every item. Preset-flagged large-difference movers are
            emphasized in place and carry a badge per preset; everything else renders plainly. */}
        <ul className="mt-2 flex flex-col gap-1" data-testid="raw-item-index">
          {catalog.items.map((it) => {
            const hl = highlights.get(`${it.group}/${it.id}`);
            // Highlighted items deep-link with the preset entry's exact selection (the curated
            // before/after); plain items fall back to the first two subjects + first scope.
            const search = hl
              ? { ...hl.entry.params.conditions, a: hl.entry.params.a,
                  ...(hl.entry.params.b ? { b: hl.entry.params.b } : {}), scope: hl.entry.params.scope, judge }
              : { a, ...(b ? { b } : {}), scope, judge };
            return (
              <li key={`${it.group}/${it.id}`}>
                <Link
                  to="/results/$runId/$groupId/$itemId"
                  params={{ runId, groupId: it.group, itemId: it.id }}
                  search={search}
                  className={
                    "group flex items-start gap-2 rounded px-1.5 py-1 hover:bg-default-100 " +
                    (hl ? "border-l-2 border-primary/60 bg-primary/5" : "")
                  }
                >
                  <span className={
                    "w-24 shrink-0 font-mono text-xs text-primary group-hover:underline " +
                    (hl ? "font-semibold" : "")
                  }>{it.id}</span>
                  {/* Full question text — wraps, never clipped (no `truncate`). */}
                  <span className={
                    "min-w-0 flex-1 break-words text-xs " +
                    (hl ? "font-medium text-default-700" : "text-default-600")
                  }>{it.label}</span>
                  {hl && (
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {hl.presetLabels.map((label) => (
                        <span key={label}
                          className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                          data-testid="raw-item-highlight">{label}</span>
                      ))}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

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
