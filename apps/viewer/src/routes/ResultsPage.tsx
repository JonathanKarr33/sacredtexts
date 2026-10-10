import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useLatestSha, useRawCatalog, useRawExplorerRunIds, useResultsRuns, useResultsRun } from "../lib/queries";
import { asRateLimit, resetLabel } from "../lib/rateLimit";
import { CenteredSpinner } from "../components/Loading";
import { Notice } from "../components/Notice";
import { RawPresets } from "../components/RawPresets";
import { RateLimitBanner } from "../components/RateLimitBanner";
import {
  parseResultsSelection,
  selectionToResultsSearch,
  type ResultsSelection,
  type SortDir,
  type SortSpec,
} from "../lib/resultsSelection";
import {
  computeLeaderboardRows,
  isRankingJudge,
  isSortableColumn,
  judgeModelForKey,
  sortRows,
  subjectDrilldownRows,
  type StripCell,
} from "../lib/leaderboard";
import { scoreColor, scoreTextColor } from "../lib/scoreColor";
import { notice, type Notice as NoticeT } from "../lib/model";
import type { ResultsManifest, ResultsShard } from "../lib/resultsModel";

const routeApi = getRouteApi("/results");

const FRAMING_LABEL: Record<string, string> = { unstated: "Unstated", stated: "Stated", guided: "Guided" };
const HEADLINE_COLS: { key: "initial" | "post" | "delta"; label: string }[] = [
  { key: "initial", label: "First response" },
  { key: "post", label: "Post-pressure" },
  { key: "delta", label: "Steadfastness (Δ)" },
];

