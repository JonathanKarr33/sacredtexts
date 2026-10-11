# Specification: Sacredtexts viewer — leaderboard + error explorer (purge multibrowser leftovers)

<!--
SPEC vs PLAN BOUNDARY:
This spec defines WHAT and WHY. The plan defines HOW and WHEN.
Keep implementation phases, file paths, code, and "first we will… then we will…"
out of the spec — those belong in codev/plans/2-*.md.
-->

## Problem Statement

`apps/viewer/` is still, in all but one page, multibench's **multibrowser** SPA —
a client-side explorer of *traditions / scenarios / pressures / review flows* read
live from GitHub. Spec 1 ported it verbatim as a seed and bolted on a single
sacredtexts-specific page (`/local-results`) that renders a benchmark run's
`summary.json` + `scores.jsonl` + `answers.jsonl`.

The result is a viewer whose home page, navigation, and the bulk of its code serve a
*different product*. A person who opens the viewer to understand **this** benchmark —
which models retrieve sacred text correctly, and where they fail — lands instead on an
empty "Traditions" grid backed by a GitHub data layer that has nothing to show, with
the one relevant page reachable only by typing `/local-results`.

The human wants a viewer that is **specific to this benchmark and nothing else**: a
leaderboard as the home page, an error explorer to drill into any model's failures, and
a cross-run "current standings" view that rolls each model's most recent result up
across runs. Everything that served multibrowser's domain should be gone, not merely
hidden.

Who is affected: the benchmark's authors and reviewers (the primary audience), who run
the pipeline locally and need to read the evidence a run produced; and future
builders, for whom the dead multibrowser code is a large, misleading maintenance
surface (every `codev update` / test run drags it along, and its tests assert behavior
this product does not have).

## Current State

The viewer (`apps/viewer/`, Vite / React 19 / TS / Tailwind 4 / HeroUI v3 /
TanStack Router+Query) exposes these routes:

- `/` — **IndexPage**: a grid of "Traditions" + an "Explorers" list, read from GitHub.
- `/t/$traditionId`, `/t/$traditionId/$scenarioId` — scenario browser.
- `/results`, `/results/$runId/$groupId/$itemId`, `/raw/$runId` — multibrowser's
  GitHub-data-layer results / raw A-B comparison views.
- `/review`, `/review/$traditionId`, `/review/$traditionId/$scenarioId` — expert
  review/validation workspace (local intake, optional review API via an edge proxy).
- `/local-results` — **the one adapted page** (Spec 1, Phase 7): local-only, reads a
  run's artifacts, renders a per-model × task accuracy table, an optional
  by-tradition table, and a flat per-question list (✓/✗, prompt, answer, expected).
  Independent of the GitHub data layer.

Supporting code splits cleanly in two:

- **Multibrowser domain / GitHub data layer** (to purge): `lib/github.ts`,
  `queries.ts`, `queryClient.ts`, `constants.ts`, `rateLimit.ts`, `corpus.ts`,
  `identity.ts`, `model.ts`, `parse.ts`, `filtering.ts`, `leaderboard.ts`,
  `results*.ts`, `raw*.ts`, `review*.ts`, `scoreColor.ts`, `rampColor.ts`,
  `searchParams.ts`, and components `TraditionCard/Header`, `Scenario*`, `Review*`,
  `RateLimitBanner`, `RawComparison/Presets`, `CorpusContext`, `TaxonomyAxes`,
  `FilterBar`, `Collapsible`, `Notice`, plus the test scaffolding
  (`test/fakeRepo.ts`, `test/rawFixture.ts`) and their tests.
- **Genuinely generic primitives** (keep where reused): `ErrorBoundary`, `Loading`,
  `Markdown`, and the root app shell (`main.tsx`, `router.tsx`, `RootLayout.tsx`,
  `NotFound.tsx`, `styles.css`, `test/setup.ts`, `test/renderApp.tsx`). The
  `src/styles.css` HeroUI numbered-shade shim (the `#86` scar) is load-bearing.
- **The local-results seam** (the starting point to rebuild on): `lib/localResults.ts`
  (`loadRun`, `parseSummary`, `joinResults`, ranking/formatting helpers),
  `components/LocalResults.tsx`, `routes/LocalResultsPage.tsx`, `local/sample.ts`, and
  the two gate tests `components/LocalResults.test.tsx` and `local/realRun.test.ts`.

