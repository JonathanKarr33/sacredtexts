// Raw-results dataset model + tolerant (display-first) parsers for the #51 raw browser.
//
// The SPA reads a committed/baked `results-raw/<run-id>/` dataset at runtime: a generic
// `manifest.json` (catalog) + one gzip shard per scenario (transcripts + judge verdicts). All
// content is untrusted remote JSON, so parsing is fail-soft: a malformed / unsupported-version /
// unsafe-path document yields `null` + a `Notice`, never a throw or a silently-wrong value.
//
// The contract is CATALOG-GENERIC (issue #54): score scale + color ramp, subjects, judges,
// condition axes, grouping axis, and items are all catalog-declared. NOTHING MultiBench-specific
// (`tradition`/`scenario`/`framing`/`pressure`, the −1…+1 ramp) is hardcoded here — a
// non-MultiBench catalog (AFB 0–4) parses through the identical schema.

import { z } from "zod";
import { notice, type Notice } from "./model";

/** The raw-tier schema version this build understands. A dataset stamped otherwise is untrusted. */
export const RAW_SUPPORTED_SCHEMA_VERSION = 1;

/**
 * A safe relative shard path (`<group>/<item>.json.gz`): every component a safe segment (no
 * separators-within, no `..`), leaf ends `.json.gz`. Mirrors the exporter's
 * `_require_safe_relpath` — the manifest is untrusted, so validate before splicing into a URL.
 */
export function isSafeRelPath(rel: string): boolean {
  if (!rel.endsWith(".json.gz")) return false;
  const parts = rel.split("/");
  if (parts.length < 2) return false;
  return parts.every((p) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p) && !p.includes(".."));
}

// ---- zod schemas (generic — no domain literals) ---------------------------------------------

const labeledId = z.object({ id: z.string(), label: z.string() });
const rec = <T extends z.ZodTypeAny>(v: T) => z.record(z.string(), v);

const CatalogSchema = z.object({
  schema_version: z.number(),
  dataset: z.object({
    title: z.string(),
    description: z.string().optional(),
    language: z.string().optional(),
    license: z.string(),
  }),
  scale: z.object({ min: z.number(), center: z.number(), max: z.number() }),
  ramp: z.array(z.string()).min(2),
  subjects: z.array(labeledId),
  judges: z.array(z.object({
    key: z.string(), label: z.string(), fullGrid: z.boolean(),
    rankable: z.boolean().optional(), coverage: z.number().optional(),  // #110; optional for older catalogs
  })),
  conditionAxes: z.array(z.object({ key: z.string(), label: z.string(), values: z.array(labeledId) })),
  groupBy: z.object({ key: z.string(), label: z.string() }),
  scopes: z.array(labeledId),
  items: z.array(z.object({ id: z.string(), label: z.string(), group: z.string(), shard: z.string() })),
  presets: z.array(z.object({
    key: z.string(),
    label: z.string(),
    description: z.string().optional(),
    entries: z.array(z.object({
      key: z.string(),
      label: z.string(),
      params: z.object({
        group: z.string(),
        item: z.string(),
        scope: z.string(),
        a: z.string(),
        b: z.string().optional(),
        conditions: rec(z.string()),
      }),
    })),
  })).default([]),
  fingerprint: z.string(),
  // Content fingerprint (over the shard byte stream: transcripts+contexts+verdicts). Optional so a
  // minimal external catalog still parses; when present on BOTH sources it drives baked-vs-GitHub
  // coherence (a transcript/context correction the judgment `fingerprint` misses). See rawSource.ts.
  content_fingerprint: z.string().optional(),
});

const TurnSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string() });
const VerdictSchema = z.object({
  judge: z.string(),
  scope: z.string(),
  score: z.number().finite(),   // bounds come from catalog.scale, NOT hardcoded (genericity)
  summary: z.string(),
  rationale: z.string().optional(),
});
const CellSchema = z.object({
  subject: z.string(),
  conditions: rec(z.string()),
  transcript: z.array(TurnSchema),
  contextKey: z.string().optional(),
  verdicts: z.array(VerdictSchema),
});
const ShardSchema = z.object({
  schema_version: z.number(),
  contexts: rec(z.string()).optional(),
  cells: z.array(CellSchema),
});

