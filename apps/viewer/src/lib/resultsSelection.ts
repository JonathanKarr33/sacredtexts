// The results-explorer selection model + its URL (de)serialization. Mirrors filtering.ts's
// role for the corpus browser: the AUTHORITATIVE selection semantics live here (pure, tested),
// the page is a thin driver, and every selector is deep-linkable via the flat search record.
//
// Leaderboard v2 (Spec 55): framing and metric are no longer *selectors* — they became table
// columns (the dense jaleesbrowser-style board). The selection now carries: the run, the drill-down
// judge, the pressure (which reframes the whole table), a column SORT, and the set of EXPANDED
// subjects. `framing`/`metric` are gone; stale `?framing=`/`?metric=` params are simply ignored.

import { z } from "zod";
import type { SearchRecord } from "./filtering";
import type { ResultsManifest } from "./resultsModel";
import { isSortableColumn, type SortDir } from "./leaderboard";

// `Metric` and `SortDir` live in one place each (resultsModel / leaderboard) and are re-exported here
// so consumers of the selection model keep a single import site. Sortable-key validation defers to
// `isSortableColumn` — the single source of truth for the column vocabulary (no duplicated key list).
export type { Metric } from "./resultsModel";
export type { SortDir } from "./leaderboard";

export interface SortSpec {
  /** a headline key ("initial" | "post" | "delta") or a framing id. */
  key: string;
  dir: SortDir;
}

export interface ResultsSelection {
  /** null = "the default (most recent) run"; a string pins a specific run id. */
  runId: string | null;
  /** UI judge key (e.g. "gemini" | "opus"). Ranking is always the full-grid judge; the judge
   *  selector switches only the inspection/drill-down layer. */
  judge: string;
  /** a pressure id, or the manifest's `pressure_all` sentinel ("all"). Reframes the whole table. */
  pressure: string;
  /** active column sort, or null for the canonical (rank) order. */
  sort: SortSpec | null;
  /** subject ids whose per-tradition drill-down is expanded (deep-linkable). */
  expanded: string[];
}

export const DEFAULTS = {
  judge: "gemini",
  pressure: "all",
  sort: null as SortSpec | null,
  expanded: [] as string[],
};

/** Route-boundary schema (fail-soft, like filtering.ts's): a flat string record or {}. */
export const resultsSearchSchema = z
  .record(z.string(), z.union([z.string(), z.array(z.string())]))
  .catch({});

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Interpret a `sort=<key>.<dir>` param. Direction defaults to `desc` (any non-"asc" → desc). When a
 * `manifest` is supplied, the key must be a headline key or a declared framing id, else the sort is
 * dropped (invalid deep link degrades to the canonical order). Without a manifest, framing ids can't
 * be validated, so the key is accepted optimistically (the page always re-parses WITH the manifest).
 */
function parseSort(raw: string | undefined, manifest?: ResultsManifest | null): SortSpec | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  const key = dot >= 0 ? raw.slice(0, dot) : raw;
  const dirRaw = dot >= 0 ? raw.slice(dot + 1) : "";
  if (!key) return null;
  const dir: SortDir = dirRaw === "asc" ? "asc" : "desc";
  // With a manifest, the key must be a real column (headline key or declared framing id). Without
  // one, framing ids can't be validated, so accept optimistically (the page re-parses WITH manifest).
  if (manifest && !isSortableColumn(manifest, key)) return null;
  return { key, dir };
}

function parseExpanded(raw: string | undefined, manifest?: ResultsManifest | null): string[] {
  if (!raw) return [];
  // When a manifest is available, drop ids that aren't real subjects — an unknown `?expanded=bogus`
  // is ignored (and thus removed from later URL updates), not carried around forever.
  const known = manifest?.subjects ? new Set(manifest.subjects) : null;
  const seen = new Set<string>();
  for (const id of raw.split(",")) {
    const t = id.trim();
    if (t && (!known || known.has(t))) seen.add(t);
  }
  return [...seen];
}

/**
 * Interpret a raw search record into a validated selection. When a `manifest` is supplied, unknown
 * judge/pressure values and invalid sort keys fall back to defaults (an out-of-vocab deep link
 * degrades to the default view). Stale `framing`/`metric` params (removed in v2) are ignored.
 */
export function parseResultsSelection(search: SearchRecord, manifest?: ResultsManifest | null): ResultsSelection {
  const judgeKeys = manifest ? new Set(manifest.judges.map((j) => j.key)) : null;
  const pressures = manifest ? new Set([...manifest.pressures, manifest.pressureAll]) : null;

  const rawJudge = one(search.judge);
  const rawPressure = one(search.pressure);
  const rawRun = one(search.run);

  const judge = rawJudge && (!judgeKeys || judgeKeys.has(rawJudge)) ? rawJudge : DEFAULTS.judge;
  const pressure = rawPressure && (!pressures || pressures.has(rawPressure)) ? rawPressure : DEFAULTS.pressure;

  return {
    runId: rawRun && rawRun !== "" ? rawRun : null,
    judge,
    pressure,
    sort: parseSort(one(search.sort), manifest),
    expanded: parseExpanded(one(search.expanded), manifest),
  };
}

/** Serialize a selection back to a flat search record, omitting defaults (clean base URL). */
export function selectionToResultsSearch(sel: ResultsSelection): SearchRecord {
  const out: SearchRecord = {};
  if (sel.runId) out.run = sel.runId;
  if (sel.judge !== DEFAULTS.judge) out.judge = sel.judge;
  if (sel.pressure !== DEFAULTS.pressure) out.pressure = sel.pressure;
  if (sel.sort) out.sort = `${sel.sort.key}.${sel.sort.dir}`;
  if (sel.expanded.length > 0) out.expanded = sel.expanded.join(",");
  return out;
}