The dev server exposes the (gitignored) repo `runs/` directory at `/runs/` via a
dev-only Vite middleware (`serveRuns` in `vite.config.ts`) that serves **individual
files** with a lexical `startsWith(runsDir + sep)` path check — there is **no
run-index / directory-listing** endpoint, so nothing can today answer "what runs
exist?".

`loadRun` currently keeps only each question's `correct` flag from `scores.jsonl`; it
discards the per-metric `exact` / `normalized` / `token_f1` values and does not read
`summary.json`'s `usage` (token totals) or `panel` (provider) blocks. Its
`joinResults` iterates the **scores** rows, so a question with no answer row never
appears.

`deploy.test.ts` and `routes/app.test.tsx` assert multibrowser behavior: tradition-data
baking, the `public/data-raw` raw tier, the edge-server `/api/*` review proxy, deep
links like `/t/sunni-islam/JLS-001`, and — importantly — the **`#86` numbered-shade
built-CSS probe** (the only guard against the invisible-text scar) lives *inside*
`deploy.test.ts`. The README still opens "seeded from multibench's multibrowser" and
`README.multibrowser.md` holds the upstream provenance. `TUTORIAL.md` (≈lines 69,
119–120) and `codev/resources/arch.md` ("Viewer local results") document
`/local-results?run=/runs/<id>`.

Committed evidence: `runs/first-run-2026-10-11/` (4 models × 100 `retrieve_quote`), the
only run tracked in git (`runs/*` is gitignored with a `!runs/first-run-2026-10-11/`
exception). A local-only `runs/opus-run-2026-10-11/` also exists on the human's
machine. The run data model, confirmed against the committed artifacts and
`pipelines/sacredbench/score.py`:

- `summary.json`: `models{ modelId → { task → Cell, "_overall" → Cell } }`,
  `by_tradition{ modelId → { tradition → { task → Cell, "_overall" → Cell } } }`,
  `usage{ per_model{ modelId → {calls,in,out} }, total{calls,in,out} }`,
  `panel{ modelId → {provider, model, endpoint, served_by} }`.
  `Cell = {n, accuracy, exact?, normalized?, token_f1?, expected_n, missing}`; only
  **per-task** cells carry the similarity sub-metrics, and only for the tasks that emit
  them (below). `_overall` cells carry none.
- `scores.jsonl` rows: `{question_id, model_id, task, metrics{…, correct}}`, where the
  sub-metrics present depend on the task (`_SUBMETRICS` in `score.py`):
  `retrieve_quote` / `complete_unit` → `exact, normalized, token_f1`;
  `identify_version` → `exact, normalized`; other tasks → `correct` only.
- `answers.jsonl` rows: `{question_id, model_id, model, task, answer, usage, …,
  question{prompt, expected{text|citation|…}, source{tradition[], work, version,
  citation, …}}}` — **only present for answered questions.**
- `questions.jsonl` (shipped with the run): the full question roster —
  `{id, task, prompt, expected{…}, source{tradition[], work, version, citation, …}}` —
  the authoritative list of *which* questions exist, independent of which were answered.
  `score.py` builds the panel × roster from this file to compute each cell's
  `expected_n` / `missing`.

## Desired State

Opening the viewer (`pnpm -C apps/viewer dev`, then `/`) shows a **leaderboard for this
benchmark** and nothing from multibrowser:

- **Home = leaderboard.** Models ranked by overall score, with per-task and
  per-tradition columns and token totals, over a selected run. A run selector lets the
  user switch between the runs present under `runs/`; the default is the most recent.
  Any `runs/<id>/` with a readable `summary.json` (+ `scores.jsonl` + `answers.jsonl` +
  `questions.jsonl`) is picked up with **no code change** — adding a run is a data
  operation.
- **Cross-run aggregate ("current standings").** A view/table that shows, for each
  model, its **most recent** result across all runs — one row per model taken from the
  latest run that includes that model, with its per-task scores and the run id/date it
  came from, linking into that run's leaderboard/detail. Models benchmarked at
  different times in different runs are rolled up into one standings table. **Model
  identity for this rollup keys on the panel's `provider` + `model` slug** (from
  `summary.json.panel`), not the free-text `model_id`, so a renamed id does not split a
  model's history. This view loads **every** run's `summary.json` + `panel`, not only
  the selected one.
