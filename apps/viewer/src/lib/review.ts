// Reviewer-intake state for the /review workflow (expert validation of tradition content).
//
// Persistence (Spec 92, Phase 3): drafts live in the review backend (apps/api), keyed per
// (authenticated reviewer, tradition). This module keeps the SAME public store API the review pages
// use — `useReviewState()` + `updateReviewState(fn)` + the tradition-scoped pure updaters — but backs
// it with the API instead of localStorage:
//   • updates apply OPTIMISTICALLY to an in-memory snapshot, then save asynchronously (debounced);
//   • each tradition carries a `version`; a save on a stale version is reconciled (last-write-wins
//     for the active device, then server-wins if it still conflicts) so work is not silently dropped;
//   • the tolerant zod loader is retained — a corrupt/older draft degrades field-by-field to defaults.
// Reviewer identity comes from the authenticated account (`/api/auth/me`), not an in-app form.

import { useSyncExternalStore } from "react";
import { z } from "zod";
import {
  deleteDraft,
  fetchCsrf,
  getDraft,
  listDrafts,
  login as apiLogin,
  logout as apiLogout,
  me as apiMe,
  putDraft,
  ReviewApiError,
  setReviewFetch,
  signup as apiSignup,
  type Reviewer,
} from "./reviewApi";

export { setReviewFetch };
export type { Reviewer };

/** How many scenarios a reviewer is asked to cover per tradition (the "review these 10"). */
export const REVIEW_SAMPLE_SIZE = 10;

