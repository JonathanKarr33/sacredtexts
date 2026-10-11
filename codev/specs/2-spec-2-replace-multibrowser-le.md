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
leaderboard as the home page and an error explorer to drill into any model's failures.
Everything that served multibrowser's domain should be gone, not merely hidden.

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
  `NotFound.tsx`, `styles.css`, `test/setup.ts`, `test/renderApp.tsx`).
- **The local-results seam** (the starting point to rebuild on): `lib/localResults.ts`
  (`loadRun`, `parseSummary`, `joinResults`, ranking/formatting helpers),
  `components/LocalResults.tsx`, `routes/LocalResultsPage.tsx`, `local/sample.ts`, and
  the two gate tests `components/LocalResults.test.tsx` and `local/realRun.test.ts`.

The dev server exposes the (gitignored) repo `runs/` directory at `/runs/` via a
dev-only Vite middleware (`serveRuns` in `vite.config.ts`) that serves **individual
files** — there is **no run-index / directory-listing** endpoint, so nothing can today
answer "what runs exist?".

`loadRun` currently keeps only each question's `correct` flag from `scores.jsonl`; it
discards the per-metric `exact` / `normalized` / `token_f1` values and does not read
`summary.json`'s `usage` (token totals) or `panel` (provider) blocks.

`deploy.test.ts` and `routes/app.test.tsx` assert multibrowser behavior: tradition-data
baking, the `public/data-raw` raw tier, the edge-server `/api/*` review proxy, and
deep links like `/t/sunni-islam/JLS-001`. The README still opens "seeded from
multibench's multibrowser" and `README.multibrowser.md` holds the upstream provenance.

Committed evidence: `runs/first-run-2026-10-11/` (4 models × 100 `retrieve_quote`), the
only run tracked in git (`runs/*` is gitignored with a `!runs/first-run-2026-10-11/`
exception). A local-only `runs/opus-run-2026-10-11/` also exists on the human's
machine. The run data model, confirmed against the committed `summary.json`:

- `summary.json`: `models{ modelId → { task → Cell, "_overall" → Cell } }`,
  `by_tradition{ modelId → { tradition → { task → Cell, "_overall" → Cell } } }`,
  `usage{ per_model{ modelId → {calls,in,out} }, total{calls,in,out} }`,
  `panel{ modelId → {provider, model, endpoint, served_by} }`.
  `Cell = {n, accuracy, exact?, normalized?, token_f1?, expected_n, missing}`.
- `scores.jsonl` rows: `{question_id, model_id, task, metrics{exact, normalized,
  token_f1, correct}}`.
- `answers.jsonl` rows: `{question_id, model_id, model, task, answer, usage, …,
  question{prompt, expected{text|citation|…}, source{tradition[], work, version,
  citation, …}}}`.

## Desired State

Opening the viewer (`pnpm -C apps/viewer dev`, then `/`) shows a **leaderboard for this
benchmark** and nothing from multibrowser:

- **Home = leaderboard.** Models ranked by overall score, with per-task and
  per-tradition columns and token totals, over a selected run. A run selector lets the
  user switch between the runs present under `runs/`; the default is the most recent.
  Any `runs/<id>/` with a readable `summary.json` (+ `scores.jsonl`) is picked up with
  **no code change** — adding a run is a data operation.
- **Error explorer.** From the leaderboard, the user drills into any model (and
  optionally a specific task/cell) and sees every question for that model with a
  pass/fail mark; for each failure, the prompt, the expected text, the model's actual
  answer, and the three per-metric scores (exact / normalized / token-F1) shown side by
  side. The list is filterable by **task**, **tradition**, **correct/incorrect**, and
  **failure mode** (missing cell — the model produced no answer — vs wrong answer).
- **Local-only, no GitHub data layer.** The data source stays the local `runs/`
  directory read through the existing `loadRun` seam; there is no unauthenticated
  GitHub fetching, no rate-limit handling, no review API.
- **The multibrowser surface is gone.** The scenario browser, GitHub-data results/raw
  views, and review flows — routes, components, and libs — are removed. Only generic
  primitives that the new pages actually reuse remain.
