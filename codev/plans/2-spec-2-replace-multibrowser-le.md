# Plan: Sacredtexts viewer — leaderboard + error explorer (purge multibrowser leftovers)

**Specification**: [codev/specs/2-spec-2-replace-multibrowser-le.md](../specs/2-spec-2-replace-multibrowser-le.md)

## Executive Summary

The spec's chosen approach is **extend the proven `localResults` seam** (Approach 3) and
build the new views on top, with run discovery via a **dev-only directory-listing
endpoint** (Approach 1), a **static SPA deploy**, and the multibrowser surface **removed,
not hidden**.

The phase order is **seam → purge → three views**, because:

1. The data the new pages need (per-metric scores, `usage`, `panel`, and a
   `questions.jsonl` roster so un-answered questions are listable) and the run-index
   endpoint are a self-contained library/middleware change that touches no pages — it
   lands first, fully unit-tested, with the existing `/local-results` page and the
   committed-run gate still green.
2. The **purge** is one large, risky, mass-deletion + test-rework (removing the GitHub
   data layer, the `/t`·`/results`·`/raw`·`/review` surface, and reworking
   `deploy.test.ts` / `app.test.tsx` while preserving the `#86` built-CSS probe). Doing
   it as a single atomic phase — reducing the app to a clean, green shell whose `/`
   temporarily reuses the existing local-results view so home is never broken —
   localizes the churn and gives every later phase a clean base.
3. The three deliverable views (**leaderboard home + run selector**, **error explorer**,
   **cross-run aggregate**) then land additively on that clean shell, each independently
   testable against the committed run and a `missing > 0` fixture.