export const CHECK_STATUSES = ["unreviewed", "approved", "flagged"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

/** One reviewable unit's intake: a verdict plus free-text notes and an optional suggested fix. */
export interface CheckReview {
  status: CheckStatus;
  notes: string;
  /** The reviewer's proposed replacement/correction text (flows into the report verbatim). */
  suggestion: string;
}

/** The four per-scenario checks, in the order the review page walks them. */
export const SCENARIO_CHECKS = ["scenario", "scoring", "judgement", "pressures"] as const;
export type ScenarioCheckKey = (typeof SCENARIO_CHECKS)[number];

export const SCENARIO_CHECK_LABELS: Record<ScenarioCheckKey, string> = {
  scenario: "The scenario",
  scoring: "The scoring guide",
  judgement: "The judges' verdicts",
  pressures: "The pressure points",
};

export type ScenarioChecks = Record<ScenarioCheckKey, CheckReview>;

/** One tradition's review: the two tradition-level checks + the assigned scenario sample. */
export interface TraditionReview {
  /** Seed used to draw the sample ("" = the default even spread across the corpus). */
  sampleSeed: string;
  /** The materialized assignment — persisted so it never shifts under the reviewer. */
  sampleIds: string[];
  /** Step 1 — the tradition's canonical source (source.md). */
  source: CheckReview;
  /** Step 2 — the companionship guide (guide.md, the Guided-framing system prompt). */
  guide: CheckReview;
  /**
   * Step 3 — per-scenario checks, keyed by scenario id. May hold ANY scenario id, not only
   * `sampleIds` (Spec 92 / Waleed): out-of-sample scenarios are reviewable too. `sampleIds` is the
   * *required* set (completion is measured against it); extras beyond it are surfaced separately.
   */
  scenarios: Record<string, ScenarioChecks>;
}

export interface ReviewerInfo {
  name: string;
  /** How maintainers can reach the reviewer (email / GitHub handle) — included in the report. */
  contact: string;
  /** Standing to review (e.g. "Sunni imam, 12 years", "PhD in Patristics"). */
  background: string;
}

export interface ReviewState {
  version: 1;
  reviewer: ReviewerInfo;
  traditions: Record<string, TraditionReview>;
}

export function emptyCheck(): CheckReview {
  return { status: "unreviewed", notes: "", suggestion: "" };
}

export function emptyScenarioChecks(): ScenarioChecks {
  return { scenario: emptyCheck(), scoring: emptyCheck(), judgement: emptyCheck(), pressures: emptyCheck() };
}

export function emptyTradition(): TraditionReview {
  return { sampleSeed: "", sampleIds: [], source: emptyCheck(), guide: emptyCheck(), scenarios: {} };
}

export function emptyState(): ReviewState {
  return { version: 1, reviewer: { name: "", contact: "", background: "" }, traditions: {} };
}

// ---- tolerant persistence schema -------------------------------------------------------------
// Every field falls back independently (`.catch`), so one corrupt subfield never discards the
// rest of a reviewer's work. Mirrors the display-first posture of the data layer.

const checkSchema = z
  .object({
    status: z.enum(CHECK_STATUSES).catch("unreviewed"),
    notes: z.string().catch(""),
    suggestion: z.string().catch(""),
  })
  .catch(emptyCheck());

const scenarioChecksSchema = z
  .object({
    scenario: checkSchema,
    scoring: checkSchema,
    judgement: checkSchema,
    pressures: checkSchema,
  })
  .catch(emptyScenarioChecks());

const traditionReviewSchema = z
  .object({
    sampleSeed: z.string().catch(""),
    sampleIds: z.array(z.string()).catch([]),
    source: checkSchema,
    guide: checkSchema,
    scenarios: z.record(z.string(), scenarioChecksSchema).catch({}),
  })
  .catch(emptyTradition());

const stateSchema = z
  .object({
    version: z.literal(1).catch(1),
    reviewer: z
      .object({
        name: z.string().catch(""),
        contact: z.string().catch(""),
        background: z.string().catch(""),
      })
      .catch({ name: "", contact: "", background: "" }),
    traditions: z.record(z.string(), traditionReviewSchema).catch({}),
  })
  .catch(emptyState());

/** Parse an untrusted whole-state payload (imported JSON backup) into a valid state. Never throws. */
export function parseReviewState(text: string | null): ReviewState {
  if (text === null) return emptyState();
  try {
    return stateSchema.parse(JSON.parse(text));
  } catch {
    return emptyState();
  }
}

/** Parse an untrusted single-tradition draft (from the API) tolerantly. Never throws. */
export function parseTraditionReview(value: unknown): TraditionReview {
  return traditionReviewSchema.parse(value ?? {});
}

// ---- async, API-backed store -----------------------------------------------------------------

/** Delay before a change is persisted, so typing doesn't fire a PUT per keystroke. */
export const SAVE_DEBOUNCE_MS = 600;

export type AuthStatus = "unknown" | "in" | "out";

export interface ReviewStatus {
  auth: AuthStatus;
  reviewer: Reviewer | null;
  /** Tradition ids with an in-flight or pending save. */
  saving: boolean;
  /** Last error message (network / server), cleared on the next success. */
  error: string | null;
  /** Whether the last error was loading a draft or saving one (drives the message). */
  errorKind: "load" | "save" | null;
  /** A tradition that was reconciled from another device since the last render (id → true). */
  reconciled: string | null;
}

/**
 * A 401 means the session expired mid-work. **Clear all draft state** before showing the sign-in form:
 * otherwise a different reviewer signing in on a shared browser would see (and could re-save under
 * their own account) the previous reviewer's cached drafts — corrupting the authoritative store and
 * crossing the private-intake line.
 */
function handleAuthError(e: unknown): boolean {
  if (e instanceof ReviewApiError && e.status === 401) {
    resetReviewStore(); // wipes current/versions/loadState/prefetched, sets auth "unknown"
    setStatus({ auth: "out", reviewer: null, error: "your session expired — sign in again" });
    return true;
  }
  return false;
}

/** How long a failed save waits before retrying. */
export const SAVE_RETRY_MS = 3000;

type LoadState = "loading" | "ok" | "error";

let current: ReviewState = emptyState();
let status: ReviewStatus = { auth: "unknown", reviewer: null, saving: false, error: null, errorKind: null, reconciled: null };
const versions = new Map<string, number>();
const loadState = new Map<string, LoadState>();
const loadPromises = new Map<string, Promise<boolean>>();
const dirty = new Set<string>();
const pendingDeletes = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();

const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit(): void {
  for (const l of listeners) l();
}
function snapshot(): ReviewState {
  return current;
}
function statusSnapshot(): ReviewStatus {
  return status;
}
function setStatus(patch: Partial<ReviewStatus>): void {
  status = { ...status, ...patch };
  emit();
}

// Best-effort: persist any debounced edits when the tab is hidden/closed, so up to SAVE_DEBOUNCE_MS
// of typing isn't lost on close. (The async flush may not finish on a hard close, but it starts.)
if (typeof window !== "undefined") {
  const flushOnHide = () => {
    if (dirty.size > 0 || timers.size > 0) void flushReviewSaves();
  };
  window.addEventListener("pagehide", flushOnHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnHide();
  });
}

