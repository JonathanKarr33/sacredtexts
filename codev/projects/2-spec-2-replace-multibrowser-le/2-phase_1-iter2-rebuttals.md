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
