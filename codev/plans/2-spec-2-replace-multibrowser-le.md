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

- `apps/viewer/src/lib/localResults.ts` — widen the parsed model and define failure
  semantics:
  - carry per-metric scores (`exact`/`normalized`/`token_f1`) on `QuestionResult`,
    keeping the values the task emits and representing absent ones as `null` (not `0`);
  - parse `summary.json`'s `usage` (`per_model{calls,in,out}`, `total`) and `panel`
    (`provider`, `model`, `endpoint`, `served_by: string[] | null`) into the `Summary`
    type — `served_by` is nullable in the real data (`claude-haiku` → `null`);
  - the **low-level `joinResults`** takes an **optional** roster: when a roster is
    present it iterates the panel × roster and marks a `(model, question)` with no answer
    row as a **missing** result (new `missing: boolean`, absent answer+metrics); when
    absent it iterates the scores rows (back-compat for the in-memory sample only);
  - **production `loadRun` requires all four artifacts** (`summary.json`, `scores.jsonl`,
    `answers.jsonl`, `questions.jsonl`). Replace the current nullable "any non-OK ⇒ sample
    fallback" behavior with a typed result distinguishing **missing artifact** (a 404, or
    a non-JSON/HTML 200 — see the prod-host guard in Phase 2), **HTTP failure**, and
    **malformed JSON/JSONL** (which run, which line). A missing roster is a run-specific
    error here, **not** a silent fallback; the sample fallback is a page concern, not a
    loader concern.
  - add a **shape-sniffing "artifact absent" guard** (shape-sniffing is primary, not a
    `headers.get("content-type")` check): read the body via `.text()` and treat a leading
    `<` (the SPA `index.html` a static host returns 200 for an unknown path) or a
    JSON/JSONL parse failure as "artifact absent", not data. A `content-type` header is
    only an optional hint. (A header-based guard would throw on the existing bare fake
    fetchers in `realRun.test.ts`/`LocalResults.test.tsx`, which have no `headers`, and
    the dev middleware serves `.jsonl` as `text/plain` — so shape-sniffing is the robust
    mechanism. This prevents the Phase-2 prod-host crash.)
- `apps/viewer/src/routes/LocalResultsPage.tsx` (**modify** — it is the one surviving
  `loadRun` consumer and its types break under the new contract): adapt its
  `loadRun(base)` consumption to the typed result — success → render; a typed failure →
  the existing localized error (the no-`?run=` path still renders the in-memory sample,
  unchanged, so `/local-results` out-of-the-box behavior is preserved). This is the
  minimal page edit the contract change forces; no new route/nav is added.
- `apps/viewer/vite/runsEndpoint.ts` (**new, extracted — placed outside `src/`** so a
  stray client import of this node-only module cannot slip in): the run-serving logic as
  an importable factory `createRunsHandler(runsDir)` plus a pure `listRuns(runsDir)`, so
  it is unit-testable against a temp dir (the current `serveRuns` is a non-exported
  closure with a hardcoded root and cannot be tested):
  - `listRuns` returns `[{id, mtimeMs}]` for each immediate subdir containing a readable
    `summary.json`; a **nonexistent `runs/` root returns `[]`** (guard `realpathSync` so
    it does not throw) — this is the "empty state" source;
  - **harden confinement**: resolve the canonical path (`fs.realpathSync`), reject
    anything resolving outside the canonical `runs/` root or traversing a symlink, and
    wrap `decodeURIComponent` in try/catch (malformed encoding → 400, not a throw);
  - note Connect's mount semantics: `server.middlewares.use("/runs", …)` **strips** the
    `/runs` prefix, so the collection request arrives as `req.url === "/"` or
    `"/_index"` — match on that, not `"/runs/"`.
- `apps/viewer/vite.config.ts` — import and mount `createRunsHandler` from
  `./vite/runsEndpoint` (replacing the inline `serveRuns` closure); dev-only behavior
  unchanged otherwise.