// ---- TS-facing types ------------------------------------------------------------------------

export type LabeledId = z.infer<typeof labeledId>;
export interface RawJudge { key: string; label: string; fullGrid: boolean; rankable?: boolean; coverage?: number }
export interface RawItem { id: string; label: string; group: string; shard: string }
export interface RawConditionAxis { key: string; label: string; values: LabeledId[] }
export interface RawPresetEntry {
  key: string;
  label: string;
  params: { group: string; item: string; scope: string; a: string; b?: string; conditions: Record<string, string> };
}
export interface RawPreset { key: string; label: string; description?: string; entries: RawPresetEntry[] }
export interface RawScale { min: number; center: number; max: number }

export interface RawCatalog {
  schemaVersion: number;
  dataset: { title: string; description?: string; language?: string; license: string };
  scale: RawScale;
  ramp: string[];
  subjects: LabeledId[];
  judges: RawJudge[];
  conditionAxes: RawConditionAxis[];
  groupBy: { key: string; label: string };
  scopes: LabeledId[];
  items: RawItem[];
  presets: RawPreset[];
  fingerprint: string;
  contentFingerprint?: string;
}

export interface RawTurn { role: "user" | "assistant"; content: string }
export interface RawVerdict { judge: string; scope: string; score: number; summary: string; rationale?: string }
export interface RawCell {
  subject: string;
  conditions: Record<string, string>;
  transcript: RawTurn[];
  contextKey?: string;
  verdicts: RawVerdict[];
}
export interface RawShard {
  schemaVersion: number;
  contexts: Record<string, string>;
  cells: RawCell[];
}

// ---- tolerant parsers -----------------------------------------------------------------------

function parseJson(text: string, where: string): { data: unknown; notice: Notice | null } {
  try {
    return { data: JSON.parse(text), notice: null };
  } catch (e) {
    return { data: null, notice: notice("error", "results-raw", where, `malformed JSON: ${(e as Error).message}`) };
  }
}

/** Parse a raw-tier catalog. Returns `{ catalog: null, notices }` on any problem. */
export function parseRawCatalog(text: string, where: string): { catalog: RawCatalog | null; notices: Notice[] } {
  const { data, notice: jsonNotice } = parseJson(text, where);
  if (jsonNotice) return { catalog: null, notices: [jsonNotice] };

  const parsed = CatalogSchema.safeParse(data);
  if (!parsed.success) {
    return { catalog: null, notices: [notice("error", "results-raw", where, `invalid catalog: ${parsed.error.issues[0]?.message ?? "shape"}`)] };
  }
  const c = parsed.data;
  if (c.schema_version !== RAW_SUPPORTED_SCHEMA_VERSION) {
    return {
      catalog: null,
      notices: [notice("error", "results-raw", where,
        `unsupported schema_version ${c.schema_version} (this build understands ${RAW_SUPPORTED_SCHEMA_VERSION})`)],
    };
  }
  const notices: Notice[] = [];
  // A condition-axis key that collides with a reserved URL param (the raw view encodes each axis
  // as its own search param) would be dropped from deep links — flag it loudly, not silently.
  const RESERVED_AXIS_KEYS = new Set(["a", "b", "scope", "judge"]);
  const colliding = c.conditionAxes.map((ax) => ax.key).filter((k) => RESERVED_AXIS_KEYS.has(k));
  if (colliding.length) {
    notices.push(notice("warning", "results-raw", where,
      `condition axis key(s) collide with reserved URL params (not deep-linkable): ${colliding.join(", ")}`));
  }
  // Manifest-declared shard paths are spliced into fetch URLs — flag any unsafe one (don't fail
  // the whole catalog; those items just won't be loadable and are dropped).
  const safeItems = c.items.filter((it) => {
    if (isSafeRelPath(it.shard)) return true;
    notices.push(notice("warning", "results-raw", where, `unsafe shard path "${it.shard}" for item "${it.id}" (dropped)`));
    return false;
  });
  return {
    catalog: {
      schemaVersion: c.schema_version,
      dataset: c.dataset,
      scale: c.scale,
      ramp: c.ramp,
      subjects: c.subjects,
      judges: c.judges,
      conditionAxes: c.conditionAxes,
      groupBy: c.groupBy,
      scopes: c.scopes,
      items: safeItems,
      presets: c.presets,
      fingerprint: c.fingerprint,
      contentFingerprint: c.content_fingerprint,
    },
    notices,
  };
}

