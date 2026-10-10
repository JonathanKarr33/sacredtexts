// Pure leaderboard computation (authoritative, tested). The SPA's ONLY cross-tradition statistic
// is the equal-weight mean of the per-tradition means — which reconciles with the paper's
// tab_standings by construction (the per-tradition means come from the canonical Python export).

import { COMBINED_SCORE_KEY, type Metric, type ResultsManifest, type ResultsShard } from "./resultsModel";

export { COMBINED_SCORE_KEY };

/**
 * The aggregation slice the cross-tradition statistics are computed over. Deliberately standalone
 * (not a `Pick<ResultsSelection, …>`): the leaderboard's URL/selection model drops `framing`/`metric`
 * as *selectors* (they become table columns), but the aggregation still needs all three axes — so
 * the pure lib depends on this local shape, never on the page's selection type.
 */
export interface Slice {
  framing: string;
  metric: Metric;
  pressure: string;
}

export interface TraditionValue {
  tradition: string;
  value: number;
  /** coverage numerator/denominator for this slice (honest-degradation badging). */
  nJudged: number;
  nExpected: number;
}

export interface Standing {
  subject: string;
  /** mean of per-tradition means, or null if no tradition had coverage for the selection. */
  value: number | null;
  /** the per-tradition contributions (for the drill-down + `k/N` annotation). */
  contributions: TraditionValue[];
  /** how many of the run's traditions contributed a value. */
  nContributing: number;
}

/** The key the leaderboard ranks on. Since #120 that is the manifest's `ranking.score_key` (the
 *  combined two-judge mean). For a LEGACY manifest with no `ranking`, fall back to the static
 *  `rankable` judge (#110), then the first full-grid judge, then Gemini. */
export function rankingJudgeModel(manifest: ResultsManifest): string {
  return (
    manifest.ranking?.scoreKey ??
    manifest.judges.find((j) => j.rankable)?.model ??
    manifest.judges.find((j) => j.fullGrid)?.model ??
    "gemini-3.6-flash"
  );
}

/** Whether a judge is THE ranking judge — its static `rankable` role (#110), falling back to the
 *  earned `fullGrid` for pre-#110 metadata that predates `rankable`. Works for a score-manifest
 *  `JudgeMeta` or a raw-catalog `RawJudge` (both carry `rankable?` + `fullGrid`). Distinct from
 *  coverage: a full-grid *validation* judge (Opus, post-#110) is full-grid but NOT ranking. */
export function isRankingJudge(judge: { rankable?: boolean; fullGrid: boolean }): boolean {
  return judge.rankable ?? judge.fullGrid;
}

/** Partition judges into the three disjoint display roles used by the review viewer:
 *  - `ranking`: the ranking judge (strictly complete → "scores every transcript");
 *  - `fullGridValidation`: full-grid but NOT ranking — full-grid *scale* with a tolerant badge,
 *    so it may have residual gaps and must NOT be described as "every transcript" (Opus, post-#110);
 *  - `sample`: not full-grid (a designed sub-sample).
 *  Ranking ⊆ full-grid, so it is excluded from `fullGridValidation`. */
export function classifyJudgeRoles<T extends { fullGrid: boolean; rankable?: boolean }>(
  judges: T[],
): { ranking: T[]; fullGridValidation: T[]; sample: T[] } {
  return {
    ranking: judges.filter(isRankingJudge),
    fullGridValidation: judges.filter((j) => j.fullGrid && !isRankingJudge(j)),
    sample: judges.filter((j) => !j.fullGrid),
  };
}

/** Resolve a UI judge key (e.g. "opus") to its model id via the manifest. */
export function judgeModelForKey(manifest: ResultsManifest, key: string): string | null {
  return manifest.judges.find((j) => j.key === key)?.model ?? null;
}

/**
 * One tradition's value for a (judge, subject, framing, metric, pressure) slice, or null.
 * `expectedCells` is the full-grid denominator for this slice (n_scenarios × pressures, or ×1 for
 * a single pressure) — used as the steadfastness coverage denominator, since a steadfastness cell
 * only carries its matched-cell count, not the expected total.
 */