- `apps/viewer/src/local/sample.ts` — add a small sample roster (so the sample still
  joins via the scores-only fallback) and a **`missing > 0` fixture** (a roster question
  with no answer row) for the explorer's missing-cell path.
- `apps/viewer/src/lib/localResults.test.ts` (new or fold into existing
  `components/LocalResults.test.tsx`) — unit tests for the widened parse/join, the
  failure-type discrimination, and the missing fixture. **Rework** the existing
  `components/LocalResults.test.tsx:57` case ("loadRun returns null when an artifact
  404s") to assert the new **typed failure** instead of the removed `null` contract.
- `apps/viewer/vite/runsEndpoint.test.ts` (new) — confinement tests against a temp
  dir: lists only subdirs with `summary.json`; rejects traversal (`../`), symlink escape,
  and malformed-percent-encoding; a nonexistent root returns `[]`. (A one-line test may
  also assert no `src/` client module imports the node-only endpoint.)
- `apps/viewer/src/local/realRun.test.ts` — extend: assert the committed run still joins
  to 400 results (its roster == answered, `missing: 0`), and that per-metric values and
  `usage`/`panel` now parse.

#### Deliverables

- [ ] `loadRun` requires all four artifacts and returns a typed result distinguishing
      missing-artifact / HTTP-failure / malformed-JSON; a non-JSON 200 (shape-sniffed) is
      treated as absent, not parsed.
- [ ] `parseSummary`/`joinResults` carry metrics, usage, panel (`served_by` nullable),
      and a roster; missing questions are representable.
- [ ] `vite/runsEndpoint.ts` is an importable factory + `listRuns(runsDir)`, hardened
      (realpath + symlink reject + safe decode), empty on a nonexistent root, and lives
      outside `src/`.
- [ ] `LocalResultsPage.tsx` adapted to the typed loader; the `LocalResults.test.tsx`
      404 case reworked to the typed failure.
- [ ] A `missing > 0` fixture exists and is exercised.
- [ ] Tests for this phase (parse/join/failure-types/missing/endpoint-confinement).

#### Acceptance Criteria

- [ ] The committed-run gate (`realRun.test.ts`) still passes with the widened model.
- [ ] `pnpm -C apps/viewer test` and `check-types` pass; `/local-results` still renders
      (adapted to the typed loader; the no-`?run=` sample path unchanged).
- [ ] **No new routes/nav** in this phase; the only page touched is the existing
      `loadRun` consumer `LocalResultsPage.tsx` (minimal adapter edit). The diff is lib +
      endpoint extraction + vite.config import + the one adapter + tests + sample.

#### Test Plan

- Unit: metrics preserved/`null` per task; `usage`/`panel` parsed (`served_by` nullable);
  roster join surfaces a missing question; scores-only fallback still works for the
  sample; `loadRun` returns the right failure type for a 404, a shape-sniffed non-JSON
  200 (body starting `<`), and a malformed JSONL line.
- Unit: `listRuns`/handler lists only subdirs with `summary.json`; rejects traversal,
  symlink escape, malformed encoding; nonexistent root → `[]` (temp-dir fixtures).
- Regression: `realRun.test.ts` (400 cells, discriminating, now with metrics) with its
  bare `diskFetcher` unchanged (shape-sniffing requires no `headers`).

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
  `test/rawFixture.ts`. **Keep** `ErrorBoundary` (used by `main.tsx`) and `Loading`
  (reused by the new async pages' loading states), plus `test/setup.ts`,
  `test/noInvisibleText.test.ts`. **Delete** `Markdown.tsx` + `Markdown.test.tsx` — after
  the purge its only consumers (`ReviewTraditionPage`/`ReviewScenarioPage`) are gone and
  no new view renders markdown (expected/answer texts are plain strings). Correspondingly
  **prune the markdown deps** `react-markdown`, `remark-gfm`, `remark-breaks`,
  `rehype-sanitize`, `@tailwindcss/typography` (per the spec's "only primitives the new
  pages reuse"). If Phase 3/4 design ends up wanting markdown, keep `Markdown` + its deps
  instead and note it — but the default is delete.
- `src/main.tsx` — **rewrite** (it currently imports `PersistQueryClientProvider`,
  `createSyncStoragePersister`, `defaultShouldDehydrateQuery`, `./lib/queryClient`, and
  `RAW_PERSIST_EXCLUDED` from `./lib/constants` — all deleted/pruned here). Reduce to
  `StrictMode > ErrorBoundary > RouterProvider`. **This is a build-breaker if omitted and
  blocks the `@tanstack/react-query` prune.**
- `src/test/renderApp.tsx` — **edit**: strip the `QueryClientProvider` /
  `@tanstack/react-query` wrapper (lines ~2, 11–18); keep the memory-history router
  render. Also blocks the query-dep prune if omitted.
- `src/router.tsx` — reduce the route tree to `/` + a catch-all 404; `/` renders the
  interim home (below); drop `parseSearch`/`stringifySearch`/`validateSearch` wiring that
  referenced deleted zod schemas.
- `src/routes/InterimHome.tsx` (**new, small**) — the interim `/` page: fetch the Phase-1
  run index, default to the most-recent run (mtime, id tiebreak), and render it via the
  retained `LocalResults` component (or an informative empty state when no run is
  present). Do **not** route `/` straight at the existing `LocalResultsPage` — that
  defaults to the synthetic sample unless `?run=` is set, so it would never show the
  committed run. (Superseded by the leaderboard in Phase 3.)
- `src/routes/RootLayout.tsx` — strip the "MultiBrowser" brand, the Results/Review nav
  links, and the "traditions on GitHub" link (which used the GitHub SHA query); keep the
  app-shell scroll behavior. Rename brand to this app.
- `src/routes/IndexPage.tsx` — delete (traditions grid gone; `/` now routes to
  `InterimHome`).
- `src/styles.css` — make the `#86` numbered-shade shim's probe **deterministic** rather
  than accidental: add a Tailwind v4 `@source inline(...)` safelist (available in
  `tailwindcss@4.3.1`) covering the semantic ramp the shim guarantees — the exact numbered
  shades the deploy-test probe asserts. Under `@theme inline`, a numbered utility is
  emitted only if the class appears in scanned content; after the purge the probed shades
  live only in deleted files, so today the probe passes **only** because Tailwind
  auto-detection scans the probe's own string literals in `deploy.test.ts` (self-seeding)
  — fragile. The safelist pins the ramp regardless of app usage. **Tradeoff to accept:** a
  safelisted ramp means the `#86` probe no longer catches "the app used a shade the shim
  doesn't define"; `noInvisibleText.test.ts` (glob-based, self-maintaining) remains the
  guard against actual invisible text.
- `src/deploy.test.ts` — rework: **drop** the tradition-baking, `public/data-raw`
  raw-tier, and `/api/*` review-proxy assertions and the `/t/...` deep-link smoke;
  **keep and relocate** the `#86` numbered-shade built-CSS probe (now backed by the
  `@source inline` safelist, with the probe list pinned to the safelisted shades); keep a
  generic **SPA-fallback** smoke (an unknown deep route serves `index.html`); keep
  `base: '/'`. The "no crash when the run endpoint is absent in prod" concern is split
  into two **executable** checks (devDeps are jsdom-only — no browser): (a) here, assert
  the static host returns `index.html`/200 for `/runs/_index` (a server-response check);
  (b) a **jsdom** render test (below) renders the home page with a fetcher returning a
  200 HTML body and asserts the empty state — exercising the Phase-1 shape-sniff guard
  without running the SPA in a browser.
- `src/routes/app.test.tsx` — rework: **drop** the GitHub-index / tradition-grid /
  rate-limit / deep-link-to-tradition tests; **keep** the in-SPA 404 test, the
  ErrorBoundary test, and an app-shell test updated to the new header.
- `server/index.mjs` — **rewrite** to a minimal **hono** static-file host with SPA
  fallback (serve `dist/`, fall back to `index.html` for unknown routes); remove the
  `/api/*` reverse proxy. **Decision: keep `hono`/`@hono/node-server`** for this minimal
  host (no new dep, and `start` stays `node server/index.mjs`). Update `deploy.test.ts`'s
  `start`-command assertion accordingly.
- **Delete** `scripts/bake-and-deploy.sh` (the raw-tier bake is gone); update
  `railway.json` / `.railwayignore` to drop the bake step and the `public/data-raw`
  reference.
- `apps/viewer/package.json` — prune dependencies used **only** by the removed surface:
  `js-yaml`, `@types/js-yaml`, `zod`, `@tanstack/react-query`,
  `@tanstack/react-query-persist-client`, `@tanstack/query-sync-storage-persister`. **Keep**
  `@tanstack/react-router`, `hono`, `@hono/node-server`, and the HeroUI/Tailwind/react
  stack. Regenerate `pnpm-lock.yaml`. Verify nothing kept imports a removed dep
  (`check-types` + build).
- `.gitignore` (viewer) — drop the `public/data-raw/` entry (bake gone).
- Docs: `apps/viewer/README.md` (describe the interim state / remove the "seed" framing
  for removed surfaces); note in `TUTORIAL.md`/`codev/resources/arch.md` that the
  `/t`·`/results`·`/review` surface is gone (the `/local-results`→leaderboard wording
  lands in Phase 3). Move/trim `README.multibrowser.md` as provenance or delete.

> **Note on URL search-param validation:** `zod` is pruned here, but Phase 4's explorer
> needs `?task=&tradition=&correct=&mode=` search state. The explorer uses a **plain
> validator function** (TanStack Router's `validateSearch` accepts one) — do **not**
> re-add `zod`.

> **Atomicity note:** this phase is large (~70 deletions + two test-suite rewrites +
> server reduction + dep prune + docs). It remains one plan phase / one logical change,
> but the builder may land it as two internal commits — (2a) source deletions +
> `router`/`RootLayout`/`main`/`renderApp`/`InterimHome`/`styles.css`; (2b)
> server/deploy-test/package.json/docs — each independently green, if that makes the diff
> more reviewable.

#### Deliverables

- [ ] No purged route/module/component remains under `apps/viewer/src`; no
      `from '…/traditions/'` import in source; `main.tsx` and `test/renderApp.tsx` no
      longer import any removed module.
- [ ] `router.tsx` serves only `/` (`InterimHome`) + 404; `RootLayout` nav has no
      multibrowser links.
- [ ] `deploy.test.ts`/`app.test.tsx` reworked; the `#86` CSS probe (safelist-backed) and
      an SPA-fallback smoke survive; the built-app empty-state-not-crash guard is added.
- [ ] `server/index.mjs` is a minimal hono static+fallback host (no `/api` proxy);
      `scripts/bake-and-deploy.sh` deleted.
- [ ] `Markdown` deleted and the markdown deps (`react-markdown`/`remark-gfm`/
      `remark-breaks`/`rehype-sanitize`/`@tailwindcss/typography`) pruned unless a new
      view needs markdown; `Loading` kept only if the new pages use it.
- [ ] Dead dependencies pruned from `package.json`; `pnpm-lock.yaml` regenerated;
      build + `check-types` pass.
- [ ] Tests for this phase (the reworked deploy/app/shell tests + a jsdom
      home-renders-empty-state-on-HTML-200 test).

#### Acceptance Criteria

- [ ] `pnpm -C apps/viewer test` green; `pnpm -C apps/viewer build` green; `check-types`
      passes.
- [ ] Built bundle contains no `JLS-\d{3}`, `BZ-\d{3}`, or `al-jalīs`.
- [ ] `/` renders the most-recent run via `InterimHome` (the committed run when it is the
      only one), **not** the synthetic sample; an empty `runs/` shows the empty state;
      404 works.
- [ ] Prod-host robustness is proven by two executable checks: the static host returns
      `index.html`/200 for `/runs/_index` (server check), and a jsdom render of the home
      page with a 200-HTML fetcher shows the empty state (not a crash).
- [ ] HeroUI stays provider-less; the `styles.css` shade shim is intact and the `#86`
      probe passes against the real built CSS.

#### Test Plan

- The reworked `deploy.test.ts`: real build has no `data-raw`, bundle has no corpus ids,
  `#86` probe passes against real CSS (safelist-backed), SPA fallback serves `index.html`
  for a deep route, and the static host returns `index.html`/200 for `/runs/_index`.
- A jsdom test: the home page, given a fetcher that returns a 200 HTML body for the run
  index, renders the empty state (no crash) — the prod-host robustness check.
- The reworked `app.test.tsx`: 404 renders, ErrorBoundary catches, shell header renders.
- Manual: `pnpm dev` → `/` shows the committed run (most-recent); deleted routes 404.
- A source grep (in a test or the deploy test) asserts no `/traditions/` imports remain.

### Phase 3: Leaderboard home + run selector

**Dependencies**: Phase 1, Phase 2

#### Objective

Replace the interim home with the benchmark leaderboard: models ranked by overall score,
per-task + per-tradition columns, token totals, over a selectable run (default most
recent). Delivers requirement 2 — the primary home experience.

#### Files to Create / Modify

- `src/routes/LeaderboardPage.tsx` (new) — the `/` page: loads the run index (Phase-1
  endpoint), reads the selected run from the **validated `?run=<encoded-id>` search
  param** (default = most recent by mtime, id tiebreak, when absent), loads the selected
  run via `loadRun`, renders the leaderboard; empty/error states per the spec. A
  **stale-request guard** (the existing `live` flag pattern in `LocalResultsPage`)
  ensures rapid run switching cannot let an earlier load overwrite the current selection.
- **Run-selection URL contract:** the selected run lives in the URL as a **bare run id**,
  `/?run=<encodeURIComponent(id)>` (validated via a plain validator, not `zod`), so it is
  shareable and survives refresh; the selector reads and writes it; Phase 4/5 links target
  this same contract. The page resolves the id to the fetch base `/runs/${id}` before
  `loadRun`. This **changes** the old Spec-1 semantics (`?run=/runs/<id>`, a full base
  path, documented in `TUTORIAL.md`/arch.md): an old-style value that is not a known run
  id falls back to the default (most-recent) rather than erroring. Update the docs to the
  new id form.
- `src/components/LeaderboardTable.tsx` (new) — one row per model ranked by `_overall`
  accuracy (desc; `model_id` tiebreak; null-overall last); a column per task; overall
  column; per-tradition breakdown; per-model token totals from `usage`.
- `src/components/RunSelector.tsx` (new) — lists the enumerated runs; switching updates
  `?run=`; a malformed/absent selected run surfaces a localized error without disabling
  the selector or dropping the other runs.
- `src/lib/leaderboard.ts` (new, replacing the deleted multibrowser one) — pure ranking /
  column-derivation / formatting helpers (reuse `rankedModels`/`summaryTasks`/`formatCell`
  from `localResults.ts`, extended for token totals and ties).
- `src/router.tsx` — point `/` at `LeaderboardPage` with the `?run=` `validateSearch`;
  retire the interim home (**delete** `InterimHome.tsx`, `routes/LocalResultsPage.tsx`,
  `components/LocalResults.tsx`, and `components/LocalResults.test.tsx`, folding the gate
  coverage into the leaderboard test).
- `src/local/realRun.test.ts` / a new `LeaderboardPage.test.tsx` — **the committed-run
  gate, reworked onto the leaderboard**: rendering `runs/first-run-2026-10-11` shows the
  4 models ranked with claude-haiku first, the `retrieve_quote` + overall columns, the
  four traditions, and token totals.
- Docs: `apps/viewer/README.md`, `TUTORIAL.md` (≈69,119–120), `codev/resources/arch.md`
  "Viewer local results" — update the `/local-results?run=…` instructions to the new
  leaderboard `/?run=…` contract (or leave `/local-results` as a redirect to `/`).

#### Deliverables

- [ ] `/` renders the leaderboard for the selected run (`?run=`), defaulting to the
      most-recent when absent.
- [ ] Run selector lists all enumerated runs, switches the view via `?run=`, and the
      selection is shareable / refresh-safe; a stale load cannot overwrite the current one.
- [ ] Per-tradition breakdown and per-model token totals render from the run.
- [ ] Tests for this phase, including the reworked committed-run gate and a rapid-switch
      (stale-request) test.

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

- `src/routes/ExplorerPage.tsx` (new) — route e.g. `/run/$runId/model/$modelId` with
  `?task=&tradition=&correct=&mode=` search state validated by a **plain validator
  function** (TanStack Router's `validateSearch` accepts one — do **not** re-add `zod`,
  pruned in Phase 2): loads the run via `loadRun` (with roster), lists every roster
  question for the model with pass/fail, missing ones marked; failures show prompt,
  expected text, actual answer, and per-metric scores (exact/normalized/token-F1, "n/a"
  where the task emits none). A "back to leaderboard" link targets `/?run=<runId>` (the
  Phase-3 contract).
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
  per-task scores, source run id/date, and a link into that run's leaderboard via the
  `/?run=<id>` contract. A run missing `panel` falls back to `model_id` keying rather
  than crashing.
- `src/lib/aggregate.ts` (new) — pure rollup: dedupe/select most-recent per
  `(provider,model)` key across runs.
- `src/routes/RootLayout.tsx` + `src/router.tsx` — add a "Standings" nav link + route.
- Tests: `aggregate.test.ts` / `StandingsPage.test.tsx` — a model re-benchmarked in a
  newer run is sourced from it; an A-only model still appears from A; a renamed
  `model_id` with matching panel dedupes to one row (newer run); a run lacking `panel`
  degrades gracefully.
- Final docs sweep: confirm `README.md`/`TUTORIAL.md`/`arch.md` describe the finished app
  (leaderboard + standings + explorer, local `runs/`); provenance in
  `README.multibrowser.md` or removed. **Also update `codev/resources/arch-critical.md`**
  — its always-on HOT-tier bullet still calls `apps/viewer/` a "seed port of multibench's
  multibrowser … not yet adapted", which would leave future agents with stale guidance;
  correct that one bullet to describe the adapted viewer (keep the HOT-tier cap — edit the
  existing bullet, do not add new ones). Verify no dead dependency remains (incl. the
  markdown deps pruned in Phase 2).

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
| Mass deletion in Phase 2 breaks the build via a file that imports a deleted module (`main.tsx`, `test/renderApp.tsx`) | High | High | Both are named explicit Phase-2 edits (rewrite `main.tsx`; strip the query wrapper from `renderApp.tsx`); `check-types` + build after the phase catch any stray import; delete in dependency order. |
| The `#86` CSS probe is **fragile** — after the purge the probed shades live only in deleted files, so today it passes only by Tailwind auto-detection self-seeding from the probe's own string literals in `deploy.test.ts` (accidental, not by design) | Medium | High | Phase 2 adds an `@source inline(...)` safelist in `styles.css` for the shim's ramp and pins the probe to the safelisted shades, making it deterministic; tradeoff accepted (it no longer catches an app shade the shim lacks); `noInvisibleText.test.ts` (glob-based) remains the invisible-text guard. |
| Deployed static host returns HTTP 200 HTML for `/runs/_index` (dev-only endpoint absent in prod), so `loadRun` parses HTML and crashes instead of showing the empty state | Medium | High | Phase-1 content-type/JSON-shape guard treats a non-JSON 200 as "artifact absent"; Phase-2 prod-smoke asserts the served app shows the empty state, not a crash. |
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
- `codev/resources/arch-critical.md` (Phase 5) — correct the always-on bullet that still
  calls `apps/viewer/` a not-yet-adapted multibrowser seed; edit in place within the
  HOT-tier cap.
- The `?run=` URL semantics change (bare id, not a base path) — reflected in
  `TUTORIAL.md` and arch.md's viewer section in Phase 3.
- No pipeline/texts/scoring doc changes — scope is the viewer only.
