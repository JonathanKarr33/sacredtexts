# Review: Replace multibrowser leftovers — sacredtexts leaderboard + error explorer

## Summary

Replaced the multibench "multibrowser" viewer (scenario browser + GitHub-data-layer
results + review flows) with a viewer **specific to this benchmark**: a leaderboard home,
an error explorer, and a cross-run current-standings view, all served from local `runs/`.
Delivered across **5 implement phases** (seam → purge → three views) as git commits on one
branch; final suite **115 passed / 0 skipped** (16 files), `check-types` clean, `pnpm build`
green, all four committed-run gates running (not skipped).

## Spec Compliance

- [x] AC1: `/` renders a leaderboard — one row per model ranked by overall accuracy (desc,
      `model_id` asc tiebreak, null-overall last), per-task + overall columns, per-tradition
      breakdown, per-model token totals from `summary.json` `usage` (Phase 3).
- [x] AC2: Run selector lists every `runs/<id>/` with a readable `summary.json`; selecting
      re-renders; default = most recent (mtime desc, `id` tiebreak); committed
      `first-run-2026-10-11` appears when present (Phase 1 index + Phase 3 selector).
- [x] AC3: Adding a new `runs/<id>/` appears with **no source change** — the dev run-index
      endpoint enumerates the directory; verified behavior covers the local-only
      `opus-run-2026-10-11` case (Phase 1).
- [x] AC4: Cross-run standings — one row per model from the **most recent run including that
      model**, keyed on `panel.provider`+`panel.model` (renamed id dedupes to one row;
      older-only model still appears), per-task scores + source run id/date + link into the
      run (Phase 5).
- [x] AC5: Error explorer lists every roster question for a model with pass/fail, including
      unanswered questions reconstructed from `questions.jsonl` × the run panel (Phase 1
      roster join + Phase 4 explorer).
- [x] AC6: Each question shows prompt / expected / actual / per-metric scores side by side
      (`exact`/`normalized`/`token_f1` per task; "n/a" where a task emits none) (Phase 4).
- [x] AC7: Explorer filters by task, tradition, correct/incorrect, and failure mode
      (missing vs wrong); filters compose; the missing-cell path is exercised by a
      `missing > 0` fixture run (committed run has `missing: 0`) (Phase 4).
- [x] AC8: No purged surface remains — legacy routes/modules/components gone; built bundle
      carries no `traditions/` imports and no `JLS-\d{3}`/`BZ-\d{3}`/`al-jalīs` identifiers
      (deploy-test assertions) (Phase 2).
- [x] AC9: Dependencies used only by the removed surface pruned (`js-yaml`, `zod`, TanStack
      Query + persisters, `react-markdown`/`remark-*`/`rehype-sanitize`/typography,
      `tailwind-merge`, `lucide-react`); `hono`/`@hono/node-server` **kept** — reused by the
      rewritten static+SPA-fallback `server/index.mjs` (deploy decision); no kept source
      imports a removed dep; build + `check-types` pass (Phase 2, confirmed Phase 5).
- [x] AC10: `pnpm -C apps/viewer test` green, including (a) the committed-run gate rendering
      `first-run-2026-10-11` through the leaderboard + explorer + standings, and (b) the
      `#86` numbered-shade built-CSS probe (kept, pinned to a safelisted ramp) (all phases).
- [x] AC11: `apps/viewer/README.md` describes this viewer; `TUTORIAL.md` + arch.md "Viewer
      local results" no longer point at `/local-results`; repo-root `README.md` provenance
      corrected (Phase 5).
- [x] AC12: HeroUI v3 stays provider-less (native `<select>`s everywhere, no v2 provider);
      `check-types` passes (all phases).

## Deviations from Plan