- **Green and honest.** vitest passes; the gate that renders the committed
  `runs/first-run-2026-10-11` end-to-end still passes (reworked onto the new pages, not
  deleted); `apps/viewer/README.md` describes *this* app (multibrowser provenance moved
  to `README.multibrowser.md` or deleted); HeroUI v3 stays provider-less.

The concrete improvement: the viewer answers the benchmark's actual questions — *which
model is best, and where exactly does each one fail?* — on first load, from local run
evidence, with the dead product's code no longer present.

## Success Criteria

- [ ] `/` renders a leaderboard: one row per model, ranked by overall `accuracy`
      (descending; models with no overall data sort last), with a column per task, an
      overall column, per-tradition breakdown, and per-model token totals (in / out /
      calls) sourced from `summary.json`'s `usage`.
- [ ] A run selector on the home page lists every `runs/<id>/` that has a readable
      `summary.json`; selecting one re-renders the leaderboard for that run; the default
      selection is the most recent run (and the committed `first-run-2026-10-11`
      appears whenever it is present).
- [ ] Adding a new `runs/<id>/` directory (with `summary.json` + `scores.jsonl` +
      `answers.jsonl`) makes it appear in the selector with **no source change** — the
      `runs/opus-run-2026-10-11` case works on a machine where it is present.
- [ ] From the leaderboard the user can drill into any model into an error explorer
      that lists every question for that model with a pass/fail mark.
- [ ] For each failing question the explorer shows, side by side: the prompt, the
      expected text, the model's actual answer, and the three per-metric scores
      (exact, normalized, token-F1).
- [ ] The explorer can be filtered by task, by tradition, by correct/incorrect, and by
      failure mode (missing cell vs wrong answer), and the filters compose.
- [ ] No route, component, lib module, or test referencing the multibrowser domain
      (traditions/scenarios/review/GitHub data layer) remains in `apps/viewer/src`;
      grepping the built bundle finds no tradition/scenario identifiers.
- [ ] `pnpm -C apps/viewer test` is green, including a gate test that loads and renders
      the committed `runs/first-run-2026-10-11` through the new leaderboard + explorer.
- [ ] `apps/viewer/README.md` describes this benchmark viewer (leaderboard + explorer,
      local `runs/`); multibrowser provenance is in `README.multibrowser.md` or removed.
- [ ] HeroUI v3 remains provider-less (no v2-era provider added); `check-types` passes.

## Constraints

**Fixed requirements from the human (2026-10-11) — treated as settled; not relitigated
in Solution Approaches:**

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

**Other constraints:**

- Stack is fixed: Vite / React 19 / TS / Tailwind 4 / HeroUI v3 / TanStack
  Router+Query. The `src/styles.css` HeroUI numbered-shade shim is load-bearing (the
  `#86` scar) — do not regress it.
- The run data model is an external contract owned by `pipelines/sacredbench score`
  (see Current State). The viewer consumes it; it does not define it. Derive behavior
  from the **real** committed artifacts, not from docs.
- `runs/*` is gitignored except the committed `first-run-2026-10-11`; the viewer must
  degrade gracefully when only that run (or none) is present.
- The dev-only `serveRuns` middleware is the local data transport; any run-enumeration
  mechanism must stay dev/local-only and confined to the repo `runs/` directory (no new
  network data layer).
- Scope is the viewer only. The pipeline, texts, and scoring contract are untouched.

## Assumptions

- The audience runs the viewer locally against `runs/` they generated; a public
  production deploy of run evidence is **not** a goal of this spec (the committed run is
  the one guaranteed-present dataset, and `runs/` is otherwise gitignored).
- `summary.json` is the source of truth for the leaderboard aggregates (accuracy,
  by-tradition, usage); the explorer joins `scores.jsonl` (per-metric correctness) with
  `answers.jsonl` (prompt/answer/expected/tradition) on `(question_id, model_id)`, as
  `loadRun` already does.
- "Missing cell" is derivable from the artifacts: a question that is expected for a
  model but has no answer row (equivalently, reflected in a cell's `missing` /
  `expected_n` vs `n`). The current committed run has `missing: 0` everywhere, so the
  missing-cell path must be demonstrable via a fixture/sample, not only the real run.