export function traditionValue(
  shard: ResultsShard, judgeModel: string, subject: string, framing: string,
  metric: Metric, pressure: string, expectedCells: number,
): TraditionValue | null {
  // #120: the combined block is a separate top-level field (no judge axis). When the caller ranks
  // on the combined key, read it instead of `means[judge]` — so the board's aggregation path is
  // otherwise unchanged and the per-judge drill-down still resolves each real judge below.
  if (judgeModel === COMBINED_SCORE_KEY) {
    if (metric === "steadfastness") {
      const cell = shard.combinedSteadfastness?.[subject]?.[framing]?.[pressure];
      if (!cell) return null;
      return { tradition: shard.tradition, value: cell[0], nJudged: cell[1], nExpected: expectedCells };
    }
    const cell = shard.combined?.[subject]?.[framing]?.[metric]?.[pressure];
    if (!cell) return null;
    return { tradition: shard.tradition, value: cell[0], nJudged: cell[1], nExpected: cell[2] };
  }
  if (metric === "steadfastness") {
    const cell = shard.steadfastness?.[judgeModel]?.[subject]?.[framing]?.[pressure];
    if (!cell) return null;
    return { tradition: shard.tradition, value: cell[0], nJudged: cell[1], nExpected: expectedCells };
  }
  const cell = shard.means?.[judgeModel]?.[subject]?.[framing]?.[metric]?.[pressure];
  if (!cell) return null;
  return { tradition: shard.tradition, value: cell[0], nJudged: cell[1], nExpected: cell[2] };
}

/**
 * Standings for the given selection, ranked by the equal-weight mean of per-tradition means,
 * descending. `judgeModel` defaults to `rankingJudgeModel` — since #120 the combined two-judge
 * block (the manifest `ranking.score_key`), or the `rankable`/Gemini judge on a legacy run; the
 * judge selector only re-points the per-tradition drill-down, never the board.
 */
export function computeStandings(
  shards: Record<string, ResultsShard>,
  manifest: ResultsManifest,
  sel: Slice,
  judgeModel: string = rankingJudgeModel(manifest),
): Standing[] {
  const perScenario = sel.pressure === manifest.pressureAll ? manifest.pressures.length : 1;
  // n_scenarios comes from the MANIFEST (the authoritative full grid), so the steadfastness coverage
  // denominator matches the drill-down path (`subjectDrilldownRows`) exactly.
  const nScenariosOf = new Map(manifest.traditions.map((t) => [t.id, t.nScenarios]));
  const standings = manifest.subjects.map((subject) => {
    const contributions: TraditionValue[] = [];
    for (const shard of Object.values(shards)) {
      const expectedCells = (nScenariosOf.get(shard.tradition) ?? shard.nScenarios) * perScenario;
      const tv = traditionValue(shard, judgeModel, subject, sel.framing, sel.metric, sel.pressure, expectedCells);
      if (tv !== null) contributions.push(tv);
    }
    const value = contributions.length
      ? contributions.reduce((a, c) => a + c.value, 0) / contributions.length
      : null;
    return { subject, value, contributions, nContributing: contributions.length };
  });
  // Rank by value desc; nulls (no coverage) sort last, deterministically (no NaN from null−null).
  standings.sort((a, b) => {
    if (a.value === null && b.value === null) return a.subject.localeCompare(b.subject);
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return b.value - a.value;
  });
  return standings;
}

// ============================================================================================
// Dense-table rows (leaderboard v2) — the jaleesbrowser-style whole-picture-at-a-glance model.
//
// A row carries, for one subject at a fixed pressure and the RANKING key (#120: the combined
// two-judge block via `ranking.score_key`; the `rankable`/Gemini judge on a legacy run):
//   - Initial / Post / Δ headline columns, on the FIRST framing only (the paper's published slice);
//   - one Post (`full`) column per framing (the framing staircase);
//   - a per-tradition heat strip (1:1 with manifest.traditions);
//   - a canonical rank (by first-framing `full`, descending) that persists under any display sort.
// Every numeric column is a reuse of `computeStandings` — the SPA never re-implements the
// aggregation convention, so the board reconciles with the paper by construction.
// ============================================================================================

/** One per-tradition heat-strip cell — aligned 1:1 with `manifest.traditions` (manifest order). */
export interface StripCell {
  tradition: string;
  /** the subject's Post value for this tradition, or null when that tradition had no coverage. */
  value: number | null;
  /** first-framing `turn1` (First-response) for this tradition — for the hover/focus tooltip. */
  initial: number | null;
  /** first-framing matched-cell steadfastness (Δ) for this tradition — for the tooltip. */
  delta: number | null;
  nJudged: number;
  nExpected: number;
  /** the tradition's scenario count (judge- and pressure-independent) — the reader-facing "n". */
  nScenarios: number;
}

/** One dense leaderboard row (one subject), all columns at a fixed pressure, ranking judge. */
export interface LeaderboardRow {
  subject: string;
  /** first-framing `turn1` mean-of-per-tradition-means. */
  initial: number | null;
  /** first-framing `full` mean-of-per-tradition-means — the headline score (reconciles with paper). */
  post: number | null;
  /** first-framing matched-cell `steadfastness` (NOT post − initial; read from the shard). */
  delta: number | null;
  /** `full` mean at each framing — EVERY manifest framing id present (value null if absent). */
  byFraming: Record<string, number | null>;
  /** the per-tradition Post contributions, 1:1 with manifest.traditions (null where uncovered). */
  strip: StripCell[];
  /** canonical position (1-based) by first-framing `full` desc; stable under display sort. */
  rank: number;
}

