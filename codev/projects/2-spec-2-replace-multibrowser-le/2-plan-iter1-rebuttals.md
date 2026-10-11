# Spec 2 — Plan iteration 1 rebuttal

Both reviewers returned **REQUEST_CHANGES (HIGH confidence)**; both verified the plan
against the real tree and the committed run and confirmed the approach, phase ordering,
and spec coverage are sound ("seam-first / purge-second / views-third is the right
call"). The findings were plan-text gaps, not design errors, and I accepted all of them.
Revised the plan (commit `[Spec 2] Plan with multi-agent review`). Point by point:

## Blocking — accepted and fixed

### A. Phase 2 omits two files that import deleted modules → the build breaks (claude)
**Accepted — this was a real build-breaker.** Added both as explicit Phase-2 edits:
- `src/main.tsx` — rewritten to `StrictMode > ErrorBoundary > RouterProvider` (it
  currently imports `PersistQueryClientProvider`, `createSyncStoragePersister`,
  `defaultShouldDehydrateQuery`, `./lib/queryClient`, and `RAW_PERSIST_EXCLUDED`, all
  deleted/pruned here);
- `src/test/renderApp.tsx` — strip the `QueryClientProvider` / `@tanstack/react-query`
  wrapper.
Both are called out as blocking the `@tanstack/react-query` prune, and the Risks table
now carries this as High/High.

### B. Phase-1 endpoint confinement test is unreachable (codex + claude)
**Accepted.** `serveRuns` is a non-exported closure with a hardcoded root. Phase 1 now
**extracts** it to a new importable module `src/lib/runsEndpoint.ts` exposing a factory
`createRunsHandler(runsDir)` + a pure `listRuns(runsDir)`; `vite.config.ts` imports it.
Added the Connect mount-semantics note (the `/runs` prefix is stripped → the collection
request arrives as `/` or `/_index`, match on that) and the nonexistent-root guard
(`realpathSync` must not throw → `listRuns` returns `[]`). The confinement test
(`runsEndpoint.test.ts`) runs against a temp dir.

### C. Production `loadRun` must require all four artifacts (codex)
**Accepted; it contradicted the approved spec.** Phase 1 now specifies production
`loadRun` requires `summary.json` + `scores.jsonl` + `answers.jsonl` + `questions.jsonl`
and returns a **typed result** distinguishing missing-artifact / HTTP-failure /
malformed-JSON(line). The optional-roster path is confined to the low-level
`joinResults` for the in-memory sample only; the page, not the loader, owns any sample
fallback.

### D. Deployed static host serves HTTP 200 HTML for `/runs/*` → crash, not empty state (claude)
**Accepted — subtle and real.** `serveRuns` is dev-only and the prod host does
`app.notFound(c => c.html(indexHtml))`, so `/runs/_index` and `/runs/<id>/summary.json`
return 200 HTML; `loadRun`'s `!s.ok` guard misses and `parseSummary` throws on HTML.
Phase 1 adds a **content-type / JSON-shape guard** (a non-JSON 200 ⇒ "artifact absent");
Phase 2 adds a built-app assertion that the served app shows the **empty state, not a
crash**. Added to Risks (Medium/High).

### E. `#86` built-CSS probe likely goes RED after the purge (claude)
**Accepted — the risk was mis-framed as "dropped," but the real failure is red.** Under
Tailwind v4 `@theme inline`, a numbered utility is emitted only if the class is in
scanned content, and every probed shade lives only in files Phase 2/3 delete. Phase 2
now makes the mechanism deliberate: an `@source inline(...)` safelist in `styles.css`
covering the shim's semantic ramp, with the probe list **pinned** to the safelisted
shades — so the probe tests the shim regardless of which utilities the app happens to
use. (Reviewer noted this was not build-verified in the tree; the safelist removes the
dependency on that outcome.) Risks reframed to High/High.

### F. Static-host strategy was left undecided ("possibly remove Hono") (codex)
**Accepted; decided concretely.** Keep `hono`/`@hono/node-server` and **rewrite**
`server/index.mjs` to a minimal static-file host with SPA fallback (drop the `/api/*`
proxy); **delete** `scripts/bake-and-deploy.sh`; update `railway.json`/`.railwayignore`.
Dependency cleanup now also names `@types/js-yaml` and regenerating `pnpm-lock.yaml`
(both per codex). `start` stays `node server/index.mjs`; the deploy-test assertion is
updated to match.

### G. Run-selection URL contract undefined (codex)
**Accepted.** Phase 3 defines `/?run=<encodeURIComponent(id)>` as the shareable,
refresh-safe contract (validated by a plain validator, not `zod`): the selector reads
and writes it, and Phase 4 (explorer "back to leaderboard") and Phase 5 (standings
row links) target it.

### H. `loadRun` failure semantics + rapid-switch staleness (codex)
**Accepted.** Covered by C's typed-failure result; Phase 3 adds the `live`-flag
stale-request guard (so a slow earlier load cannot overwrite the current selection) and a
rapid-switch test.

## Non-blocking — accepted

- **Phase 2 "`/` renders the committed run" was wrong** (codex + claude): `LocalResultsPage`
  shows the synthetic sample without `?run=`. Phase 2 now adds a small `InterimHome.tsx`
  that default-loads the most-recent run via the Phase-1 index (empty state when none);
  acceptance reworded.
- **`zod` pruned vs explorer search params** (claude): Phase 2 adds an explicit note and
  Phase 4 states the explorer uses a plain `validateSearch` function — `zod` is not
  re-added.
- **`served_by` is `string[] | null`** (claude): typed that way in Phase 1.
- **`components/LocalResults.test.tsx` unnamed in Phase 3 deletions** (claude): now listed
  alongside `LocalResults.tsx` / `LocalResultsPage.tsx` / `InterimHome.tsx`.
- **Phase 2 size** (claude, optional): kept as one plan phase (atomic logical change) but
  added a note that the builder may land it as two internal commits (2a source/rework,
  2b server/tests/deps/docs), each independently green.

## Disagreements

None. Every point was accurate and actionable; the two reviews were complementary (codex
on contracts/URL/failure-modes, claude on concrete build-breakers verified in the tree).