- Phase-1 runs currently contain a single task (`retrieve_quote`); the leaderboard and
  explorer must still be written to handle multiple tasks and traditions generically
  (the data model already supports them).
- `tradition` is a list per question (texts can be shared); per-tradition tallies count
  an observation once per listed tradition, matching the pipeline's `by_tradition`.

## Solution Approaches

The *what* (leaderboard home + error explorer, multibrowser purged, local-only) is
fixed by the Constraints. The open design space is in three areas.

### Approach 1: Run discovery — dev directory-listing endpoint (recommended)

Extend the dev-only `serveRuns` middleware so that a request for the `runs/` collection
(rather than a single file) returns a JSON list of run ids that contain a
`summary.json`. The home page fetches this list, picks the most recent as default, and
loads the selected run's artifacts through `loadRun`.

- **Pros:** satisfies "picks up any `runs/<id>` with no code change" exactly; no
  committed index to maintain or drift; stays local/dev-only, matching the no-GitHub
  constraint; minimal new surface (one endpoint).
- **Cons:** enumeration works only under the dev server (fine — local-only is a stated
  constraint); needs a defined ordering for "most recent" (directory name is
  date-stamped today, but mtime is the robust signal).
- **Risk/complexity:** low. Confined, dev-only, easily unit-tested against a temp dir.

### Approach 2: Run discovery — committed `runs/index.json` manifest

Commit (or generate) a manifest listing available runs; the home page reads it.

- **Pros:** works without the dev middleware (e.g. a future static deploy).
- **Cons:** violates "no code/data change to add a run" unless regenerated every time;
  the manifest drifts from reality; `runs/*` is gitignored, so a committed manifest
  would list runs that aren't present on another machine. Rejected as the primary
  mechanism.
- **Risk/complexity:** low mechanically, high correctness risk (drift).

### Approach 3: Rebuild on the `localResults` seam vs. rewrite from scratch

The existing `loadRun` / join / ranking helpers already parse the real artifacts and
are covered by the gate test. **Recommended: extend the seam** — widen the parsed model
to carry per-metric scores and `usage`/`panel`, and build the leaderboard and explorer
as new pages/components on top of it, retiring the single flat `LocalResults` view.

- **Pros:** preserves the proven parsing + the committed-run gate; smallest correctness
  risk; the join on `(question_id, model_id)` is reused rather than re-derived.
- **Cons:** the current `QuestionResult`/`Cell`/`Summary` shapes need widening (metrics,
  usage, missing) — a non-trivial but contained change.
- **Alternative (rejected):** discard `localResults.ts` and re-parse from scratch —
  throws away tested code and the gate's seam for no benefit.

**Deploy handling (sub-decision):** removing the GitHub data layer and the review API
makes the edge-server `/api/*` proxy and the `public/data-raw` bake (both multibrowser)
dead weight; `deploy.test.ts` asserts them. Recommended: rework the deploy/build
invariants to the new app — keep a generic SPA build + fallback assertion if the static
deploy is retained, and drop the tradition-baking / raw-tier / review-proxy assertions.
Whether to keep any Railway deploy at all is an Open Question (local-only is the stated
priority).

## Open Questions

- **Critical** — *Run discovery mechanism.* Confirm Approach 1 (dev directory-listing
  endpoint). Recommended and assumed unless the architect objects; it is the only option
  that honors "no code change to add a run" without drift. Blocks the home page's run
  selector.
- **Important** — *Fate of the Railway deploy + edge server.* Once the GitHub data
  layer and review API are gone, the `server/index.mjs` `/api/*` proxy and
  `bake-and-deploy.sh` raw bake serve nothing. Options: (a) keep a plain static SPA
  deploy and rework `deploy.test.ts` to match; (b) drop the deploy entirely as
  local-only. Recommended: (a) minimal — keep the build green, strip the
  multibrowser-specific deploy assertions. Shapes how much of `deploy.test.ts` /
  `server/` survives.