const perScenarioFactor = (manifest: ResultsManifest, pressure: string): number =>
  pressure === manifest.pressureAll ? manifest.pressures.length : 1;

/** subject → that column's value, from a `computeStandings` result (indexed for a by-id join). */
function valueBySubject(standings: Standing[]): Map<string, number | null> {
  return new Map(standings.map((s) => [s.subject, s.value]));
}

/**
 * One dense row per subject for the given pressure, ranked by the canonical (first-framing `full`)
 * ordering. The board is ALWAYS `rankingJudgeModel` (the combined two-judge block, or Gemini on a
 * legacy run) — this function takes no judge, so "the judge selector never re-ranks/recolors the
 * board" is true by construction, not by test. Rows are returned in canonical rank order; the
 * display layer re-sorts with `sortRows` while the `rank` field persists.
 *
 * Cross-column assembly joins by subject id, never by array index: each `computeStandings` call
 * returns a `Standing[]` sorted by ITS OWN column's value, so a positional zip would silently
 * misattribute Initial/Δ/framing columns to the wrong subjects (and still pass a Post-only test).
 */
export function computeLeaderboardRows(
  shards: Record<string, ResultsShard>,
  manifest: ResultsManifest,
  opts: { pressure: string },
): LeaderboardRow[] {
  const { pressure } = opts;
  const judge = rankingJudgeModel(manifest);
  const framings = manifest.framings;
  const firstFraming = framings[0];
  if (firstFraming === undefined) return [];

  // Each per-column result, indexed by subject (the by-id join source). We keep the full `Standing[]`
  // for the three headline slices so the strip tooltip can reuse their per-tradition `contributions`
  // (the SAME aggregation as the drill-down — no second path).
  const initialStandings = computeStandings(shards, manifest, { framing: firstFraming, metric: "turn1", pressure }, judge);
  const deltaStandings = computeStandings(shards, manifest, { framing: firstFraming, metric: "steadfastness", pressure }, judge);
  // Post standings carry the per-tradition contributions we need for the heat strip.
  const postStandings = computeStandings(
    shards, manifest, { framing: firstFraming, metric: "full", pressure }, judge,
  );
  const initialBy = valueBySubject(initialStandings);
  const deltaBy = valueBySubject(deltaStandings);
  const postBy = valueBySubject(postStandings);
  const contributionsBy = new Map(postStandings.map((s) => [s.subject, s.contributions]));
  // subject → (tradition → value) for the two extra tooltip metrics.
  const perTradition = (standings: Standing[]) =>
    new Map(standings.map((s) => [s.subject, new Map(s.contributions.map((c) => [c.tradition, c.value]))]));
  const initialByTradition = perTradition(initialStandings);
  const deltaByTradition = perTradition(deltaStandings);
  const byFramingMaps: Record<string, Map<string, number | null>> = {};
  for (const f of framings) {
    byFramingMaps[f] = valueBySubject(
      computeStandings(shards, manifest, { framing: f, metric: "full", pressure }, judge),
    );
  }

  // Canonical rank: first-framing `full` (== Post) desc, nulls last, ties by subject id.
  const rankOrder = [...manifest.subjects].sort((x, y) => {
    const px = postBy.get(x) ?? null;
    const py = postBy.get(y) ?? null;
    if (px === null && py === null) return x.localeCompare(y);
    if (px === null) return 1;
    if (py === null) return -1;
    if (px !== py) return py - px;
    return x.localeCompare(y);
  });
  const rankOf = new Map(rankOrder.map((s, i) => [s, i + 1]));

  const rows = manifest.subjects.map((subject): LeaderboardRow => {
    const byFraming: Record<string, number | null> = {};
    for (const f of framings) byFraming[f] = byFramingMaps[f]!.get(subject) ?? null;

    // Heat strip: left-join the sparse Post contributions against the manifest tradition order, so
    // uncovered traditions become a distinct null cell (with a manifest-derived denominator).
    // The join key is the tradition id: `computeStandings` keys each contribution by `shard.tradition`
    // and the shard loader keys shards by `manifest.traditions[].id`; the exporter writes them equal
    // (and `shardConsistencyNotices` flags any divergence at load), so every covered contribution
    // lands in a manifest cell and `mean(non-null strip) == post` holds.
    const contribBy = new Map((contributionsBy.get(subject) ?? []).map((c) => [c.tradition, c]));
    const initById = initialByTradition.get(subject);
    const deltaById = deltaByTradition.get(subject);
    const strip: StripCell[] = manifest.traditions.map((t) => {
      const c = contribBy.get(t.id);
      const initial = initById?.get(t.id) ?? null;
      const delta = deltaById?.get(t.id) ?? null;
      if (c) return { tradition: t.id, value: c.value, initial, delta, nJudged: c.nJudged, nExpected: c.nExpected, nScenarios: t.nScenarios };
      return { tradition: t.id, value: null, initial, delta, nJudged: 0, nExpected: t.nScenarios * perScenarioFactor(manifest, pressure), nScenarios: t.nScenarios };
    });

    return {
      subject,
      initial: initialBy.get(subject) ?? null,
      post: postBy.get(subject) ?? null,
      delta: deltaBy.get(subject) ?? null,
      byFraming,
      strip,
      rank: rankOf.get(subject) ?? manifest.subjects.length,
    };
  });

  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}

