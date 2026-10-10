// Read-model types for the MultiBench tradition format.
//
// Posture: DISPLAY-FIRST. These are deliberately tolerant — fields are nullable and parsing
// never throws on imperfect content; problems are surfaced as `Notice`s attached to the
// smallest enclosing unit (tradition / scenario / section). Contrast the validator, which is
// strict/fail-fast.

import type { Pressure } from "./constants";

export type Severity = "error" | "warning";

/** A display-first problem surfaced in the UI as a visible notice (never a console-only log). */
export interface Notice {
  severity: Severity;
  /** "tradition" | "scenario" | "section" | "github" | "routing" — the enclosing unit. */
  scope: string;
  /** A human-locating hint, e.g. "sunni-islam/scenarios/JLS-001/pressures.md". */
  where: string;
  message: string;
  /**
   * `"source"` marks an OPERATIONAL note about which data copy is serving (baked vs GitHub
   * fallback) — plumbing detail for maintainers, not a user-facing data problem. The UI demotes
   * these to an unobtrusive footer instead of a prominent top banner. Absent = a normal notice.
   */
  kind?: "source";
}

export interface CanonicalSource {
  title: string | null;
  author: string | null;
  locusUnit: string | null;
}

export interface Maintainer {
  name: string;
  contact: string | null;
}

export interface ScholarReview {
  status: string | null;
  reviewers: string[];
}

/** A declared taxonomy axis (the values controlled vocabulary). Names are the tradition's own. */
export interface TaxonomyAxis {
  description: string | null;
  /** "scenario" | "response" (informational provenance). */
  appliesTo: string | null;
  values: string[];
}

export interface Manifest {
  id: string;
  displayName: string;
  construct: string;
  canonicalSource: CanonicalSource;
  adherentNoun: string;
  maintainers: Maintainer[];
  scholarReview: ScholarReview;
  /** Axis name -> axis. Order preserved from the source. NEVER hardcoded. */
  taxonomies: Record<string, TaxonomyAxis>;
  scenarioIdPattern: string | null;
  schemaVersion: number | null;
}

/** Per-scenario metadata (scenario.yaml). */
export interface ScenarioMeta {
  id: string;
  /** Axis name -> selected values. */
  tags: Record<string, string[]>;
  sourceLocus: number | null;
  locusLabel: string | null;
  identitySignal: string | null;
}

/** Canonical pressure -> its push text (null = absent/empty, with a notice). */
export type PressureMap = Record<Pressure, string | null>;

/**
 * Results-ready seam (anticipating the judging workflow #8). UNPOPULATED in v1 — the
 * concrete shape binds to #8's output later. Its mere presence reserves the slot so the
 * results layer slots in additively without a rewrite.
 */
export interface ScenarioResults {
  // intentionally empty in v1
  readonly __placeholder?: never;
}

/** A fully (or partially) loaded scenario. */
export interface Scenario {
  id: string;
  meta: ScenarioMeta | null;
  turn1: string | null;
  judgeGuidance: string | null;
  pressures: PressureMap;
  notices: Notice[];
  /** Always absent in v1 (the inert results-ready seam). */
  results?: ScenarioResults;
}

export interface TraditionProse {
  readme: string | null;
  source: string | null;
  guide: string | null;
}

/** A tradition's manifest + prose + scenario list, with aggregated notices. */
export interface Tradition {
  id: string;
  manifest: Manifest | null;
  prose: TraditionProse;
  /** Ordered scenario ids (post-drift-resolution). Full `Scenario` objects load lazily. */
  scenarioIds: string[];
  notices: Notice[];
}

export function notice(severity: Severity, scope: string, where: string, message: string): Notice {
  return { severity, scope, where, message };
}

/** An empty pressure map (all six canonical keys → null). */
export function emptyPressureMap(pressures: readonly Pressure[]): PressureMap {
  return Object.fromEntries(pressures.map((p) => [p, null])) as PressureMap;
}

/** Axis name -> declared values, for validating scenario tags against the manifest vocabulary. */
export function taxonomyValues(taxonomies: Record<string, TaxonomyAxis>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(taxonomies).map(([k, v]) => [k, v.values]));
}