- **Phase 2**: Deleted `LocalResultsPage.tsx` (not on the plan's explicit delete list) — its
      only consumer was the removed `/local-results` route; `InterimHome` subsumed its role,
      so leaving it would be dead code. Also pruned `tailwind-merge` + `lucide-react` beyond
      the plan's named prune list (grep-confirmed unused in kept code). Both folded into the
      phase_2 consult, which approved them.
- **Phase 5**: Deliberately did **not** add a "Leaderboard" header nav link — its text
      collides with the page's `<h1>Leaderboard</h1>` and broke two LeaderboardPage tests;
      the brand link ("Sacred Texts Benchmark" → `/`) is the leaderboard-home affordance. The
      plan asked only for a Standings nav link, which was added.
- Otherwise the plan held: 5 phases, order and file lists as planned.

## Consultation Feedback

Consult was 2-way `["codex","claude"]` throughout — Gemini's per-phase consult can't see the
worktree (project lesson). Outputs committed under
`codev/projects/2-spec-2-replace-multibrowser-le/`. Every blocking concern was **Addressed**;
no concern was rebutted away without a fix except the explicitly out-of-scope items below.

### Specify Phase (Round 1)

#### Codex / Claude (both REQUEST_CHANGES, HIGH, convergent)
- **Concern**: Requirement 6 (cross-run standings) was silently dropped from the draft →
  **Addressed**: added as a verbatim constraint + success criterion + approach + test
  scenario, keyed on `panel.provider`+`panel.model`.
- **Concern**: missing cells aren't derivable from the 3 named artifacts (`score.py` emits
  rows only for answered questions) → **Addressed**: named `questions.jsonl` as the 4th
  artifact/roster; `joinResults` iterates the roster.
- **Concern**: per-task metric claims overstated → **Addressed**: softened to the real
  `_SUBMETRICS` emission per task; "n/a" where none.
- **Concern**: purge wording ("no tradition identifiers") would catch legitimate run-data
  tradition names → **Addressed**: rephrased to concrete multibrowser patterns. Revised
  draft re-approved.

### Plan Phase (Rounds 1–2)

#### Codex / Claude (both REQUEST_CHANGES HIGH each round; approach/ordering confirmed sound)
- **Round 1 — Concern**: Phase 2 must rewrite `main.tsx` + `renderApp.tsx` or the build
  breaks and the react-query prune is blocked → **Addressed** (listed as explicit edits).
- **Round 1 — Concern**: prod static host returns HTML-200 for `/runs/*` (no dev endpoint) →
  **Addressed**: `loadRun` shape-sniffs HTML-200 as "absent" → empty state, not crash; prod
  smoke asserts it.
- **Round 1 — Concern**: `#86` CSS probe would go fragile/red after purge → **Addressed**:
  `@source inline(...)` safelist in `styles.css` + probe pinned to safelisted shades.
- **Round 2 — Concern**: `loadRun` typed-result change breaks `LocalResultsPage` +
  `LocalResults.test` (unlisted consumers) → **Addressed**: listed as a minimal adapter edit
  + reworked 404 test.
- **Round 2 — Concern**: content-type guard throws on headerless fake fetchers; `.jsonl` is
  text/plain → **Addressed**: switched to shape-sniffing (leading `<` / parse-fail = absent).
- **Round 2 — Concern**: "built+served app shows empty state" not executable in jsdom →
  **Addressed**: split into a deploy server-response check + a jsdom render-with-HTML-200
  test. Revised plan re-approved (phases unchanged at 5).

### Implement phase_1 — run-data seam + run-index endpoint (Rounds 1–3)

#### Codex (REQUEST_CHANGES → APPROVE) / Claude (APPROVE throughout)
- **Concern (codex)**: `resolveRunFile`/`listRuns` followed symlinks → **Addressed**:
  per-component `lstat` symlink rejection, `listRuns` skips symlink entries + `lstat`s
  `summary.json`, read errors → 500.
- **Concern (codex)**: unlocalized malformed-`summary.json` message → **Addressed**: path
  prefix added.
- **Concern (claude, non-blocking)**: body-read rejection in `fetchArtifact` escaped the
  typed result → **Addressed**: moved `res.text()` inside try/catch (→ `kind:"http"`); added
  a grep guard that no `src/` imports the node endpoint. Both APPROVE on iter3.

### Implement phase_2 — purge to a clean shell (Round 1)

#### Codex (APPROVE HIGH) / Claude (APPROVE HIGH)
- **Concern (claude, non-blocking)**: deploy smoke was vacuous (both assertions satisfied by
  the index.html fallback) → **Addressed**: added an assertion that the hashed
  `dist/assets/*.js` is served with a JS content-type.
- **Concern (claude, non-blocking)**: stale "multibrowser" strings shipped in the bundle
  (ErrorBoundary label, vite comment) → **Addressed**: relabeled. No blocking concerns; both
  deviations (LocalResultsPage deletion, extra dep prune) verified sound.