export type SortDir = "asc" | "desc";
/** The fixed numeric headline columns; any other sort key is treated as a framing id. */
const HEADLINE_KEYS = new Set(["initial", "post", "delta"]);

/** Is `key` a sortable column for `manifest` (a headline key or a declared framing id)? */
export function isSortableColumn(manifest: ResultsManifest, key: string): boolean {
  return HEADLINE_KEYS.has(key) || manifest.framings.includes(key);
}

function rowSortValue(row: LeaderboardRow, key: string): number | null {
  if (key === "initial") return row.initial;
  if (key === "post") return row.post;
  if (key === "delta") return row.delta;
  return row.byFraming[key] ?? null;
}

/**
 * A display sort over the numeric columns (a headline key or a framing id). Nulls sort last in
 * BOTH directions; ties break by subject id. Pure — returns a new array and leaves each row's
 * `rank` field untouched (the canonical rank column never re-numbers on sort).
 */
export function sortRows(rows: LeaderboardRow[], key: string, dir: SortDir): LeaderboardRow[] {
  const sign = dir === "desc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = rowSortValue(a, key);
    const vb = rowSortValue(b, key);
    if (va === null && vb === null) return a.subject.localeCompare(b.subject);
    if (va === null) return 1; // nulls last regardless of direction
    if (vb === null) return -1;
    if (va !== vb) return (vb - va) * sign;
    return a.subject.localeCompare(b.subject);
  });
}

/** One tradition's dense values for the subject drill-down under a SPECIFIC judge. */
export interface DrilldownRow {
  tradition: string;
  initial: number | null;
  post: number | null;
  delta: number | null;
  byFraming: Record<string, number | null>;
  /** Post-slice numerator, or null when this tradition is included via a non-Post slice. */
  nJudged: number | null;
  /** manifest-derived full-grid denominator (always defined). */
  nExpected: number;
}

/**
 * The per-tradition drill-down for one subject under `judgeModel` (a real component judge — Gemini
 * or Opus — selected by the judge selector; the board itself ranks on the combined mean).
 * Mirrors the headline columns per tradition (Initial/Post/Δ + each framing's `full`). A tradition
 * is included iff ANY displayed slice is non-null — so the sampled Opus case (e.g. `full` present
 * but `steadfastness` absent, or one framing not another) still shows what data exists. The coverage
 * denominator `nExpected` is ALWAYS manifest-derived; the numerator `nJudged` comes from the Post
 * slice, or null when the tradition is present only via a non-Post slice.
 */
export function subjectDrilldownRows(
  shards: Record<string, ResultsShard>,
  manifest: ResultsManifest,
  subject: string,
  opts: { pressure: string; judgeModel: string },
): DrilldownRow[] {
  const { pressure, judgeModel } = opts;
  const framings = manifest.framings;
  const firstFraming = framings[0];
  if (firstFraming === undefined) return [];
  const perScenario = perScenarioFactor(manifest, pressure);

  const out: DrilldownRow[] = [];
  for (const t of manifest.traditions) {
    const shard = shards[t.id];
    if (!shard) continue;
    const nExpected = t.nScenarios * perScenario;
    const read = (framing: string, metric: Metric) =>
      traditionValue(shard, judgeModel, subject, framing, metric, pressure, nExpected);
    const postTv = read(firstFraming, "full");
    const initial = read(firstFraming, "turn1")?.value ?? null;
    const post = postTv?.value ?? null;
    const delta = read(firstFraming, "steadfastness")?.value ?? null;
    const byFraming: Record<string, number | null> = {};
    for (const f of framings) byFraming[f] = read(f, "full")?.value ?? null;

    const anyValue =
      initial !== null || post !== null || delta !== null || framings.some((f) => byFraming[f] !== null);
    if (!anyValue) continue;

    out.push({
      tradition: t.id,
      initial,
      post,
      delta,
      byFraming,
      nJudged: postTv?.nJudged ?? null,
      nExpected,
    });
  }
  return out;
}