- **Important** — *"Most recent" ordering.* Directory mtime (robust) vs the date in the
  run id (today's convention). Recommended: mtime, with id as a stable tiebreaker.
- **Nice-to-know** — *Surfacing `panel` provider metadata.* `summary.json.panel` has
  provider / model-slug / serving-host per model. Worth showing on the leaderboard or a
  run-detail header? Low priority; data is present if wanted.
- **Nice-to-know** — *Similarity metric display.* Whether per-metric scores show as raw
  numbers, bars, or color ramps in the explorer. Presentation only.

## Test Scenarios

**Happy paths**

- Home page over the committed run renders one leaderboard row per model
  (`claude-haiku`, `gemma-3-4b`, `gpt-oss-20b`, `llama-3.1-8b`), ranked with
  `claude-haiku` (0.24 overall) first and the two 0.0 models last, with the
  `retrieve_quote` column, an overall column, and per-model token totals.
- The per-tradition breakdown shows the four traditions (Judaism, Protestant Christian,
  Roman Catholic, LDS) with their per-model accuracies (e.g. claude-haiku / LDS = 0.72).
- Drilling into `claude-haiku` lists 100 questions with 24 marked correct; each failing
  question shows prompt, expected text, actual answer, and exact/normalized/token-F1.
- Filtering the explorer to tradition = "Protestant Christian" + incorrect shows only
  that tradition's failures; adding task = `retrieve_quote` leaves them (single task);
  clearing filters restores the full list.
- The run selector lists `first-run-2026-10-11` (and any other present run); switching
  runs re-renders the leaderboard and explorer against the newly selected run.

**Edge cases**

- Only the committed run present → it is the default and the sole selector entry.
- A run whose `summary.json` has a cell with `missing > 0` / `n < expected_n` →
  that model/cell is reachable in the explorer under the "missing cell" failure mode
  (demonstrated via a sample/fixture since the real run has `missing: 0`).
- A model with `null` overall accuracy sorts last and formats as "n/a" rather than
  crashing.
- Multiple tasks / a run with `by_tradition` absent → leaderboard still renders (task
  columns from the data; by-tradition section omitted gracefully).

**Error conditions**

- No `runs/` directory or an empty one → the home page shows an informative empty state,
  not a spinner or a crash.
- A selected run with a malformed `summary.json` / `scores.jsonl` line → a clear,
  localized error (which run, which line), not a blank page (reuse the existing
  parse-error behavior / ErrorBoundary).
- A run missing one of the three artifacts → surfaced as "can't load this run", with
  other runs still selectable.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Deleting shared code breaks a kept primitive (e.g. `Markdown`, `ErrorBoundary` depended on a deleted util) | Medium | Medium | Purge in dependency order; rely on `check-types` + vitest after each removal; keep only primitives with no multibrowser imports. |
| Widening the parsed model silently drops a field the gate test relied on | Low | High | Extend `loadRun`/types additively; keep `realRun.test.ts`'s invariants (400 joined cells, discriminating run) and add metric assertions. |
| "Missing cell" path untested because the real run has `missing: 0` | Medium | Medium | Add a sample/fixture run exercising `missing > 0`; assert the failure-mode filter against it. |
| Run-enumeration endpoint leaks paths outside `runs/` | Low | High | Reuse `serveRuns`' existing path-confinement (`startsWith(runsDir + sep)`); only list immediate subdirs with a `summary.json`. |
| `deploy.test.ts` left asserting removed multibrowser behavior → red suite | High | Medium | Rework/remove those invariants as part of the purge (see Open Question on deploy). |
| HeroUI v3 provider regression while restyling | Low | Medium | No provider added; keep the `styles.css` shade shim; the `deploy`/CSS probe test guards it. |

## References

- Issue #2 — `[Spec 2] Replace multibrowser leftovers: sacredtexts-specific
  leaderboard + error explorer` (requirements copied verbatim into Constraints).
- `codev/specs/1-phase1-benchmark-pipeline.md` and its review — the pipeline, the run
  data model, and the Spec 1 Phase 7 `/local-results` seam.
- `codev/resources/arch.md` → "Viewer local results" and "Run evidence layout" — the
  current seam and artifact layout.
- `codev/resources/lessons-critical.md` — HeroUI v3 provider-less; derive formats from
  real data; never re-run collect/score over committed evidence.
- `apps/viewer/README.md` + `README.multibrowser.md` — current viewer state and
  upstream provenance.
- `runs/first-run-2026-10-11/` — the committed evidence the gate renders.