/** Read the shared review state (re-renders on any update). */
export function useReviewState(): ReviewState {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Read auth + save status (loading, saving, errors, reviewer). */
export function useReviewStatus(): ReviewStatus {
  return useSyncExternalStore(subscribe, statusSnapshot);
}

/** Non-hook read of the current state / a tradition's version (tests, and imperative callers). */
export function peekReviewState(): ReviewState {
  return current;
}
export function peekVersion(tid: string): number {
  return versions.get(tid) ?? 0;
}
export function peekReviewStatus(): ReviewStatus {
  return status;
}

// --- saving ---

function scheduleRetry(tid: string): void {
  if (retryTimers.has(tid)) return;
  retryTimers.set(
    tid,
    setTimeout(() => {
      retryTimers.delete(tid);
      if (pendingDeletes.has(tid)) void enqueue(tid, () => persistDelete(tid));
      else if (dirty.has(tid)) runSave(tid);
    }, SAVE_RETRY_MS),
  );
}

/**
 * Serialize operations per tradition: a save and a "start over" delete (and the auto-redraw's save)
 * must not race — chaining them guarantees ordering, so a delete can't clobber a subsequent fresh
 * draft and an in-flight save can't resurrect a deleted one.
 */
function enqueue(tid: string, op: () => Promise<void>): Promise<void> {
  const prev = inflight.get(tid) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(op).finally(() => {
    if (inflight.get(tid) === next) inflight.delete(tid);
  });
  inflight.set(tid, next);
  return next;
}

function runSave(tid: string): void {
  void enqueue(tid, () => persistTradition(tid));
}

async function persistTradition(tid: string): Promise<void> {
  const t = current.traditions[tid];
  if (!t) {
    dirty.delete(tid);
    return;
  }
  // Never save before we know the server's version. Saving a version-0 PUT for a tradition whose
  // initial load FAILED would 409 and the last-write-wins retry would clobber the saved server draft.
  // So resolve the load first; if it fails, keep the edit dirty and retry later — do not save blind.
  if (loadState.get(tid) !== "ok") {
    const ok = await ensureTraditionLoaded(tid);
    if (!ok) {
      dirty.add(tid);
      scheduleRetry(tid);
      if (dirty.size === 0 && pendingDeletes.size === 0) setStatus({ saving: false });
      return;
    }
  }
  dirty.delete(tid);
  const t2 = current.traditions[tid];
  if (!t2) return;
  let version = versions.get(tid) ?? 0;
  try {
    let result = await putDraft(tid, t2, version);
    if (!result.ok) {
      // Conflict: another device advanced this tradition. Last-write-wins for the active device —
      // retry once with the server's version (our optimistic edits are preserved, not dropped).
      version = result.conflict.version;
      versions.set(tid, version);
      const retry = await putDraft(tid, current.traditions[tid] ?? t2, version);
      if (retry.ok) {
        result = retry;
        // LWW: we just overwrote another device's draft. That is the adjudicated design — but it must
        // not be silent. Surface the reconcile notice (survives the error-clear below; cleared on next edit).
        setStatus({ reconciled: tid, error: null, errorKind: null });
      } else {
        // Still conflicting (a third write raced): adopt the server draft (server-wins) + notice.
        versions.set(tid, retry.conflict.version);
        current = { ...current, traditions: { ...current.traditions, [tid]: parseTraditionReview(retry.conflict.state) } };
        setStatus({ reconciled: tid, error: null, errorKind: null });
        return;
      }
    }
    versions.set(tid, result.version);
    // Clear only error state — NOT `reconciled`: a reconcile notice (from this save's conflict, or a
    // load-adopt that just ran) must survive the follow-up save and stay until the reviewer's next edit.
    setStatus({ error: null, errorKind: null });
  } catch (e) {
    if (handleAuthError(e)) return;
    // A 403 usually means the CSRF token is missing/stale — refresh it so the retry can succeed,
    // instead of looping 403s forever.
    if (e instanceof ReviewApiError && e.status === 403) await fetchCsrf().catch(() => {});
    // Keep the optimistic state, leave the tradition dirty, and schedule a real retry.
    dirty.add(tid);
    scheduleRetry(tid);
    setStatus({ error: e instanceof Error ? e.message : "save failed", errorKind: "save" });
  } finally {
    if (dirty.size === 0 && pendingDeletes.size === 0) setStatus({ saving: false });
  }
}

function scheduleSave(tid: string): void {
  dirty.add(tid);
  setStatus({ saving: true });
  const existing = timers.get(tid);
  if (existing) clearTimeout(existing);
  timers.set(
    tid,
    setTimeout(() => {
      timers.delete(tid);
      runSave(tid);
    }, SAVE_DEBOUNCE_MS),
  );
}

/** Force all pending/failed saves now and await them (navigation, page-hide, submit, tests). */
export async function flushReviewSaves(): Promise<void> {
  for (const [tid, timer] of timers) {
    clearTimeout(timer);
    timers.delete(tid);
    dirty.add(tid);
  }
  // Only force deletes that aren't already queued/in-flight (scheduleDelete enqueues immediately) —
  // this covers a delete waiting on a failed-retry timer without double-running the live one.
  for (const tid of [...pendingDeletes]) if (!inflight.has(tid)) void enqueue(tid, () => persistDelete(tid));
  for (const tid of [...dirty]) runSave(tid);
  await Promise.all([...inflight.values()]);
  if (dirty.size === 0 && pendingDeletes.size === 0) setStatus({ saving: false });
}

/**
 * Apply a pure updater to the shared state; persist any tradition whose entry actually changed. The
 * pure updaters replace only the touched tradition's reference, so a shallow reference-diff finds
 * exactly what to save — no call-site changes needed.
 */
export function updateReviewState(fn: (s: ReviewState) => ReviewState): void {
  const prev = current;
  current = fn(prev);
  if (status.reconciled !== null) status = { ...status, reconciled: null }; // a fresh edit clears the notice
  const ids = new Set([...Object.keys(prev.traditions), ...Object.keys(current.traditions)]);
  for (const tid of ids) {
    const before = prev.traditions[tid];
    const after = current.traditions[tid];
    if (after === before) continue;
    if (after === undefined) scheduleDelete(tid); // "start over" — discard the server draft too
    else scheduleSave(tid);
  }
  emit();
}

// --- delete ("start over") ---

async function persistDelete(tid: string): Promise<void> {
  dirty.delete(tid);
  pendingDeletes.delete(tid); // in progress — cleared now; re-added only if it fails (like `dirty`)
  try {
    await deleteDraft(tid);
    versions.delete(tid);
    loadState.delete(tid);
    setStatus({ error: null, errorKind: null });
  } catch (e) {
    if (handleAuthError(e)) return;
    // A failed delete leaves the server draft; retry so "start over" actually sticks.
    pendingDeletes.add(tid);
    scheduleRetry(tid);
    setStatus({ error: e instanceof Error ? e.message : "delete failed", errorKind: "save" });
  } finally {
    if (dirty.size === 0 && pendingDeletes.size === 0) setStatus({ saving: false });
  }
}

function scheduleDelete(tid: string): void {
  pendingDeletes.add(tid);
  // A delete supersedes any queued save for the same tradition.
  dirty.delete(tid);
  const timer = timers.get(tid);
  if (timer) {
    clearTimeout(timer);
    timers.delete(tid);
  }
  setStatus({ saving: true });
  void enqueue(tid, () => persistDelete(tid));
}

/**
 * Ensure a tradition's draft is loaded from the API. Returns whether the load SUCCEEDED — callers
 * (and `persistTradition`) must not draw a fresh sample or save until it did, or a failed load would
 * let a blank draft overwrite the saved server copy. Idempotent + coalesced; a failed load can retry.
 */
export function ensureTraditionLoaded(tid: string): Promise<boolean> {
  if (loadState.get(tid) === "ok") return Promise.resolve(true);
  const existing = loadPromises.get(tid);
  if (existing) return existing;
  loadState.set(tid, "loading");
  const p = (async () => {
    try {
      const draft = await getDraft(tid);
      versions.set(tid, draft.version);
      if (draft.state !== null) {
        // Adopt the server draft on the FIRST successful load. If a local entry already exists, the
        // reviewer edited before this load succeeded (e.g. during a load blip) — that entry sits on a
        // BLANK base and would overwrite the saved server draft, so adopt the server copy and flag it
        // reconciled. Once loadState is "ok" this branch never runs again, so genuine post-load edits
        // are never clobbered.
        const hadLocal = current.traditions[tid] !== undefined;
        current = { ...current, traditions: { ...current.traditions, [tid]: parseTraditionReview(draft.state) } };
        setStatus(hadLocal ? { reconciled: tid, error: null, errorKind: null } : { error: null, errorKind: null });
      } else {
        // Server has no draft — keep any local work (nothing to lose).
        setStatus({ error: null, errorKind: null });
      }
      loadState.set(tid, "ok");
      emit();
      return true;
    } catch (e) {
      if (handleAuthError(e)) return false;
      loadState.set(tid, "error");
      setStatus({ error: e instanceof Error ? e.message : "load failed", errorKind: "load" });
      return false;
    } finally {
      loadPromises.delete(tid);
    }
  })();
  loadPromises.set(tid, p);
  return p;
}

let prefetched = false;

/**
 * Load ALL of the reviewer's drafts at once (one list call) so the landing page shows real
 * cross-device progress without opening each tradition. Idempotent per session.
 */
export async function prefetchDrafts(): Promise<void> {
  if (prefetched) return;
  prefetched = true;
  try {
    const drafts = await listDrafts();
    let next = current;
    let reconciledTid: string | null = null;
    for (const d of drafts) {
      // A tradition already loaded via its own GET is owned by that live path: the reviewer may have
      // edited since. Re-adopting the LIST copy (or even just overwriting `version`) would clobber
      // those post-load edits when the slower LIST resolves after a fast GET. Skip it entirely.
      if (loadState.get(d.traditionId) === "ok") continue;
      versions.set(d.traditionId, d.version);
      loadState.set(d.traditionId, "ok");
      if (d.state !== null) {
        // Same adopt rule as ensureTraditionLoaded: if a local entry already exists it was authored on
        // a blank base (a load blip) and would overwrite this saved draft, so adopt the server copy and
        // flag reconciled. Marking loadState "ok" without adopting would reopen the overwrite hole.
        const hadLocal = next.traditions[d.traditionId] !== undefined;
        next = { ...next, traditions: { ...next.traditions, [d.traditionId]: parseTraditionReview(d.state) } };
        if (hadLocal) reconciledTid = d.traditionId;
      }
    }
    current = next;
    if (reconciledTid) setStatus({ reconciled: reconciledTid });
    emit();
  } catch (e) {
    prefetched = false; // allow a retry
    if (!handleAuthError(e)) {
      setStatus({ error: e instanceof Error ? e.message : "couldn't load your drafts", errorKind: "load" });
    }
  }
}

/** Replace the whole state (JSON import): save present traditions, delete ones dropped by the import. */
export function replaceReviewState(next: ReviewState): void {
  const prev = current;
  current = next;
  for (const tid of new Set([...Object.keys(prev.traditions), ...Object.keys(next.traditions)])) {
    if (next.traditions[tid] === undefined) scheduleDelete(tid);
    else scheduleSave(tid);
  }
  emit();
}

/** Test/reset seam: drop the in-memory store (does not touch the server). */
export function resetReviewStore(): void {
  current = emptyState();
  status = { auth: "unknown", reviewer: null, saving: false, error: null, errorKind: null, reconciled: null };
  versions.clear();
  loadState.clear();
  loadPromises.clear();
  dirty.clear();
  pendingDeletes.clear();
  prefetched = false;
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  for (const t of retryTimers.values()) clearTimeout(t);
  retryTimers.clear();
  inflight.clear();
  emit();
}

// --- auth ---

function reviewerInfoFrom(r: Reviewer): ReviewerInfo {
  return { name: r.name, contact: r.email, background: r.background ?? "" };
}

let initInFlight = false;

/** Establish the session (call on entering /review): loads the reviewer + a CSRF token. Idempotent —
 * concurrent/duplicate calls are coalesced; a reset re-arms it. */
export async function initReview(): Promise<void> {
  if (initInFlight || status.auth !== "unknown") return;
  initInFlight = true;
  try {
    await fetchCsrf();
    const reviewer = await apiMe();
    current = { ...current, reviewer: reviewer ? reviewerInfoFrom(reviewer) : current.reviewer };
    setStatus({ auth: reviewer ? "in" : "out", reviewer, error: null });
  } catch (e) {
    // The review service is unreachable (network error, not a 401). Fail VISIBLY — resolve to
    // signed-out with an error so the gate shows the sign-in form + a notice, never a permanent spinner.
    setStatus({
      auth: "out",
      reviewer: null,
      error: "couldn't reach the review service — check your connection and try again",
    });
  } finally {
    initInFlight = false;
  }
}

/** Clear any residual draft state if a DIFFERENT reviewer is signing in on this browser. */
function resetIfReviewerChanged(nextId: string): void {
  if (status.reviewer && status.reviewer.id !== nextId) resetReviewStore();
}

export async function loginReview(email: string, password: string): Promise<void> {
  const reviewer = await apiLogin(email, password);
  resetIfReviewerChanged(reviewer.id);
  current = { ...current, reviewer: reviewerInfoFrom(reviewer) };
  setStatus({ auth: "in", reviewer, error: null, errorKind: null });
}

export async function signupReview(input: {
  email: string;
  password: string;
  name: string;
  background?: string;
  inviteCode: string;
}): Promise<void> {
  const reviewer = await apiSignup(input);
  resetIfReviewerChanged(reviewer.id);
  current = { ...current, reviewer: reviewerInfoFrom(reviewer) };
  setStatus({ auth: "in", reviewer, error: null, errorKind: null });
}

export async function logoutReview(): Promise<void> {
  await flushReviewSaves(); // don't drop debounced edits on the way out
  await apiLogout();
  resetReviewStore();
  setStatus({ auth: "out", reviewer: null });
}

// ---- pure state updaters ---------------------------------------------------------------------

function traditionOf(s: ReviewState, tid: string): TraditionReview {
  return s.traditions[tid] ?? emptyTradition();
}

/** Set a tradition's assigned sample (initial draw, reshuffle, add/remove). */
export function withSample(s: ReviewState, tid: string, sampleIds: string[], sampleSeed: string): ReviewState {
  const t = traditionOf(s, tid);
  return { ...s, traditions: { ...s.traditions, [tid]: { ...t, sampleIds, sampleSeed } } };
}

/** Update one of the two tradition-level checks (source / guide). */
export function withTraditionCheck(
  s: ReviewState,
  tid: string,
  which: "source" | "guide",
  patch: Partial<CheckReview>,
): ReviewState {
  const t = traditionOf(s, tid);
  return { ...s, traditions: { ...s.traditions, [tid]: { ...t, [which]: { ...t[which], ...patch } } } };
}

/** Update one scenario check. Accepts any scenario id (in-sample or out-of-sample). */
export function withScenarioCheck(
  s: ReviewState,
  tid: string,
  sid: string,
  key: ScenarioCheckKey,
  patch: Partial<CheckReview>,
): ReviewState {
  const t = traditionOf(s, tid);
  const checks = t.scenarios[sid] ?? emptyScenarioChecks();
  return {
    ...s,
    traditions: {
      ...s.traditions,
      [tid]: { ...t, scenarios: { ...t.scenarios, [sid]: { ...checks, [key]: { ...checks[key], ...patch } } } },
    },
  };
}

/** Drop one tradition's review entirely (the reviewer's explicit "start over"). */
export function withoutTradition(s: ReviewState, tid: string): ReviewState {
  const rest = { ...s.traditions };
  delete rest[tid];
  return { ...s, traditions: rest };
}

// ---- sampling --------------------------------------------------------------------------------

/**
 * The default assignment: `n` scenarios evenly spread across the ordered corpus (always includes
 * the first). Deterministic — every reviewer opening a tradition cold sees the same 10, so
 * maintainers can compare notes across reviewers.
 */
export function evenSample(ids: string[], n: number = REVIEW_SAMPLE_SIZE): string[] {
  if (ids.length <= n) return [...ids];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const pick = ids[Math.floor((i * ids.length) / n)];
    if (pick !== undefined) out.push(pick);
  }
  return out;
}

