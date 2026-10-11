### Iteration 1 Reviews
- codex: REQUEST_CHANGES — The data seam is largely correct, but the endpoint does not fully implement required symlink rejection and Phase 1’s failure-contract tests are incomplete.
- claude: APPROVE — Phase-1 data seam and hardened run-index endpoint are complete, type-clean, well-tested, and faithful to the plan; only cosmetic/locality nits remain.

### Builder Response to Iteration 1
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


### Iteration 2 Reviews
- codex: REQUEST_CHANGES — Phase 1 is otherwise complete, but run discovery still follows symlinked summary files despite the binding no-symlink-traversal requirement.
- claude: APPROVE — Phase 1's widened run-data seam and hardened run-index endpoint are complete, type-clean, genuinely tested (21 phase tests, 420 suite-wide), and the iteration-1 findings are verifiably fixed in code rather than merely claimed.

### Builder Response to Iteration 2
# Spec 2 — Phase 1 impl iteration 2 rebuttal

Split verdict again: **claude APPROVE**, **codex REQUEST_CHANGES** on one remaining
symlink path. Accepted it and also folded in claude's two cheap non-blocking
improvements. No disputes.

## Codex (REQUEST_CHANGES) — accepted and fixed

### `listRuns` followed a symlinked `summary.json`
**Accepted.** `statSync`/`accessSync` on `summary.json` follow symlinks, so a run dir
whose `summary.json` was itself a symlink would be indexed (even though `resolveRunFile`
later rejects serving it). Now `listRuns` `lstat`s `summary.json` first and skips the
entry if it is a symlink (or not a regular file), consistent with the
no-symlink-traversal rule. Added a `symsummary/` fixture (its `summary.json` symlinks to
the outside secret) and extended the listing test to assert it is not indexed.

## Claude (APPROVE) — non-blocking, folded in

1. **`fetchArtifact`'s `await res.text()` sat outside the try/catch** — a body-read
   rejection would escape the `LoadResult` contract as a thrown promise. Moved it inside a
   try/catch → a read failure returns `kind: "http"`, so every future caller (the Phase
   3/4/5 pages) gets a typed failure without its own `.catch`.
2. **Optional "no `src/` imports the node-only endpoint" guard** — added a 3-line scan
   test asserting no `src/` module references `runsEndpoint`, pinning the client/node
   boundary invariant for the Phase-2 purge (the directory placement already makes an
   accidental import fail at build; this makes it fail loudly in tests too).

Claude's other notes are carry-forwards, not Phase-1 changes:
- In-root symlinked run dirs are intentionally omitted from the index (correct security
  posture) — to be documented in the Phase-2/3 README rewrite (noted in the thread).
- `resolveRunFile`'s containment line is an unreachable backstop given the component
  checks — kept intentionally, commented as such.
- `parseSummary` normalizes absent `by_tradition` to `{}` — Phase 3 must omit the
  by-tradition section on emptiness, not truthiness (already noted for Phase 3).

## Note on the working-tree-change warning in claude's review

Claude's review appended a "WORKING TREE CHANGED during review" warning naming
`vite/runsEndpoint.ts` and `vite/runsEndpoint.test.ts`. That was **me** applying codex's
`listRuns` symlink fix concurrently — not a stray writer. The committed state is correct
and re-verified below.

## Verification after fixes

`check-types` clean; the endpoint suite is now 10 tests (incl. the symlinked-summary skip
and the client-import guard); `LocalResults.test.tsx` 11; the committed-run gate 1 — all
green.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
