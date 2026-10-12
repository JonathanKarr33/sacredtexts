// Run recency — a single, filesystem-mtime-independent ordering key shared by every consumer
// that decides which run is "most recent" (the server index `listRuns`, the client index
// `fetchRunIndex`, and the standings rollup `aggregate`), so they can never disagree.
//
// Why not mtime alone (Issue #7): a fresh `git clone` collapses every committed run's
// directory mtime to the checkout time. With mtime equal across runs, the id-ascending
// tiebreak crowns the chronologically OLDEST date-stamped id as "most recent" — silently
// corrupting the standings rollup (each model's "latest" result) once a second run exists.
//
// So recency resolves from the first signal that is actually available, most trustworthy
// first:
//   1. `generated_at` — the ISO-8601 UTC timestamp `score.py` writes into summary.json;
//   2. a YYYY-MM-DD date embedded in the run id (e.g. `tutorial-2026-10-11`), as UTC midnight;
//   3. the run directory's mtime (`mtimeMs`) — the legacy signal, now only a last resort.
// All three are epoch-milliseconds, so they order correctly against one another.

export interface RecencyInputs {
  /** `summary.generated_at` — an ISO-8601 timestamp, or null/absent on pre-Issue-#7 runs. */
  generatedAt?: string | null;
  /** The run id (its directory name), mined for an embedded YYYY-MM-DD date. */
  runId: string;
  /** The run directory's mtime in ms, the last-resort fallback. */
  mtimeMs?: number;
}

/**
 * A run's recency as epoch-milliseconds, using the precedence documented in this module's
 * header (generated_at → run-id date → mtime). Returns 0 when none of the three signals is
 * available, so an entirely unknown-date run sorts oldest rather than crashing a comparator.
 */
export function runRecencyMs({ generatedAt, runId, mtimeMs }: RecencyInputs): number {
  const fromGenerated = parseIso(generatedAt);
  if (fromGenerated !== null) return fromGenerated;
  const fromId = parseRunIdDate(runId);
  if (fromId !== null) return fromId;
  return typeof mtimeMs === "number" && Number.isFinite(mtimeMs) ? mtimeMs : 0;
}

function parseIso(s: string | null | undefined): number | null {
  if (typeof s !== "string") return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** The first YYYY-MM-DD in the run id as UTC midnight, or null. Validated by round-tripping
 * through Date (Date.UTC silently rolls invalid components over, e.g. month 13 → next year),
 * so a non-date like `2026-13-40` is rejected rather than mis-parsed. */
function parseRunIdDate(runId: string): number | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(runId);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return t;
}

/** A recency epoch-ms rendered as a stable ISO calendar day (UTC, timezone-independent).
 * Callers guard the unknown-date (0) case themselves. */
export function recencyDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