/** FNV-1a hash of a string → uint32 (seeds the PRNG below). */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG (good enough for drawing a review sample). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded random assignment (the "reshuffle" path): deterministic for a given (ids, seed), so a
 * reviewer's sample can be reproduced from the seed recorded in their report. Picks keep corpus
 * order. An empty seed falls back to the even spread.
 */
export function seededSample(ids: string[], n: number, seed: string): string[] {
  if (seed === "") return evenSample(ids, n);
  if (ids.length <= n) return [...ids];
  const rand = mulberry32(fnv1a(seed));
  const indices = ids.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = indices[i] as number;
    indices[i] = indices[j] as number;
    indices[j] = a;
  }
  return indices
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((i) => ids[i] as string);
}

// ---- progress --------------------------------------------------------------------------------

export interface ReviewProgress {
  /** Checks answered (any non-"unreviewed" status) within the REQUIRED sample. */
  done: number;
  /**
   * Required-sample checks carrying ANY content — a verdict OR notes/suggestion (matches what the
   * report renders). `done` counts only verdicts (for the completion bar); `contentful` also counts
   * notes-only checks, so a notes-only review is recognized as real content, not "empty".
   */
  contentful: number;
  /** Total answerable checks in the required sample: source + guide + 4 per sampled scenario. */
  total: number;
  /** How many answered checks (required sample) are flagged "needs changes". */
  flagged: number;
  /** Scenarios reviewed BEYOND the required sample (out-of-sample) — shown separately as "+N". */
  beyondSample: number;
}