/** Single-select segmented control (deep-linkable; mirrors FilterBar's Toggle look). */
function Segmented<T extends string>({
  label, options, value, onChange, testid,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testid: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testid}>
      <span className="text-xs font-medium text-default-500">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={
            "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
            (value === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-default-200 bg-default-50 text-default-600 hover:border-default-300")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function fmt(v: number | null): string {
  return v === null ? "—" : v.toFixed(3);
}

/** Signed 2-dp for the strip tooltip (e.g. "+0.44", "-0.18", "—"). */
function fmtSigned(v: number | null): string {
  return v === null ? "—" : (v > 0 ? "+" : "") + v.toFixed(2);
}

/** Title-case a tradition id for display: "sunni-islam" → "Sunni Islam". */
function traditionDisplayName(id: string): string {
  return id
    .split("-")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function ResultsPage() {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const shaQ = useLatestSha();
  const runsQ = useResultsRuns(shaQ.data);
  // Raw-only experiment datasets (a `results-raw/` tier with no `results/` score tier). Discovered
  // from the same walked tree, so listing them adds no GitHub API call and never touches the
  // score-tier loader — a raw-only run can't paint a false "manifest not found" (#54 lesson).
  const explorers = useRawExplorerRunIds(shaQ.data).data ?? [];

  const preSel = parseResultsSelection(search);
  const runs = runsQ.data?.runs ?? [];
  // Only runs whose manifest parsed are selectable — a malformed run must never be reachable via the
  // selector or a `?run=` deep link, or picking it would blank the whole page (manifest → null) with
  // no selector left to recover. Its parse notices still surface via `dataNotices` below.
  const selectableRuns = runs.filter((r) => r.manifest !== null);
  const knownRunIds = new Set(selectableRuns.map((r) => r.id));
  const runInvalid = preSel.runId != null && runsQ.data != null && !knownRunIds.has(preSel.runId);
  const runId =
    preSel.runId && knownRunIds.has(preSel.runId) ? preSel.runId : runsQ.data?.defaultRunId ?? undefined;
  const runQ = useResultsRun(shaQ.data, runId);
  const manifest = runQ.data?.manifest ?? null;

  // The run's raw catalog drives the run-level highlight presets (moved off the per-item raw pages).
  // Fail-soft: a run with no raw tier → null catalog → no highlights section (its notices are the raw
  // pages' concern, not the leaderboard's, so they are not surfaced here). Source the cross-tier
  // fingerprint from `runsQ` (settled by the time `runId` resolves) — NOT from `useResultsRun`, which
  // lands later and would fire `resolveRawSource` once with a null (cache-orphaned) fingerprint first.
  const rawFingerprint = runsQ.data?.runs.find((r) => r.id === runId)?.manifest?.fingerprint ?? null;
  const rawCatalog = useRawCatalog(runsQ.data ? shaQ.data : undefined, runId, rawFingerprint).data?.catalog ?? null;
  // Highlights deliberately deep-link with the ranking judge (Gemini) — falling back to the first
  // full-grid judge (pre-#110 catalogs) then the first declared judge.
  const highlightJudge =
    rawCatalog?.judges.find((j) => j.rankable)?.key ??
    rawCatalog?.judges.find((j) => j.fullGrid)?.key ??
    rawCatalog?.judges[0]?.key ?? "";

  const rl = asRateLimit(shaQ.error) ?? asRateLimit(runsQ.error) ?? asRateLimit(runQ.error);

  // Re-parse against the manifest so out-of-vocab deep links degrade to defaults.
  const sel = parseResultsSelection(search, manifest);

  const update = (patch: Partial<ResultsSelection>) =>
    navigate({ search: selectionToResultsSearch({ ...sel, ...patch }) });

  // Surface every data-layer notice (malformed/missing manifest or shard, unknown vocab, dropped
  // tradition) — display-first: the page never silently hides a problem or renders blank. Deduped
  // because the selected run's manifest notices arrive from BOTH the runs list and the loaded run.
  const seenNotice = new Set<string>();
  const dataNotices: NoticeT[] = [
    ...runs.flatMap((r) => r.notices),
    ...(runQ.data?.notices ?? []),
  ].filter((n) => {
    const k = `${n.severity}|${n.scope}|${n.where}|${n.message}`;
    if (seenNotice.has(k)) return false;
    seenNotice.add(k);
    return true;
  });
  if (runInvalid) {
    dataNotices.unshift(
      notice("warning", "results", "?run", `run "${preSel.runId}" not found — showing ${runId ?? "no run"}`),
    );
  }
  if (runQ.error && !rl) {
    dataNotices.unshift(notice("error", "results", "GitHub", `could not load run: ${(runQ.error as Error).message}`));
  }

  const loadingFirst = !runsQ.data && !rl && !shaQ.error && !runsQ.error;

  return (
    <div className="flex flex-col gap-5">
      {rl && <RateLimitBanner error={rl} />}
      <div>
        <h1 className="text-2xl font-semibold">Results</h1>
        <p className="text-default-500">
          Cross-tradition standings — the mean of per-tradition means, ranked on{" "}
          {manifest?.ranking
            ? `the ${manifest.ranking.judges.length}-judge mean (${manifest.ranking.judges
                .map((m) => manifest.judges.find((j) => j.model === m)?.key ?? m)
                .join(" + ")})`
            : "the full-grid ranking judge"}. Every column is one pressure slice; sort any column,
          the rank stays canonical.
        </p>
      </div>

      {loadingFirst && <CenteredSpinner label="Loading results…" />}

      {runsQ.data && runsQ.data.runs.length === 0 && explorers.length === 0 && (
        <p className="py-12 text-center text-default-500">No datasets published in this snapshot yet.</p>
      )}

      {!runsQ.data && (rl || shaQ.error || runsQ.error) && (
        <Notice notice={{
          severity: "error", scope: "results", where: "GitHub",
          message: rl
            ? `Couldn't load results — GitHub's rate limit was reached. Live data resumes around ${resetLabel(rl)}.`
            : `Could not load results: ${((shaQ.error || runsQ.error) as Error).message}`,
        }} />
      )}

      {dataNotices.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="results-notices">
          {dataNotices.slice(0, 20).map((n, i) => (
            <Notice key={`${n.where}-${i}`} notice={n} />
          ))}
        </div>
      )}

      {manifest && (
        <>
          <div className="flex flex-col gap-3 rounded-lg border border-default-200 bg-default-50/50 p-3">
            <div className="text-xs text-default-500" data-testid="results-run-label">
              Run <span className="font-mono text-default-700">{manifest.runId}</span> · exported{" "}
              {manifest.generatedAt.slice(0, 10)} · {manifest.traditions.length} traditions
            </div>
            {selectableRuns.length > 1 && (
              <Segmented
                label="Run"
                testid="sel-run"
                value={manifest.runId}
                onChange={(id) => update({ runId: id === runsQ.data?.defaultRunId ? null : id })}
                options={selectableRuns.map((r) => ({ value: r.id, label: r.id }))}
              />
            )}
            <Segmented
              label="Pressure"
              testid="sel-pressure"
              value={sel.pressure}
              onChange={(pressure) => update({ pressure })}
              options={[
                { value: manifest.pressureAll, label: "All" },
                ...manifest.pressures.map((p) => ({ value: p, label: p })),
              ]}
            />
            <Segmented
              label="Drill-down judge"
              testid="sel-judge"
              value={sel.judge}
              onChange={(judge) => update({ judge })}
              options={manifest.judges.map((j) => ({
                value: j.key,
                // #120: under a mean-of-judges ranking, both judges are co-equal COMPONENTS of the
                // headline mean — not "ranking vs validation". Legacy manifests keep the old labels.
                label: manifest.ranking
                  ? `${j.key} (component)`
                  : (isRankingJudge(j) ? `${j.key} (ranking)` : `${j.key} (validation)`),
              }))}
            />
          </div>

          {(() => {
            const jm = manifest.judges.find((j) => j.key === sel.judge);
            if (!jm) return null;
            if (manifest.ranking) {
              // The board ranks on the two-judge mean; the drill-down shows one component judge.
              return (
                <p className="text-xs text-default-500" data-testid="component-caption">
                  Showing <span className="font-medium">{sel.judge}</span> in the per-tradition
                  drill-down — one of the {manifest.ranking.judges.length} component judges. The
                  leaderboard ranks on their per-cell mean{jm.fullGrid
                    ? (jm.coverage != null && jm.coverage < 1
                        ? <> ({sel.judge} coverage {(jm.coverage * 100).toFixed(2)}%)</> : <></>)
                    : <> ({sel.judge} coverage is a sample, badged <span className="font-mono">n/N</span>)</>}.
                </p>
              );
            }
            if (isRankingJudge(jm)) return null;  // legacy: only for a non-ranking (validation) judge
            return (
              <p className="text-xs text-warning-700" data-testid="opus-caption">
                Showing <span className="font-medium">{sel.judge}</span> as a validation judge in the
                per-tradition drill-down{jm.fullGrid
                  ? (jm.coverage != null ? <> — full-grid coverage {(jm.coverage * 100).toFixed(1)}%</> : <> — full grid</>)
                  : <> — coverage is a sample (badged <span className="font-mono">n/N</span>)</>}.
                The leaderboard ranking always stays on the ranking judge (Gemini).
              </p>
            );
          })()}

          <Leaderboard
            manifest={manifest}
            shards={runQ.data!.shards}
            sel={sel}
            onSort={(key) => {
              const cur = sel.sort;
              const dir: SortDir = cur && cur.key === key && cur.dir === "desc" ? "asc" : "desc";
              update({ sort: { key, dir } });
            }}
            onToggleExpand={(subject) =>
              update({
                expanded: sel.expanded.includes(subject)
                  ? sel.expanded.filter((s) => s !== subject)
                  : [...sel.expanded, subject],
              })
            }
          />

          {/* Run-level highlights: curated cross-tradition deep links into the raw explorer. These are
              RUN-scoped (not item-scoped), so they live here rather than on every raw item page. Needs
              at least one judge (the preset links carry a `?judge=`) — skip otherwise. */}
          {rawCatalog && rawCatalog.presets.length > 0 && highlightJudge !== "" && (
            <section className="flex flex-col gap-2" data-testid="highlights">
              <div>
                <h2 className="text-lg font-semibold">Highlights</h2>
                <p className="text-sm text-default-500">
                  Curated cross-tradition deep links into the raw explorer.
                </p>
              </div>
              <RawPresets presets={rawCatalog.presets} runId={manifest.runId} judge={highlightJudge} />
            </section>
          )}
        </>
      )}

      {/* Raw-only experiment datasets — published alongside the scored runs but with no leaderboard
          of their own. Each links to its standalone `/raw/<runId>` explorer landing (never the
          score-tier loader). Rendered independently of `manifest`, so experiments appear even when
          no scored run exists. New datasets (e.g. an upcoming round) list here with zero code change. */}
      {explorers.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="experiments">
          <div>
            <h2 className="text-lg font-semibold">Experiments</h2>
            <p className="text-sm text-default-500">
              Standalone raw-only datasets — each opens its own before/after explorer.
            </p>
          </div>
          <ul className="flex flex-col gap-2" data-testid="experiments-list">
            {explorers.map((id) => (
              <ExperimentRow key={id} sha={shaQ.data} runId={id} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * One raw-only experiment entry. Labels from the run's catalog (`dataset.title`/`description`),
 * fetched fail-soft via `useRawCatalog` with a null expected fingerprint (a raw-only run has no
 * cross-tier score partner). A malformed/unreadable catalog → null → falls back to the bare run id,
 * so a bad dataset never blanks the section. Links to the `/raw/<runId>` explorer landing.
 */
function ExperimentRow({ sha, runId }: { sha: string | undefined; runId: string }) {
  const catalog = useRawCatalog(sha, runId, null).data?.catalog ?? null;
  const title = catalog?.dataset.title ?? runId;
  const description = catalog?.dataset.description;
  return (
    <li>
      <Link
        to="/raw/$runId"
        params={{ runId }}
        className="block rounded-lg border border-default-200 bg-default-50/50 p-3 transition-colors hover:border-default-300"
        data-testid="experiment-card"
        data-run={runId}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-primary group-hover:underline" data-testid="experiment-title">{title}</span>
          <span className="font-mono text-xs text-default-400">{runId}</span>
        </div>
        {description && <p className="mt-0.5 text-sm text-default-500">{description}</p>}
      </Link>
    </li>
  );
}

/**
 * A sortable column header. Hoisted to module scope (NOT defined in the table's render body): a
 * component defined inside render gets a new identity each render, so React would remount the
 * `<th>`/button on every state change and drop keyboard focus after a sort activation.
 */
function SortHeader({
  colKey, label, sort, onSort,
}: {
  colKey: string;
  label: string;
  sort: SortSpec | null;
  onSort: (key: string) => void;
}) {
  const active = sort?.key === colKey;
  const ariaSort = active ? (sort!.dir === "desc" ? "descending" : "ascending") : "none";
  return (
    <th scope="col" className="py-2 pr-2 font-medium" aria-sort={ariaSort} data-testid={`col-${colKey}`}>
      <button type="button" className="hover:text-primary" onClick={() => onSort(colKey)}>
        {label}
        {active ? (sort!.dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}

function ScoreCell({ value, testid }: { value: number | null; testid: string }) {
  return (
    <span
      className="inline-block min-w-16 rounded px-2 py-0.5 text-center font-mono tabular-nums"
      style={{ backgroundColor: scoreColor(value), color: scoreTextColor(value) }}
      data-testid={testid}
    >
      {fmt(value)}
    </span>
  );
}

/** The rich text for a strip square's hover/focus tooltip (also its accessible name). The trailing
 *  count is the tradition's scenario count (`nScenarios`) — the reader-facing "n" — NOT the pooled
 *  judged-cell count (which is nScenarios × pressures at pressure="all"). */
function stripSummary(c: StripCell): string {
  const name = traditionDisplayName(c.tradition);
  const n = `${c.nScenarios} ${c.nScenarios === 1 ? "scenario" : "scenarios"}`;
  if (c.value === null) return `${name} — no data at this selection (${n})`;
  return `${name} — Post ${fmtSigned(c.value)} · First ${fmtSigned(c.initial)} · Δ ${fmtSigned(c.delta)} · ${n}`;
}

/**
 * The per-tradition heat strip (the multi-faith upgrade): one `scoreColor` square per tradition, in
 * manifest order, whose non-null mean IS the Post column. Color is never the sole encoding — each
 * square is a focusable `role="img"` whose `aria-label` carries the full per-tradition summary (so
 * assistive tech gets everything without opening anything), and hover OR keyboard focus reveals the
 * same summary as a visual tooltip (`role="tooltip"`). An uncovered tradition is a dashed "no data"
 * square. All numbers come from the row's `strip` (the same `computeStandings` aggregation as the
 * drill-down — no second path).
 */
function HeatStrip({ strip, subject }: { strip: StripCell[]; subject: string }) {
  const [active, setActive] = useState<string | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const [shift, setShift] = useState(0);
  const safe = subject.replace(/[^\w-]/g, "-");

  // Edge-aware positioning: when a tooltip opens, measure it at the neutral (centered) position and
  // clamp it within the viewport so right- or left-edge squares don't clip mid-word. jsdom has no
  // layout (all rects are 0), so this is inert in tests — positioning is verified by inspection.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (active === null || !el) {
      setShift(0);
      return;
    }
    el.style.transform = "translateX(-50%)"; // neutral for measurement
    const rect = el.getBoundingClientRect();
    const margin = 8;
    if (rect.right > window.innerWidth - margin) setShift(window.innerWidth - margin - rect.right);
    else if (rect.left < margin) setShift(margin - rect.left);
    else setShift(0);
  }, [active]);

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={`Per-tradition scores for ${subject}`} data-testid="strip">
      {strip.map((c) => {
        const summary = stripSummary(c);
        const open = active === c.tradition;
        const tipId = `tip-${safe}-${c.tradition}`;
        const clear = () => setActive((a) => (a === c.tradition ? null : a));
        return (
          <span key={c.tradition} className="relative inline-flex">
            <span
              tabIndex={0}
              role="img"
              aria-label={summary}
              data-testid="strip-cell"
              data-tradition={c.tradition}
              data-empty={c.value === null ? "true" : undefined}
              onMouseEnter={() => setActive(c.tradition)}
              onMouseLeave={clear}
              onFocus={() => setActive(c.tradition)}
              onBlur={clear}
              className={
                "inline-block h-4 w-4 cursor-help rounded-sm border " +
                (c.value === null ? "border-dashed border-default-400" : "border-default-200/60")
              }
              style={{ backgroundColor: scoreColor(c.value) }}
            />
            {open && (
              <span
                ref={tipRef}
                role="tooltip"
                id={tipId}
                data-testid="strip-tooltip"
                // Surface is set via INLINE style, not `bg-*` classes: HeroUI v3 has no `default-900`
                // shade, so the old `bg-default-900` generated no rule and the panel was transparent
                // (Waleed's iter-3 screenshot: text bled through the header). Concrete colours are the
                // same proven mechanism the score cells use (`scoreColor`), so the panel is opaque.
                style={{
                  transform: `translateX(calc(-50% + ${shift}px))`,
                  backgroundColor: "#18181b",
                  color: "#fafafa",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
                className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 w-max max-w-xs rounded px-2 py-1 text-xs shadow-lg"
              >
                {summary}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function Leaderboard({
  manifest, shards, sel, onSort, onToggleExpand,
}: {
  manifest: ResultsManifest;
  shards: Record<string, ResultsShard>;
  sel: ResultsSelection;
  onSort: (key: string) => void;
  onToggleExpand: (subject: string) => void;
}) {
  const total = manifest.traditions.length;
  const firstFraming = manifest.framings[0] ?? "unstated";
  const rows = computeLeaderboardRows(shards, manifest, { pressure: sel.pressure });
  const display = sel.sort && isSortableColumn(manifest, sel.sort.key)
    ? sortRows(rows, sel.sort.key, sel.sort.dir)
    : rows;
  // The drill-down always shows a REAL judge's per-tradition breakdown (sel.judge is validated to a
  // manifest key). Fall back to the first real judge, never the synthetic combined ranking key.
  const drillJudge = judgeModelForKey(manifest, sel.judge) ?? manifest.judges[0]?.model ?? "";
  const selJudgeMeta = manifest.judges.find((j) => j.key === sel.judge);
  const isSample = !selJudgeMeta?.fullGrid;  // coverage: a sub-grid sample (badged n/N)
  const drillJudgeIsRanking = selJudgeMeta ? isRankingJudge(selJudgeMeta) : true;  // role: ranking vs validation
  const expanded = new Set(sel.expanded);

  const framingCols = manifest.framings.map((f) => ({ key: f, label: FRAMING_LABEL[f] ?? f }));
  // # + Subject + 3 headline + F framing + Traditions — the drill-down spans the whole row.
  const totalCols = 6 + framingCols.length;

  return (
    <div className="overflow-x-auto" data-testid="leaderboard-scroll">
      <table className="w-full border-collapse text-sm" data-testid="leaderboard">
        <thead>
          <tr className="border-b border-default-200 text-left text-xs uppercase text-default-500">
            <th scope="col" className="py-2 pr-2 font-medium">#</th>
            <th scope="col" className="py-2 pr-2 font-medium">Subject</th>
            {HEADLINE_COLS.map((c) => (
              <SortHeader key={c.key} colKey={c.key} label={c.label} sort={sel.sort} onSort={onSort} />
            ))}
            {framingCols.map((c) => (
              <SortHeader key={c.key} colKey={c.key} label={c.label} sort={sel.sort} onSort={onSort} />
            ))}
            <th scope="col" className="py-2 pr-2 font-medium" title="Per-tradition Post scores, in manifest order; hover a square for its value">
              Traditions
            </th>
          </tr>
        </thead>
        <tbody>
          {display.map((r) => {
            const open = expanded.has(r.subject);
            // A single k/N (traditions contributing) is derived from the Post-slice strip and is valid
            // for the whole row: the #50 "earned full_grid" invariant means a judge either covers a
            // shard's entire grid or is excluded from it wholesale, so coverage cannot diverge column
            // by column — the Post strip's non-null count equals every other column's. If that
            // invariant is ever relaxed (partial per-column coverage), revisit this to a per-column count.
            const nContributing = r.strip.filter((c) => c.value !== null).length;
            const drillId = `drill-${r.subject.replace(/[^\w-]/g, "-")}`;
            const drill = open
              ? subjectDrilldownRows(shards, manifest, r.subject, { pressure: sel.pressure, judgeModel: drillJudge })
              : [];
            return (
              <Fragment key={r.subject}>
                <tr
                  className={"border-b border-default-100" + (nContributing === 0 ? " opacity-50" : "")}
                  data-testid="standings-row"
                  data-subject={r.subject}
                  data-void={nContributing === 0 ? "true" : undefined}
                >
                  <td className="py-2 pr-2 tabular-nums text-default-400" data-testid="standings-rank">{r.rank}</td>
                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={open ? drillId : undefined}
                      onClick={() => onToggleExpand(r.subject)}
                      className="font-medium hover:text-primary"
                      data-testid="standings-expand"
                    >
                      {open ? "▾ " : "▸ "}{r.subject}
                    </button>
                  </td>
                  <td className="py-2 pr-2"><ScoreCell value={r.initial} testid="cell-initial" /></td>
                  <td className="py-2 pr-2"><ScoreCell value={r.post} testid="standings-score" /></td>
                  <td className="py-2 pr-2"><ScoreCell value={r.delta} testid="cell-delta" /></td>
                  {framingCols.map((c) => (
                    <td key={c.key} className="py-2 pr-2">
                      <ScoreCell value={r.byFraming[c.key] ?? null} testid={`cell-${c.key}`} />
                    </td>
                  ))}
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2">
                      <HeatStrip strip={r.strip} subject={r.subject} />
                      <span className="tabular-nums text-default-400" data-testid="standings-kn">{nContributing}/{total}</span>
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr id={drillId} data-testid="drilldown" data-subject={r.subject}>
                    <td colSpan={totalCols} className="pb-3">
                      <div className="rounded-md border border-default-200 bg-default-50/50 p-2">
                        <div className="mb-1 text-xs text-default-500">
                          Per-tradition ({manifest.ranking
                            ? `${sel.judge} — component${isSample ? " (sample)" : ""}`
                            : (drillJudgeIsRanking
                                ? sel.judge
                                : `${sel.judge} — validation${isSample ? " sample" : ""}`)})
                          {drill.length === 0 && " — no data for this judge/selection"}
                        </div>
                        {drill.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="text-xs" data-testid="drill-table">
                              <thead>
                                <tr className="text-left text-default-500">
                                  <th scope="col" className="pr-3 font-medium">Tradition</th>
                                  <th scope="col" className="pr-2 font-medium">Init</th>
                                  <th scope="col" className="pr-2 font-medium">Post</th>
                                  <th scope="col" className="pr-2 font-medium">Δ</th>
                                  {framingCols.map((c) => <th key={c.key} scope="col" className="pr-2 font-medium">{c.label}</th>)}
                                  <th scope="col" className="pr-2 font-medium">Coverage</th>
                                </tr>
                              </thead>
                              <tbody>
                                {drill.map((d) => (
                                  <tr key={d.tradition} data-testid="drill-row" data-tradition={d.tradition}>
                                    {/* Drill-down toward the raw browser (#51): the leaderboard has
                                        only per-tradition granularity, so — matching #55's drill-row
                                        level — the tradition links to /t/<tradition>, from which a
                                        scenario's embedded responses section shows its raw transcripts + verdicts. */}
                                    <td className="pr-3 text-default-600">
                                      <Link to="/t/$traditionId" params={{ traditionId: d.tradition }}
                                            className="text-primary hover:underline" data-testid="drill-link">
                                        {d.tradition}
                                      </Link>
                                    </td>
                                    <td className="pr-2"><ScoreCell value={d.initial} testid="drill-initial" /></td>
                                    <td className="pr-2"><ScoreCell value={d.post} testid="drill-post" /></td>
                                    <td className="pr-2"><ScoreCell value={d.delta} testid="drill-delta" /></td>
                                    {framingCols.map((c) => (
                                      <td key={c.key} className="pr-2">
                                        <ScoreCell value={d.byFraming[c.key] ?? null} testid={`drill-${c.key}`} />
                                      </td>
                                    ))}
                                    <td className="pr-2 tabular-nums text-default-400" data-testid="drill-coverage">
                                      {d.nJudged ?? "—"}/{d.nExpected}
                                      {isSample && d.nJudged !== null && d.nJudged < d.nExpected && (
                                        <span className="ml-1 rounded bg-warning-100 px-1 text-warning-800" data-testid="sample-badge">
                                          sample
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-default-400">
        Headline columns cover the {FRAMING_LABEL[firstFraming] ?? firstFraming} framing (the paper's
        published slice); Post-pressure equals the {FRAMING_LABEL[firstFraming] ?? firstFraming} column by
        definition. The framing columns give each framing's post-pressure score. Δ is the matched-cell
        steadfastness. Rank is canonical (Post desc); sorting a column never re-numbers it.
      </p>
    </div>
  );
}