/**
 * Cross-validate a shard against its catalog (display-first): verdict scores within the
 * catalog-declared `scale`; subjects/judges/scopes/condition-axis keys+values in the catalog's
 * declared vocabulary; every `contextKey` resolvable in the shard's `contexts` pool. Unknown/
 * out-of-range values become `Notice`s (the shard still renders — the UI only selects known
 * values). One notice per category (deduped), not per stray value.
 */
export function rawShardConsistencyNotices(shard: RawShard, catalog: RawCatalog, where: string): Notice[] {
  const notices: Notice[] = [];
  const subjects = new Set(catalog.subjects.map((s) => s.id));
  const judges = new Set(catalog.judges.map((j) => j.key));
  const scopes = new Set(catalog.scopes.map((s) => s.id));
  const axisValues = new Map(catalog.conditionAxes.map((a) => [a.key, new Set(a.values.map((v) => v.id))]));
  const { min, max } = catalog.scale;

  const unknown: Record<string, Set<string>> = {
    subject: new Set(), judge: new Set(), scope: new Set(),
    "condition axis": new Set(), "condition value": new Set(), contextKey: new Set(),
  };
  let outOfRange = 0;

  for (const cell of shard.cells) {
    if (!subjects.has(cell.subject)) unknown.subject!.add(cell.subject);
    for (const [axis, value] of Object.entries(cell.conditions)) {
      const vals = axisValues.get(axis);
      if (!vals) unknown["condition axis"]!.add(axis);
      else if (!vals.has(value)) unknown["condition value"]!.add(`${axis}=${value}`);
    }
    if (cell.contextKey !== undefined && !(cell.contextKey in shard.contexts)) {
      unknown.contextKey!.add(cell.contextKey);
    }
    for (const v of cell.verdicts) {
      if (!judges.has(v.judge)) unknown.judge!.add(v.judge);
      if (!scopes.has(v.scope)) unknown.scope!.add(v.scope);
      if (v.score < min || v.score > max) outOfRange++;
    }
  }
  for (const [category, vals] of Object.entries(unknown)) {
    if (vals.size > 0) {
      notices.push(notice("warning", "results-raw", where,
        `unknown ${category}(s) not in catalog: ${[...vals].sort().join(", ")}`));
    }
  }
  if (outOfRange > 0) {
    notices.push(notice("warning", "results-raw", where,
      `${outOfRange} verdict score(s) outside the catalog scale [${min}, ${max}]`));
  }
  return notices;
}

/** Parse one scenario shard. Returns `{ shard: null, notices }` on any problem. */
export function parseRawShard(text: string, where: string): { shard: RawShard | null; notices: Notice[] } {
  const { data, notice: jsonNotice } = parseJson(text, where);
  if (jsonNotice) return { shard: null, notices: [jsonNotice] };

  const parsed = ShardSchema.safeParse(data);
  if (!parsed.success) {
    return { shard: null, notices: [notice("error", "results-raw", where, `invalid shard: ${parsed.error.issues[0]?.message ?? "shape"}`)] };
  }
  const s = parsed.data;
  if (s.schema_version !== RAW_SUPPORTED_SCHEMA_VERSION) {
    return {
      shard: null,
      notices: [notice("error", "results-raw", where,
        `unsupported schema_version ${s.schema_version} (this build understands ${RAW_SUPPORTED_SCHEMA_VERSION})`)],
    };
  }
  return {
    shard: { schemaVersion: s.schema_version, contexts: s.contexts ?? {}, cells: s.cells },
    notices: [],
  };
}

// ---- pure cell lookup (shared by the raw view + the scenario-page section) -------------------

/** True when two condition maps are identical (same axes + values). */
export function sameConditions(a: Record<string, string>, b: Record<string, string>): boolean {
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
}

/** The cell for a subject at an exact condition tuple, or undefined. */
export function findCell(shard: RawShard, subject: string, conditions: Record<string, string>): RawCell | undefined {
  return shard.cells.find((c) => c.subject === subject && sameConditions(c.conditions, conditions));
}