Each phase is a single atomic commit that keeps `pnpm -C apps/viewer test` (the
`apps/viewer` arm of `.codev/checks/test.sh`) green and `check-types` passing, and never
adds a HeroUI v2 provider.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Run-data seam + hardened run-index endpoint"},
    {"id": "phase_2", "title": "Purge multibrowser surface to a clean shell"},
    {"id": "phase_3", "title": "Leaderboard home + run selector"},
    {"id": "phase_4", "title": "Error explorer with roster-based missing cells"},
    {"id": "phase_5", "title": "Cross-run aggregate (current standings)"}
  ]
}
```

## Phase Breakdown

### Phase 1: Run-data seam + hardened run-index endpoint

**Dependencies**: None

#### Objective

Widen the local-run data layer so the new pages have everything they need, and add the
run-enumeration endpoint — without touching any page. Delivers the complete, tested data
foundation the three views build on.

#### Files to Create / Modify

- `apps/viewer/src/lib/localResults.ts` — widen the parsed model:
  - carry per-metric scores (`exact`/`normalized`/`token_f1`) on `QuestionResult`,
    keeping the values the task emits and representing absent ones as `null` (not `0`);
  - parse `summary.json`'s `usage` (`per_model{calls,in,out}`, `total`) and `panel`
    (`provider`, `model`, `endpoint`, `served_by`) into the `Summary` type;
  - add an **optional** roster input (`questions.jsonl`) to the join: when present,
    `joinResults` iterates the panel × roster and marks a `(model, question)` with no
    answer row as a **missing** result (new `missing: boolean` / absent answer+metrics);
    when absent, it falls back to iterating the scores rows (back-compat for the
    in-memory sample).
  - `loadRun` fetches `questions.jsonl` alongside the existing three (treat a 404 as "no
    roster" → fallback join; a present-but-malformed roster is a hard error).
- `apps/viewer/vite.config.ts` — extend `serveRuns`:
  - a request for the `/runs/` **collection** (e.g. `/runs/` or `/runs/_index`) returns
    JSON `[{id, mtimeMs}]` for each immediate subdirectory containing a readable
    `summary.json`;
  - **harden confinement**: resolve the canonical path (`fs.realpathSync`), reject
    anything resolving outside the canonical `runs/` root or traversing a symlink, and
    wrap `decodeURIComponent` in try/catch (malformed encoding → 400, not a throw). Apply
    the same hardening to the existing single-file branch.
- `apps/viewer/src/local/sample.ts` — add a small sample roster (so the sample still
  joins) and a **`missing > 0` fixture** (a roster question with no answer row) for the
  explorer's missing-cell path.
- `apps/viewer/src/lib/localResults.test.ts` (new or fold into existing
  `components/LocalResults.test.tsx`) — unit tests for the widened parse/join and the
  missing fixture.
- `apps/viewer/src/local/realRun.test.ts` — extend: assert the committed run still joins
  to 400 results (its roster == answered, `missing: 0`), and that per-metric values and
  `usage`/`panel` now parse.
- A unit test for the run-index endpoint's confinement (traversal `../`, symlink escape,
  malformed encoding) — against a temp dir.

#### Deliverables

- [ ] `loadRun`/`parseSummary`/`joinResults` carry metrics, usage, panel, and a roster;
      missing questions are representable.
- [ ] `serveRuns` lists runs and is hardened (realpath + symlink reject + safe decode).
- [ ] A `missing > 0` fixture exists and is exercised.
- [ ] Tests for this phase (parse/join/missing/endpoint-confinement).

#### Acceptance Criteria

- [ ] The committed-run gate (`realRun.test.ts`) still passes with the widened model.
- [ ] `pnpm -C apps/viewer test` and `check-types` pass; `/local-results` still renders.
- [ ] No page/route/nav changes in this phase (diff is lib + middleware + tests + sample).

#### Test Plan

- Unit: metrics preserved/`null` per task; `usage`/`panel` parsed; roster join surfaces a
  missing question; scores-only fallback still works for the sample.
- Unit: endpoint lists only subdirs with `summary.json`; rejects traversal, symlink
  escape, and malformed-percent-encoding (temp-dir fixtures).
- Regression: `realRun.test.ts` (400 cells, discriminating, now with metrics).

### Phase 2: Purge multibrowser surface to a clean shell

**Dependencies**: Phase 1

#### Objective

Remove everything serving multibrowser — routes, pages, components, the GitHub data
layer, test scaffolding, and now-dead dependencies — reducing the app to a clean, green
shell whose `/` reuses the existing local-results view so home stays meaningful.
Delivers "gone, not merely hidden" and a base the feature phases build on.

#### Files to Create / Modify

- **Delete** the multibrowser routes/pages: `routes/TraditionPage.tsx`,
  `ScenarioPage.tsx`, `ResultsPage.tsx`, `RawResultsPage.tsx`, `RawRunPage.tsx`,
  `ReviewIndexPage.tsx`, `ReviewTraditionPage.tsx`, `ReviewScenarioPage.tsx`, and their
  tests (`scenario.test.tsx`, `tradition.test.tsx`, `results.test.tsx`,
  `rawResults.test.tsx`, `rawRun.test.tsx`, `review.test.tsx`).
- **Delete** the GitHub data layer + domain libs: `lib/github.ts`, `queries.ts`,
  `queryClient.ts`, `constants.ts`, `rateLimit.ts`, `corpus.ts`, `identity.ts`,
  `model.ts`, `parse.ts`, `filtering.ts`, `leaderboard.ts`, `results*.ts`, `raw*.ts`,
  `review*.ts`, `scoreColor.ts`, `rampColor.ts`, `searchParams.ts`, and their tests.
- **Delete** the multibrowser components: `TraditionCard.tsx`, `TraditionHeader.tsx`,
  `Scenario*.tsx`, `Review*.tsx`, `RateLimitBanner.tsx`, `RawComparison.tsx`,
  `RawPresets.tsx`, `CorpusContext.tsx`, `TaxonomyAxes.tsx`, `FilterBar.tsx`,
  `Collapsible.tsx`, `Notice.tsx`, and test scaffolding `test/fakeRepo.ts`,
  `test/rawFixture.ts`. **Keep** `ErrorBoundary`, `Loading`, `Markdown` (and their
  tests), `test/setup.ts`, `test/renderApp.tsx`, `test/noInvisibleText.test.ts`.
- `src/router.tsx` — reduce the route tree to `/` + a catch-all 404; `/` renders the
  existing `LocalResultsPage` as the interim real home (kept until Phase 3); drop
  `parseSearch`/`stringifySearch`/`validateSearch` wiring that referenced deleted
  schemas.
- `src/routes/RootLayout.tsx` — strip the "MultiBrowser" brand, the Results/Review nav
  links, and the "traditions on GitHub" link (which used the GitHub SHA query); keep the
  app-shell scroll behavior. Rename brand to this app.
- `src/routes/IndexPage.tsx` — delete (its traditions-grid role is gone; `/` now routes
  to the interim local-results home).
- `src/deploy.test.ts` — rework: **drop** the tradition-baking, `public/data-raw`
  raw-tier, and `/api/*` review-proxy assertions and the `/t/...` deep-link smoke;
  **keep and relocate** the `#86` numbered-shade built-CSS probe; keep a generic
  **SPA-fallback** smoke (an unknown deep route serves `index.html`); keep `base: '/'`.
- `src/routes/app.test.tsx` — rework: **drop** the GitHub-index / tradition-grid /
  rate-limit / deep-link-to-tradition tests; **keep** the in-SPA 404 test, the
  ErrorBoundary test, and an app-shell test updated to the new header.
- `server/index.mjs` + `scripts/bake-and-deploy.sh` + `.railwayignore`/`railway.json` —
  reduce to a plain static SPA host (SPA fallback only; remove the `/api/*` reverse proxy
  and the raw-bake). If the static host no longer needs `hono`, remove it; otherwise keep
  a minimal hono static+fallback server. Update `deploy.test.ts`'s `start`-command
  assertion to match whatever remains.
- `apps/viewer/package.json` — prune dependencies used **only** by the removed surface:
  `js-yaml`, `zod`, `@tanstack/react-query`, the two query persisters, and (per the
  static-host decision) possibly `hono`/`@hono/node-server`. Keep `@tanstack/react-router`
  and the HeroUI/Tailwind/react stack. Verify nothing kept imports a removed dep.
- `.gitignore` (viewer) — drop the `public/data-raw/` entry if the bake is gone.
- Docs: `apps/viewer/README.md` (describe the interim state / remove the "seed" framing
  for removed surfaces); note in `TUTORIAL.md`/`codev/resources/arch.md` that the
  `/t`·`/results`·`/review` surface is gone (the `/local-results`→leaderboard wording
  lands in Phase 3). Move/trim `README.multibrowser.md` as provenance or delete.

#### Deliverables

- [ ] No purged route/module/component remains under `apps/viewer/src`; no
      `from '…/traditions/'` import in source.
- [ ] `router.tsx` serves only `/` (interim local-results home) + 404; `RootLayout`
      nav has no multibrowser links.
- [ ] `deploy.test.ts`/`app.test.tsx` reworked; the `#86` CSS probe and an SPA-fallback
      smoke survive.
- [ ] Dead dependencies pruned from `package.json`; build + `check-types` pass.
- [ ] Tests for this phase (the reworked deploy/app/shell tests).

#### Acceptance Criteria

- [ ] `pnpm -C apps/viewer test` green; `pnpm -C apps/viewer build` green; `check-types`
      passes.
- [ ] Built bundle contains no `JLS-\d{3}`, `BZ-\d{3}`, or `al-jalīs`.
- [ ] `/` renders real content (the committed run via the interim view); 404 works.
- [ ] HeroUI stays provider-less; the `styles.css` shade shim is intact (probe passes).

#### Test Plan

- The reworked `deploy.test.ts`: real build has no `data-raw`, bundle has no corpus ids,
  `#86` probe passes against real CSS, SPA fallback serves `index.html` for a deep route.
- The reworked `app.test.tsx`: 404 renders, ErrorBoundary catches, shell header renders.
- Manual: `pnpm dev` → `/` shows the committed run; deleted routes 404.
- A source grep (in a test or the deploy test) asserts no `/traditions/` imports remain.

### Phase 3: Leaderboard home + run selector

**Dependencies**: Phase 1, Phase 2

#### Objective

Replace the interim home with the benchmark leaderboard: models ranked by overall score,
per-task + per-tradition columns, token totals, over a selectable run (default most
recent). Delivers requirement 2 — the primary home experience.

#### Files to Create / Modify

- `src/routes/LeaderboardPage.tsx` (new) — the `/` page: loads the run index (Phase-1
  endpoint), selects the default (most recent by mtime, id tiebreak), loads the selected
  run via `loadRun`, renders the leaderboard; empty/error states per the spec.
- `src/components/LeaderboardTable.tsx` (new) — one row per model ranked by `_overall`
  accuracy (desc; `model_id` tiebreak; null-overall last); a column per task; overall
  column; per-tradition breakdown; per-model token totals from `usage`.
- `src/components/RunSelector.tsx` (new) — lists the enumerated runs; switching re-loads;
  a malformed/absent run surfaces a localized error without disabling the selector.
- `src/lib/leaderboard.ts` (new, replacing the deleted multibrowser one) — pure ranking /
  column-derivation / formatting helpers (reuse `rankedModels`/`summaryTasks`/`formatCell`
  from `localResults.ts`, extended for token totals and ties).
- `src/router.tsx` — point `/` at `LeaderboardPage`; retire the interim `LocalResultsPage`
  home (delete `LocalResultsPage.tsx` and the flat `LocalResults.tsx` view, folding its
  gate coverage into the leaderboard).
- `src/local/realRun.test.ts` / a new `LeaderboardPage.test.tsx` — **the committed-run
  gate, reworked onto the leaderboard**: rendering `runs/first-run-2026-10-11` shows the
  4 models ranked with claude-haiku first, the `retrieve_quote` + overall columns, the
  four traditions, and token totals.
- Docs: `apps/viewer/README.md`, `TUTORIAL.md` (≈69,119–120), `codev/resources/arch.md`
  "Viewer local results" — update the `/local-results?run=…` instructions to the new
  leaderboard (or leave `/local-results` as a redirect to `/`).

#### Deliverables

- [ ] `/` renders the leaderboard for the default (most-recent) run.
- [ ] Run selector lists all enumerated runs and switches the view.
- [ ] Per-tradition breakdown and per-model token totals render from the run.
- [ ] Tests for this phase, including the reworked committed-run gate.

#### Acceptance Criteria

- [ ] Over the committed run: claude-haiku (0.24) first, two 0.0 models last (id
      tiebreak), LDS/claude-haiku cell = 0.72, token totals present.
- [ ] Adding a `runs/<id>/` with the four artifacts appears in the selector with no
      source change (verified via the dev endpoint / a unit test over a temp runs dir).
- [ ] Empty `runs/` → informative empty state; a bad run → localized error, selector
      still usable.
- [ ] `test` + `build` + `check-types` green; provider-less.

#### Test Plan

- Component: `LeaderboardTable` ranking/ties/null-overall/token-totals from a fixture
  summary; `RunSelector` switch + error isolation.
- Integration: `LeaderboardPage` over the committed run (the gate) and over a two-run
  temp index (default = most recent).
- Manual: `pnpm dev` → `/` leaderboard; switch runs.

### Phase 4: Error explorer with roster-based missing cells

**Dependencies**: Phase 1, Phase 2, Phase 3

#### Objective

From the leaderboard, drill into any model (optionally a task/cell) and inspect every
question — answered or missing — with filters and side-by-side per-metric scores for
failures. Delivers requirement 3.

#### Files to Create / Modify

- `src/routes/ExplorerPage.tsx` (new) — route e.g. `/run/$runId/model/$modelId`
  (optionally `?task=&tradition=&correct=&mode=`): loads the run via `loadRun` (with
  roster), lists every roster question for the model with pass/fail, missing ones marked;
  failures show prompt, expected text, actual answer, and per-metric scores
  (exact/normalized/token-F1, "n/a" where the task emits none).
- `src/components/QuestionList.tsx` + `src/components/ExplorerFilters.tsx` (new) — the
  per-question list and the composing filters (task, tradition, correct/incorrect,
  failure-mode missing-cell vs wrong-answer).
- `src/components/LeaderboardTable.tsx` — make model rows/cells link into the explorer.
- `src/lib/explorer.ts` (new) — pure filter/predicate helpers over `QuestionResult[]`,
  including the missing-cell vs wrong-answer classification.
- `src/router.tsx` — register the explorer route.
- Tests: `ExplorerPage.test.tsx` / `explorer.test.ts` — filters compose; per-metric
  display incl. `null`→"n/a"; the **`missing > 0` fixture** from Phase 1 shows missing
  questions under the missing-cell filter, distinct from wrong answers; a committed-run
  drill-in (claude-haiku: 100 listed, 24 correct).

#### Deliverables

- [ ] Drill-in from the leaderboard lists all roster questions for a model with
      pass/fail, including missing ones.
- [ ] Each failure shows prompt, expected, actual answer, and emitted per-metric scores.
- [ ] Filters by task / tradition / correct-incorrect / failure-mode compose.
- [ ] Tests for this phase (filters, metrics, missing fixture, committed-run drill-in).

#### Acceptance Criteria

- [ ] claude-haiku drill-in over the committed run: 100 questions, 24 correct; a failing
      row shows all three metrics.
- [ ] The missing-cell filter over the fixture shows only un-answered roster questions
      (no answer/metrics), distinct from wrong answers.
- [ ] `test` + `build` + `check-types` green; provider-less.

#### Test Plan

- Unit: `explorer.ts` predicates and missing/wrong classification.
- Component/integration: filter composition; metric "n/a"; missing fixture; committed-run
  drill-in counts.
- Manual: `pnpm dev` → leaderboard → model → filter to a tradition's failures.

### Phase 5: Cross-run aggregate (current standings)

**Dependencies**: Phase 1, Phase 2, Phase 3, Phase 4

#### Objective

Add the "current standings" view: for each model, its most recent result across all runs,
keyed on panel `provider`+`model`, with the source run's id/date and a link to its
detail. Delivers requirement 6. Final doc + dep-prune verification sweep.

#### Files to Create / Modify

- `src/routes/StandingsPage.tsx` (new) — route e.g. `/standings`: loads **every**
  enumerated run's `summary.json` (+ `panel`), builds a `(provider,model)` → latest-run
  index (latest by mtime; `model_id` display label), renders one row per model with its
  per-task scores, source run id/date, and a link into that run's leaderboard. A run
  missing `panel` falls back to `model_id` keying rather than crashing.
- `src/lib/aggregate.ts` (new) — pure rollup: dedupe/select most-recent per
  `(provider,model)` key across runs.
- `src/routes/RootLayout.tsx` + `src/router.tsx` — add a "Standings" nav link + route.
- Tests: `aggregate.test.ts` / `StandingsPage.test.tsx` — a model re-benchmarked in a
  newer run is sourced from it; an A-only model still appears from A; a renamed
  `model_id` with matching panel dedupes to one row (newer run); a run lacking `panel`
  degrades gracefully.
- Final docs sweep: confirm `README.md`/`TUTORIAL.md`/`arch.md` describe the finished app
  (leaderboard + standings + explorer, local `runs/`); provenance in
  `README.multibrowser.md` or removed. Verify no dead dependency remains.

#### Deliverables

- [ ] `/standings` shows one row per model from its most recent run, with source run +
      link, keyed on panel provider+model.
- [ ] Renamed-id dedupe and panel-absent fallback work.
- [ ] Final docs and dependency-prune verification complete.
- [ ] Tests for this phase (aggregate rollup, dedupe, fallback).

#### Acceptance Criteria

- [ ] Two-run fixture: shared models sourced from the newer run, older-only models from
      the older; renamed-id-same-panel appears once.
- [ ] Over the committed run alone, standings == that run's leaderboard rows.
- [ ] `test` + `build` + `check-types` green; provider-less; no dead dep in
      `package.json`; docs describe this app.

#### Test Plan

- Unit: `aggregate.ts` most-recent-per-key selection, renamed-id dedupe, panel fallback.
- Component/integration: `StandingsPage` over a two-run temp index and over the committed
  run alone.
- Manual: `pnpm dev` → `/standings`; follow a row's link to its run.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Mass deletion in Phase 2 breaks a kept primitive (a `Markdown`/`ErrorBoundary` util was shared) | Medium | Medium | Delete in dependency order; `check-types` + vitest after the phase; keep only primitives with no multibrowser imports; a source-grep test for `/traditions/` imports. |
| The `#86` CSS probe is lost when reworking `deploy.test.ts` | Medium | High | Relocating/keeping it is an explicit Phase-2 deliverable and acceptance item; `noInvisibleText.test.ts` (glob-based) is a second guard. |
| Widening `joinResults` to iterate the roster changes the committed-run result count | Low | High | Committed run is `missing: 0` (roster == answered → still 400); the gate asserts it; scores-only fallback preserves the sample. |
| Run-index endpoint leaks outside `runs/` (symlink/traversal/bad encoding) | Low | High | Realpath confinement + symlink reject + try/caught decode; dedicated Phase-1 confinement tests. |
| Pruning a dependency still used by a kept module | Low | Medium | Prune only after the deletions; `check-types`/build catch a stray import; prune conservatively (keep `@tanstack/react-router`). |
| Aggregate keyed on `model_id` splits a renamed model | Medium | Medium | Key on panel `provider`+`model` (architect-binding); `model_id` is display only; fall back to `model_id` only when `panel` is absent. |
| Interim Phase-2 home (local-results view) left behind after Phase 3 | Low | Low | Phase 3 explicitly deletes `LocalResultsPage.tsx`/`LocalResults.tsx` and folds the gate into the leaderboard. |

## Documentation Updates

- `apps/viewer/README.md` — rewritten across Phases 2–3 and finalized in Phase 5 to
  describe this app (leaderboard + standings + explorer, local `runs/`, no GitHub layer).
- `apps/viewer/README.multibrowser.md` — kept as provenance or deleted (Phase 2/5).
- `TUTORIAL.md` (≈69, 119–120) and `codev/resources/arch.md` "Viewer local results" —
  updated in Phase 3 to the new pages (or `/local-results` kept as a redirect) and
  confirmed in Phase 5.
- `codev/resources/arch.md` "Viewer local results" / "Run evidence layout" — the viewer
  now consumes `questions.jsonl` as the roster; note it. (A MAINTAIN-style arch/lessons
  update is the architect's call; this plan flags the touch-point.)
- No pipeline/texts/scoring doc changes — scope is the viewer only.
