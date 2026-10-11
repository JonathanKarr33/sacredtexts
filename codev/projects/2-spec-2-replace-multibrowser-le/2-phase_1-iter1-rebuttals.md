# Spec 2 — Phase 1 impl iteration 1 rebuttal

Split verdict: **claude APPROVE** (cosmetic/locality nits), **codex REQUEST_CHANGES**
(three hardening/coverage items). Both verified against the real tree. I accepted every
legitimate point; no disputes. Fixes landed in the phase-1 commit's follow-up.

## Codex (REQUEST_CHANGES) — accepted and fixed

### 1. Symlink rejection was containment-only, not "reject any symlink traversal"
**Accepted.** `resolveRunFile` used `realpathSync` + containment, which rejects *escaping*
symlinks but follows in-root ones. The binding requirement is to never traverse a symlink.
Rewrote `resolveRunFile` to walk the relative path component-by-component, `lstat`-ing each
and returning null on **any** symlink component (and on `..`), with the containment check
kept as a backstop. `listRuns` now explicitly skips symlinked entries
(`Dirent.isSymbolicLink()`). Added a test creating an **in-root** symlink (`inlink` →
`run-a`) and asserting `resolveRunFile(tmp, "inlink/summary.json")` is rejected — this also
closes claude's finding #3 (the old containment branch was unreachable/untested; it is now
removed and replaced by a genuinely-covered component check).

### 2. `listRuns` verified existence, not readability; handler `readFileSync` could throw
**Accepted.** `listRuns` now `fs.accessSync(summary, R_OK)` to require the file be readable
(not just present), skipping unreadable entries. `createRunsHandler` wraps `readFileSync`
in try/catch → HTTP 500 instead of letting an exception terminate middleware handling.

### 3. Failure-contract test coverage incomplete; malformed-summary message unlocalized
**Accepted.** Added tests: a non-404 HTTP failure → `kind: "http"`; a malformed **JSONL**
line asserts `kind: "malformed"` with `scores.jsonl:2` file+line context; a task that emits
no sub-metrics (`verify_source`) → `exact/normalized/token_f1` all `null`; and (in the
committed-run gate) `panel["claude-haiku"].served_by === null` plus an openrouter model's
array. The malformed-`summary.json` message is now localized: `loadRun` wraps the summary
`JSON.parse` and prefixes `${base}/summary.json:` (the JSONL paths were already localized by
`parseJsonl`).

## Claude (APPROVE) — nits, addressed

1. **Stale `LocalResultsPage.tsx` comment** ("falls back to the sample on 404") — rewritten
   to describe the typed loader (success → render; failure → localized error; no-`?run=`
   renders the committed sample).
2. **Unlocalized malformed summary** — same fix as codex #3.
3. **`listRuns` symlink test vacuity** — resolved by the component-wise rewrite + in-root
   symlink test (above).
4. **Roster path drops answers absent from the roster** — accepted as correct behavior
   while the roster is authoritative (score.py binds answers to the question-set digest);
   added a code comment documenting the invariant and that a stale roster would surface as a
   count gap against summary `n`. No behavior change.
5. **`parseSummary` normalizes absent `by_tradition` to `{}`** — a Phase-3 concern
   (the leaderboard must omit the by-tradition section on **emptiness**, not truthiness);
   noted in the thread for Phase 3, no Phase-1 change.

## Disagreements

None.

## Verification after fixes

`check-types` clean; full viewer suite 427 passed / 9 skipped (pre-existing); the endpoint
confinement suite now 9 tests (incl. in-root symlink), `LocalResults.test.tsx` 11 (incl.
http/malformed-jsonl/absent-metrics), committed-run gate green with served_by assertions.