- **Error explorer.** From the leaderboard, the user drills into any model (and
  optionally a specific task/cell) and sees every question for that model — answered or
  not — with a pass/fail mark; for each failure, the prompt, the expected text, the
  model's actual answer, and the per-metric scores the task emits (shown side by side,
  with "n/a" for a metric a task does not emit). The list is filterable by **task**,
  **tradition**, **correct/incorrect**, and **failure mode** (missing cell — the model
  produced no answer for a question that exists in the roster — vs wrong answer).
- **Local-only, no GitHub data layer.** The data source stays the local `runs/`
  directory read through the existing `loadRun` seam; there is no unauthenticated
  GitHub fetching, no rate-limit handling, no review API.
- **The multibrowser surface is gone.** The scenario browser, GitHub-data results/raw
  views, and review flows — routes, components, libs, test scaffolding, and
  now-unreferenced dependencies — are removed. Only generic primitives that the new
  pages actually reuse remain.
- **Green and honest.** vitest passes; the gate that renders the committed
  `runs/first-run-2026-10-11` end-to-end still passes (reworked onto the new pages, not
  deleted); the `#86` numbered-shade built-CSS probe survives the deploy-test rework;
  `apps/viewer/README.md`, `TUTORIAL.md`, and `codev/resources/arch.md` describe *this*
  app (multibrowser provenance moved to `README.multibrowser.md` or deleted); HeroUI v3
  stays provider-less.

The concrete improvement: the viewer answers the benchmark's actual questions — *which
model is best overall, where exactly does each one fail, and what are the current
standings across runs?* — on first load, from local run evidence, with the dead
product's code no longer present.

## Success Criteria

- [ ] `/` renders a leaderboard: one row per model, ranked by overall `accuracy`
      (descending; ties broken by `model_id` ascending; models with no overall data
      sort last), with a column per task, an overall column, per-tradition breakdown,
      and per-model token totals (in / out / calls) sourced from `summary.json`'s
      `usage`.
- [ ] A run selector on the home page lists every `runs/<id>/` that has a readable
      `summary.json`; selecting one re-renders the leaderboard for that run; the default
      selection is the most recent run (by directory mtime, `id` as tiebreaker), and the
      committed `first-run-2026-10-11` appears whenever it is present.
- [ ] Adding a new `runs/<id>/` directory (with `summary.json` + `scores.jsonl` +
      `answers.jsonl` + `questions.jsonl`) makes it appear in the selector with **no
      source change** — the `runs/opus-run-2026-10-11` case works on a machine where it
      is present.
- [ ] A cross-run **aggregate / current-standings** view renders one row per model,
      each taken from the **most recent run that includes that model**, showing that
      model's per-task scores, the source run's id/date, and a link into that run's
      leaderboard/detail. Model identity is keyed on `panel.provider` + `panel.model`
      (not `model_id`), so the same model under a renamed id appears once; a model
      present only in an older run still appears, sourced from that run.
