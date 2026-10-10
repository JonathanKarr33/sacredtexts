// URL state for the #51 raw view (Phase 7). The FULL view state lives in the URL so every view
// — grid cell, A/B compare, a preset — is a shareable deep link and bug reports reproduce.
// Route path params carry run/group/item; this flat search record carries the rest.
//
// GENERIC over condition axes (#54): the selection's `conditions` is a per-axis map keyed by the
// catalog's `conditionAxes` keys (MultiBench: framing+pressure; AFB: condition) — nothing is
// hardcoded. Each axis is one flat search param (key = the axis key).

import { z } from "zod";
import type { RawCatalog } from "./rawModel";

/** Route-boundary schema (fail-soft, mirrors resultsSelection): a flat string record or {}. */
export const rawSearchSchema = z
  .record(z.string(), z.union([z.string(), z.array(z.string())]))
  .catch({});

export type RawSearchRecord = z.infer<typeof rawSearchSchema>;

export interface RawSelection {
  a: string;                          // subject A (the primary cell's subject)
  b: string | null;                   // subject B (A/B compare), or null
  conditions: Record<string, string>; // per-condition-axis value (keyed by axis key)
  scope: string;                      // verdict scope (turn1/full)
  judge: string;                      // which judge's score colors the grid
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Reserved search keys that are NOT condition axes. */
const RESERVED = new Set(["a", "b", "scope", "judge"]);

/**
 * Interpret a raw search record against the catalog. Unknown/out-of-vocab deep-link values fall
 * back to catalog defaults (honest: a stale link degrades to a valid view, not a broken one).
 * Defaults: first subject; each axis's first value; first scope; the full-grid judge if any
 * (else the first). `b` is kept only if it's a known, distinct subject.
 */
export function parseRawSelection(search: RawSearchRecord, catalog: RawCatalog): RawSelection {
  const subjects = new Set(catalog.subjects.map((s) => s.id));
  const scopes = new Set(catalog.scopes.map((s) => s.id));
  const judges = catalog.judges;

  const rawA = one(search.a);
  const a = rawA && subjects.has(rawA) ? rawA : catalog.subjects[0]?.id ?? "";
  const rawB = one(search.b);
  const b = rawB && rawB !== a && subjects.has(rawB) ? rawB : null;

  const conditions: Record<string, string> = {};
  for (const axis of catalog.conditionAxes) {
    const raw = one(search[axis.key]);
    const known = new Set(axis.values.map((v) => v.id));
    conditions[axis.key] = raw && known.has(raw) ? raw : axis.values[0]?.id ?? "";
  }

  const rawScope = one(search.scope);
  const scope = rawScope && scopes.has(rawScope) ? rawScope : catalog.scopes[0]?.id ?? "";

  const rawJudge = one(search.judge);
  // Default to the ranking judge (Gemini); fall back to a full-grid judge (pre-#110) then the first.
  const defaultJudge =
    (judges.find((j) => j.rankable) ?? judges.find((j) => j.fullGrid) ?? judges[0])?.key ?? "";
  const judge = rawJudge && judges.some((j) => j.key === rawJudge) ? rawJudge : defaultJudge;

  return { a, b, conditions, scope, judge };
}

/** A selection → a flat search record (each condition axis as its own param; omit a null b). */
export function rawSelectionToSearch(sel: RawSelection): RawSearchRecord {
  const out: RawSearchRecord = { a: sel.a, scope: sel.scope, judge: sel.judge };
  if (sel.b) out.b = sel.b;
  for (const [k, v] of Object.entries(sel.conditions)) {
    if (!RESERVED.has(k)) out[k] = v;
  }
  return out;
}