### Implement phase_3 — leaderboard home + run selector (Rounds 1–3)

#### Codex (REQUEST_CHANGES → APPROVE) / Claude (APPROVE/COMMENT)
- **Concern (both, converging)**: a null-overall model's cell must format as "n/a" (spec),
  but `formatCell` returned "—" then "miss N" for the real fully-missing `score.py` cell
  shape → **Addressed** over two rounds: unified `formatCell` so any null-accuracy cell reads
  "n/a", annotated "n/a (miss N)" when a missing count is present; guard switched from `n===0`
  to `accuracy===null` to express spec intent. Both APPROVE on iter3.

### Implement phase_4 — error explorer (Round 1)

#### Codex (APPROVE HIGH) / Claude (COMMENT HIGH, non-blocking)
- **Concern (claude)**: filter UI untested → **Addressed**: added a drive-the-`<select>`
  interaction test (navigate → URL → re-filter → "all" restores).
- **Concern (claude)**: tradition round-trip asserted only as an href string → **Addressed**:
  added a test parsing `?tradition=Protestant+Christian` back (the `+`↔space contract).
- **Concern (claude)**: unknown model id read as "empty run" → **Addressed**: distinct "Model
  not in this run" alert + test.
- **Concern (claude)**: hand-edited filter value absent from derived options blanked the
  `<select>` → **Addressed**: active value appended as an option.

### Implement phase_5 — cross-run standings + doc/dep sweep (Rounds 1–3)

#### Codex (REQUEST_CHANGES → APPROVE) / Claude (APPROVE → REQUEST_CHANGES → APPROVE)
- **Concern (codex, blocking)**: `aggregate` equal-mtime tiebreak was id-DESC but the run
  index sorts id-ASC → leaderboard-default and standings could disagree on the "most recent"
  tied run → **Addressed**: tiebreak → id ASC, matching the index; tie test + doc comment
  updated.
- **Concern (codex + claude, blocking/nit)**: `StandingsPage` silently dropped
  failed-to-load summaries → a dropped newer run could present an older result as current →
  **Addressed**: `loadAllRunSummaries` returns `failed: string[]`; a non-fatal `role=status`
  notice names omitted runs; partial render kept; test extended.
- **Concern (claude, blocking)**: repo-root `README.md` still called `apps/viewer/` a
  not-yet-adapted multibrowser seed (phase_5 names `README.md` in the docs sweep) →
  **Addressed**: corrected in place.
- **Concern (claude, non-blocking)**: new defensive mtime sort in `runIndex.ts` unexercised;
  Standings nav link untested; `runDate` mislabeled dir mtime as the run's date; package
  description omitted standings → **Addressed** (out-of-order index test, nav-link test,
  "indexed <date>" relabel, description updated).
- **Concern (claude)**: root `README.md:22` calls `texts/` wholly "gitignored pending
  licensing", contradicting the two-tier committed-raw rule → **N/A** (out of Spec 2 scope;
  claude concurs) — **flagged to the architect** instead of touched in phase_5.
- **Concern (claude)**: `aggregate` would throw on `models:{m:null}`; standings omits token
  totals; cross-coverage ranking is apples-to-oranges → **Rebutted/N/A**: pre-existing
  `parseSummary` validation-depth limit shared with the leaderboard (not a regression); req 6
  asks only per-task + source run + link; per-row "from run" gives the reader context. Both
  APPROVE on iter3.

## Lessons Learned

### What Went Well

- **Purge-first ordering** localized the risky mass-deletion + deploy/app-test rework into one
  atomic reviewable commit (Phase 2), so the three feature phases built additively on a clean,
  green base. The interim home kept `/` working between the purge and the leaderboard.
- **Typed `LoadResult` + shape-sniffing** turned the prod-static-host HTML-200 hazard (no
  `/runs` endpoint in production) into a defined empty state rather than a runtime crash — a
  class of bug the consults kept probing and never found live.
- **The committed-run gate** (rendering `first-run-2026-10-11` end to end) pinned every
  surface to real `summary.json`/`scores.jsonl` shapes, catching the null-overall "n/a"
  formatting bug against the actual `score.py` fully-missing cell shape.

### Challenges Encountered