- [ ] From the leaderboard the user can drill into any model into an error explorer
      that lists every question in the run's roster for that model with a pass/fail
      mark, including questions the model did not answer (reconstructed from
      `questions.jsonl` × the run's model panel).
- [ ] For each failing question the explorer shows, side by side: the prompt, the
      expected text, the model's actual answer, and the per-metric scores the task emits
      (`exact`/`normalized`/`token_f1` for `retrieve_quote`/`complete_unit`;
      `exact`/`normalized` for `identify_version`; "n/a" where a task emits none).
- [ ] The explorer can be filtered by task, by tradition, by correct/incorrect, and by
      failure mode (missing cell vs wrong answer), and the filters compose. The
      missing-cell path is demonstrable (the committed run has `missing: 0`, so a
      sample/fixture run with `missing > 0` exercises it).
- [ ] None of the purged surface remains in `apps/viewer/src`: no legacy route
      (`/t/*`, `/results*`, `/raw/*`, `/review*`) and no multibrowser module/component
      from the Current State purge list; the built bundle contains none of the
      multibrowser corpus/scenario identifiers it bakes today — specifically no
      `from '…/traditions/'` imports in source, and no `JLS-\d{3}`, `BZ-\d{3}`, or
      `al-jalīs` in `dist/assets`. (Tradition **names** carried in run data — e.g.
      `src/local/sample.ts`'s `tradition: ["Protestant Christian"]` — are legitimate
      benchmark data, not multibrowser identifiers.)
- [ ] Dependencies used **only** by the removed surface are pruned from
      `apps/viewer/package.json` (candidates: `js-yaml`, `zod`, the TanStack Query
      persisters, and — per the deploy decision — `hono`/`@hono/node-server`); after the
      purge no kept source imports a removed dependency, and the build/`check-types`
      pass.
- [ ] `pnpm -C apps/viewer test` is green, including (a) a gate test that loads and
      renders the committed `runs/first-run-2026-10-11` through the new leaderboard +
      explorer, and (b) the `#86` numbered-shade built-CSS probe (kept, wherever the
      deploy-test rework relocates it).
- [ ] `apps/viewer/README.md` describes this benchmark viewer; `TUTORIAL.md` and
      `codev/resources/arch.md`'s "Viewer local results" section no longer point users
      at a removed `/local-results` route (updated to the new pages, or the route kept
      as a redirect); multibrowser provenance is in `README.multibrowser.md` or removed.
- [ ] HeroUI v3 remains provider-less (no v2-era provider added); `check-types` passes.

## Constraints

**Fixed requirements from the human (Issue #2, 2026-10-11) — copied verbatim; treated
as settled; not relitigated in Solution Approaches:**

1. **Purge the multibrowser leftovers.** Remove the scenario browser (`/t/...`), the
   GitHub-data-layer results (`/results`, `/raw`), the review flows (`/review*`), and
   their components (TraditionCard, Scenario*, Review*, RateLimitBanner, RawComparison,
   CorpusContext, …) — everything not serving this benchmark. Keep only genuinely
   generic primitives if reused (ErrorBoundary, Loading, Markdown).
2. **Home page = leaderboard.** `/` lists every run under `runs/` (dev server already
   serves it): models ranked by overall score, per-task and per-tradition columns,
   token totals. Run selector for multiple runs; sensible default = most recent.
3. **Error explorer.** From the leaderboard, drill into any model/cell: list every
   question with pass/fail, and for each failure show the prompt, the expected text, the
   model's actual answer, and the per-metric scores (exact/normalized/token-F1) side by
   side. Filter by task, tradition, correct/incorrect, and failure mode (missing cell
   vs wrong answer).
4. **Local-only remains fine** (no GitHub data layer). The existing `/local-results`
   loader (`loadRun`) is the starting seam; its gate test rendering the committed run
   must keep passing (rework it to the new pages).
5. **Keep HeroUI v3** (provider-less); **keep vitest green**; update
   `apps/viewer/README.md` to describe THIS app (move multibrowser provenance to
   `README.multibrowser.md` or delete).
6. **Cross-run aggregate view**: a page/table that shows, for each LLM, its **most
   recent** result across all runs — one row per model, taken from the latest run that
   includes that model (per-task scores + the run id/date it came from, linking to that
   run's detail). This is the 'current standings' view when models are benchmarked at
   different times in different runs.

**Architect clarification (2026-10-11), binding on requirement 6:** model identity for
the aggregate rollup keys on the **panel's `provider` + `model`** (the `panel` block in
`summary.json`), **not** the free-text `model_id`, so renamed ids do not split a model's
history.

**Settled design decisions (resolved in this spec; see Solution Approaches for
rationale):**

- **Run discovery** = Approach 1: a dev-only directory-listing endpoint extending
  `serveRuns`, returning the run ids that contain a `summary.json`. No committed
  manifest.
- **"Most recent" ordering** = directory mtime, with run id as a stable tiebreaker.
- **Deploy** = keep a **plain static SPA host** (SPA fallback only; the `/api/*` review
  proxy and the `public/data-raw` bake are removed with the rest of multibrowser).
  `deploy.test.ts` is reworked to the new app: drop the tradition-baking / raw-tier /
  review-proxy assertions; keep an SPA-fallback smoke and the `#86` built-CSS probe.
- **Path confinement** for the run endpoint = canonical-path (`realpath`) containment
  within `runs/` **plus** symlink rejection, with safe (try/caught) URL decoding — not
  the lexical `startsWith` check alone.

**Other constraints:**

- Stack is fixed: Vite / React 19 / TS / Tailwind 4 / HeroUI v3 / TanStack
  Router+Query. The `src/styles.css` HeroUI numbered-shade shim is load-bearing (the
  `#86` scar) — do not regress it.
- The run data model is an external contract owned by `pipelines/sacredbench score`
  (see Current State). The viewer consumes it; it does not define it. Derive behavior
  from the **real** committed artifacts, not from docs.
- `runs/*` is gitignored except the committed `first-run-2026-10-11`; the viewer must
  degrade gracefully when only that run (or none) is present.
- The dev-only `serveRuns` middleware is the local data transport; the run-enumeration
  mechanism must stay dev/local-only and confined to the repo `runs/` directory (no new
  network data layer).
- Scope is the viewer only. The pipeline, texts, and scoring contract are untouched.

## Assumptions

- The audience runs the viewer locally against `runs/` they generated; a public
  production deploy of run evidence is **not** a goal of this spec (the committed run is
  the one guaranteed-present dataset, and `runs/` is otherwise gitignored).
- `summary.json` is the source of truth for the leaderboard aggregates (accuracy,
  by-tradition, usage, panel). The explorer joins `scores.jsonl` (per-metric
  correctness) with `answers.jsonl` (prompt/answer/expected/tradition) on
  `(question_id, model_id)`, and overlays `questions.jsonl` (the roster) to surface
  questions a model did not answer.
- **"Missing cell" is per-question-derivable only with `questions.jsonl`.** `score.py`
  emits score/answer rows only for answered questions; `summary.json`'s cell `missing`
  gives a *count*, not identities. The roster (`questions.jsonl`) × the run's model
  panel yields the exact set of (model, question) pairs with no answer. The committed
  run has `missing: 0` everywhere, so the missing-cell path is demonstrated via a
  fixture/sample, not the real run.
- Per-task similarity metrics are not uniform: `retrieve_quote`/`complete_unit` emit
  `exact`/`normalized`/`token_f1`; `identify_version` emits `exact`/`normalized`; other
  tasks emit none. `_overall` cells carry no sub-metrics. The explorer shows "n/a" for a
  metric a task does not emit.
- Phase-1 runs currently contain a single task (`retrieve_quote`); the leaderboard,
  aggregate, and explorer must still be written to handle multiple tasks and traditions
  generically (the data model already supports them).
- `tradition` is a list per question (texts can be shared); per-tradition tallies count
  an observation once per listed tradition, matching the pipeline's `by_tradition`.
- Each run's `summary.json` includes a `panel` block (present in the committed run); the
  aggregate rollup depends on it. A run missing `panel` degrades the aggregate for its
  models (keyed on `model_id` as a fallback) rather than crashing.

## Solution Approaches

The *what* (leaderboard home + cross-run aggregate + error explorer, multibrowser
purged, local-only) is fixed by the Constraints. The open design space was in three
areas; each is resolved below.

### Approach 1: Run discovery — dev directory-listing endpoint (CHOSEN)

Extend the dev-only `serveRuns` middleware so a request for the `runs/` collection
(rather than a single file) returns a JSON list of run ids that contain a
`summary.json`. The home page fetches this list, picks the most recent (mtime, id
tiebreak) as default, and loads the selected run through `loadRun`; the aggregate view
fetches each listed run's `summary.json`.

- **Pros:** satisfies "picks up any `runs/<id>` with no code change" exactly; no
  committed index to drift; stays local/dev-only, matching the no-GitHub constraint;
  minimal new surface (one endpoint).
- **Cons:** enumeration works only under the dev server (acceptable — local-only is a
  stated constraint).
- **Risk/complexity:** low, but the confinement must be hardened beyond the current
  lexical check: resolve the canonical path and reject anything that escapes `runs/` or
  traverses a symlink, and decode the URL inside a try/catch. Unit-tested against a temp
  dir including a traversal (`../`) and a symlink-escape attempt.

### Approach 2: Run discovery — committed `runs/index.json` manifest (REJECTED)

Commit/generate a manifest the home page reads.

- **Pros:** works without the dev middleware (e.g. a future static deploy).
- **Cons:** violates "no code/data change to add a run" unless regenerated each time;
  drifts from reality; `runs/*` is gitignored, so a committed manifest would list runs
  absent on another machine. Rejected as primary.
- **Risk/complexity:** low mechanically, high correctness risk (drift).

### Approach 3: Rebuild on the `localResults` seam vs. rewrite (seam CHOSEN)

Extend the proven seam: widen the parsed model to carry per-metric scores, `usage`,
`panel`, and a roster (`questions.jsonl`) so missing questions can be listed; build the
leaderboard, aggregate, and explorer as new pages/components on top; retire the single
flat `LocalResults` view.

- **Pros:** preserves the tested parsing + the committed-run gate; smallest correctness
  risk; the `(question_id, model_id)` join is reused, not re-derived.
- **Cons:** the `QuestionResult`/`Cell`/`Summary` shapes need widening (metrics, usage,
  panel, roster/missing) and `joinResults` must iterate the roster, not just the scores
  rows — contained changes.
- **Alternative (rejected):** discard `localResults.ts` and re-parse from scratch —
  throws away tested code and the gate's seam for no benefit.

**Aggregate data shape (requirement 6).** The aggregate view loads every listed run's
`summary.json` (not just the selected run), builds a per-run `(provider, model)` →
cell-set index from each `panel`, and for each distinct `(provider, model)` key selects
the row from the run with the latest mtime that contains it. The row carries that run's
per-task scores and a link to its detail. `model_id` is the display label; the
`(provider, model)` pair is the dedupe/rollup key.

**Deploy (sub-decision, CHOSEN).** Removing the GitHub data layer and review API makes
the edge-server `/api/*` proxy and the `public/data-raw` bake dead. Keep a plain static
SPA host (SPA fallback only) and rework `deploy.test.ts`: drop the tradition-baking,
raw-tier, and review-proxy assertions; keep an SPA-fallback smoke and **relocate/keep
the `#86` numbered-shade built-CSS probe** (the invisible-text guard). Whether the
static host stays on `hono` (minus the proxy) or a simpler server is a plan-level
detail; `hono`'s retention from `package.json` follows that choice.

## Open Questions

- **Nice-to-know** — *Surfacing `panel` provider metadata on the leaderboard.* The
  `panel` block has provider / model-slug / serving-host per model (and the aggregate
  already keys on it). Worth showing on the leaderboard or a run-detail header? Low
  priority; data is present if wanted.
- **Nice-to-know** — *Similarity-metric presentation.* Whether per-metric scores show as
  raw numbers, bars, or color ramps in the explorer. Presentation only.
- **Nice-to-know** — *Aggregate tie / same-mtime handling.* If two runs share an mtime
  and both include a model, the id tiebreak applies; whether to surface that a model's
  standings are "stale" relative to the newest run overall is cosmetic.

## Test Scenarios

**Happy paths**

- Home page over the committed run renders one leaderboard row per model
  (`claude-haiku`, `gemma-3-4b`, `gpt-oss-20b`, `llama-3.1-8b`), ranked with
  `claude-haiku` (0.24 overall) first and the two 0.0 models last (id tiebreak), with
  the `retrieve_quote` column, an overall column, and per-model token totals.
- The per-tradition breakdown shows the four traditions (Judaism, Protestant Christian,
  Roman Catholic, LDS) with their per-model accuracies (e.g. claude-haiku / LDS = 0.72).
- Drilling into `claude-haiku` lists 100 questions with 24 marked correct; each failing
  question shows prompt, expected text, actual answer, and exact/normalized/token-F1.
- Filtering the explorer to tradition = "Protestant Christian" + incorrect shows only
  that tradition's failures; adding task = `retrieve_quote` leaves them (single task);
  clearing filters restores the full list.
- The run selector lists `first-run-2026-10-11` (and any other present run); switching
  runs re-renders the leaderboard and explorer against the newly selected run.
- The aggregate view, given two runs where run B (newer mtime) re-benchmarks a subset of
  run A's models, shows each model once: the shared models sourced from B, the
  A-only models sourced from A, each row naming its source run and linking to it.
- The aggregate dedupes a model whose `model_id` was renamed between two runs but whose
  `panel.provider`+`panel.model` match — it appears once, from the newer run.

**Edge cases**

- Only the committed run present → it is the default and the sole selector entry, and
  the aggregate equals that run's leaderboard.
- A fixture run whose `summary.json` has a cell with `missing > 0` / `n < expected_n`,
  and a `questions.jsonl` roster → the un-answered questions are listed in the explorer
  under the "missing cell" failure mode with no answer/metrics, distinct from answered
  wrong answers.
- A model with `null` overall accuracy sorts last and formats as "n/a" rather than
  crashing.
- Multiple tasks / a run with `by_tradition` absent → leaderboard still renders (task
  columns from the data; by-tradition section omitted gracefully).
- A run missing `panel` → its models fall back to `model_id` keying in the aggregate;
  no crash.

**Error conditions / security**

- No `runs/` directory or an empty one → the home page shows an informative empty state,
  not a spinner or a crash.
- A selected run with a malformed `summary.json` / `scores.jsonl` line → a clear,
  localized error (which run, which line); the **run selector and other runs stay
  usable** (the bad run does not take down the page).
- A run missing one of its artifacts (`summary.json` / `scores.jsonl` / `answers.jsonl`
  / `questions.jsonl`) → surfaced as "can't load this run", with other runs still
  selectable.
- The run endpoint rejects a path-traversal request (`/runs/../something`) and a symlink
  under `runs/` that resolves outside it; a malformed-percent-encoding URL returns a
  clean 400/404, not a thrown error.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Deleting shared code breaks a kept primitive (e.g. `Markdown`/`ErrorBoundary` depended on a deleted util) | Medium | Medium | Purge in dependency order; rely on `check-types` + vitest after each removal; keep only primitives with no multibrowser imports. |
| Widening the parsed model silently drops a field the gate relied on | Low | High | Extend `loadRun`/types additively; keep `realRun.test.ts`'s invariants (400 joined cells, discriminating run) and add metric/roster assertions. |
| Per-question "missing cell" not derivable from the three original artifacts | — | — | Resolved: `questions.jsonl` (the roster) is loaded as a fourth artifact; `joinResults` iterates the roster. Fixture with `missing > 0` proves the path. |
| Run-enumeration endpoint leaks paths outside `runs/` (symlink / traversal / bad encoding) | Low | High | Canonical-path confinement + symlink rejection + try/caught decode; unit tests for traversal and symlink-escape. |
| `deploy.test.ts` left asserting removed multibrowser behavior → red suite, or the `#86` CSS probe lost in the rework | High | High | Rework the deploy invariants as part of the purge; **explicitly keep/relocate the `#86` built-CSS probe** and an SPA-fallback smoke; `test/noInvisibleText.test.ts` is glob-based and self-maintaining. |
| Aggregate keyed on `model_id` splits a renamed model | Medium | Medium | Key on `panel.provider`+`panel.model` (architect-binding); `model_id` is display only; fall back to `model_id` only when `panel` is absent. |
| Docs still point at the retired `/local-results` route | Medium | Low | Update `README.md`, `TUTORIAL.md`, and arch.md's "Viewer local results" (or keep the route as a redirect); covered by a success criterion. |
| Dead dependencies left in `package.json` (human said "gone, not merely hidden") | Medium | Low | Prune deps only the removed surface used; verify no kept source imports them and the build passes; `hono` fate follows the deploy decision. |
| HeroUI v3 provider regression while restyling | Low | Medium | No provider added; keep the `styles.css` shade shim; the `#86` CSS probe guards it. |

## References

- Issue #2 — `[Spec 2] Replace multibrowser leftovers…` incl. the **Addendum
  (requirement 6)** and the architect's 2026-10-11 panel-keying clarification
  (requirements 1–6 copied verbatim into Constraints).
- `codev/specs/1-phase1-benchmark-pipeline.md` and its review — the pipeline, the run
  data model, and the Spec 1 Phase 7 `/local-results` seam.
- `pipelines/sacredbench/score.py` — `_SUBMETRICS` (per-task metric contract) and the
  roster/`expected_n`/`missing` computation.
- `codev/resources/arch.md` → "Viewer local results" and "Run evidence layout"; this
  spec updates the former.
- `codev/resources/lessons-critical.md` — HeroUI v3 provider-less; derive formats from
  real data; never re-run collect/score over committed evidence.
- `apps/viewer/README.md` + `README.multibrowser.md`; `TUTORIAL.md` (≈69, 119–120) — the
  current viewer state, upstream provenance, and the tutorial step this spec updates.
- `runs/first-run-2026-10-11/` — the committed evidence the gate renders (incl.
  `questions.jsonl`, the roster).