/** A check counts as "answered" if it carries a verdict OR any notes/suggestion (matches the report). */
export function isCheckAnswered(c: CheckReview): boolean {
  return c.status !== "unreviewed" || c.notes.trim() !== "" || c.suggestion.trim() !== "";
}

export function traditionProgress(t: TraditionReview | undefined): ReviewProgress {
  if (!t) return { done: 0, contentful: 0, total: 0, flagged: 0, beyondSample: 0 };
  const checks: CheckReview[] = [t.source, t.guide];
  for (const sid of t.sampleIds) {
    const sc = t.scenarios[sid] ?? emptyScenarioChecks();
    for (const key of SCENARIO_CHECKS) checks.push(sc[key]);
  }
  const answered = checks.filter((c) => c.status !== "unreviewed");
  const sample = new Set(t.sampleIds);
  const beyondSample = Object.entries(t.scenarios).filter(
    ([sid, sc]) => !sample.has(sid) && SCENARIO_CHECKS.some((k) => isCheckAnswered(sc[k])),
  ).length;
  return {
    done: answered.length,
    contentful: checks.filter(isCheckAnswered).length,
    total: checks.length,
    flagged: answered.filter((c) => c.status === "flagged").length,
    beyondSample,
  };
}

/** The checks for one scenario (empty defaults when untouched). */
export function scenarioChecksOf(t: TraditionReview | undefined, sid: string): ScenarioChecks {
  return t?.scenarios[sid] ?? emptyScenarioChecks();
}