- The real `score.py` cell shape for a fully-missing model (`{n:0, accuracy:null, expected_n,
  missing:N}`) was only discoverable from the data, not the spec prose — it took two consult
  rounds in Phase 3 to converge `formatCell` on the spec's "n/a" (resolved as "n/a (miss N)").
- The `#86` numbered-shade CSS probe self-seeded from `deploy.test.ts` string literals and
  would have become fragile after the purge; the `@source inline(...)` safelist made it
  deterministic but grew built CSS to ~421KB (accepted, documented).
- Stale "multibrowser" strings surviving in **comments** twice tripped grep-style deploy
  assertions — a reminder that purge assertions match prose as well as code.

### What Would Be Done Differently

- Derive the metric/cell formatting contract from a fully-missing fixture **up front** (Phase 1)
  rather than discovering the `accuracy:null`+`missing:N` shape during Phase 3 consults.
- Extract the shared run-index fetch (`runIndex.ts`) in Phase 3 when the second consumer was
  foreseeable, instead of copy-ready in Phase 5 — the HTML-sniff guard is security-relevant and
  should never have been a copy-paste risk.

### Methodology Improvements

- The 2-way (codex+claude) per-phase consult worked well here: codex caught ordering/security
  blockers, claude verified claims against the real tree/build. Keeping Gemini out of per-phase
  consults (it can't see the worktree) avoided noise — this is already encoded in
  `.codev/config.json` and `lessons-critical.md`.

## Architecture Updates

- Routed: **hot** — `arch-critical.md` — the `apps/viewer/` bullet was updated **in place**
  (within cap) during Phase 5 to describe the finished 3-surface viewer (leaderboard + error
  explorer + cross-run standings; routes `/`, `/run/$runId/model/$modelId`, `/standings`; no
  GitHub data layer), replacing the stale "multibrowser seed … not yet adapted" wording. No
  net growth — one bullet edited, no displacement needed.
- Routed: **cold** — `arch.md` "Viewer local results" section — expanded to the full route
  tree, the `loadSummary` summary-only loader, and `runIndex.ts` (shared run-index fetch).
- No further architecture updates needed — the pipeline/texts/interchange facts are unchanged
  by this viewer-only work.

## Lessons Learned Updates

- No lessons-learned updates needed as **new** hot/cold entries: the governing lessons this
  project relied on (HeroUI v3 provider-less; per-phase consult is `["codex","claude"]`; derive
  formats from real reference data; the GitHub-data-layer rate-limit note) already exist in
  `lessons-critical.md` and were applied, not newly discovered. The viewer-specific
  provenance (multibrowser GitHub data layer) lives in `apps/viewer/README.multibrowser.md`.
  The "derive the cell-formatting contract from a fully-missing fixture up front" takeaway is
  a narrower restatement of the existing "derive a data format from the real reference data"
  lesson — captured here rather than duplicated into the hot tier.

## Flaky Tests

No flaky tests encountered. The full suite ran 115 passed / 0 skipped deterministically across
every phase; the committed-run gates are `describe.skipIf(!present)`-guarded (present → run)
and all four ran.

## Follow-up Items

Out of Spec 2 scope; captured for a future MAINTAIN pass (all raised and agreed in consults):

1. **Extract a shared `compareByOverall(a,b)`** used by both `rankedModels` (leaderboard) and
   `aggregate` (standings), so the "standings over one run == that run's leaderboard order"
   invariant is structural for all runs, not just pinned for the committed run.
2. **Two-run panel/panel-absent fixture** (same model, one run with `panel`, one without) to
   pin the intended double-row degradation of the panel-absent fallback, currently asserted
   only for a single panel-less run.
3. **`expect(present).toBe(true)` inside `describe.skipIf(!present)` is unreachable when
   skipped** — a cross-cutting hardening across ALL committed-run gates (`realRun`,
   `LeaderboardPage`, `ExplorerPage`, `StandingsPage`), not a one-gate change.
4. **Standings model-name link could point at the explorer** (`/run/$runId/model/$modelId`)
   for one-click drill-in; req 6 only asks for a link to the run, so current behavior is as
   specified.
5. **Repo-root `README.md:22`** calls `texts/` wholly "gitignored pending licensing", which
   contradicts `arch-critical.md`'s two-tier rule (public-domain raw IS committed; only
   `restricted` + `texts/standardized/` are ignored). **Flagged to the architect** (out of
   this viewer spec's scope).
