# Sacred Texts Benchmark viewer

A local-only single-page app for exploring benchmark runs: a leaderboard of which models
were tested and how they scored per task and per tradition, a drill-in error explorer for
any model's per-question failures, and a cross-run "current standings" view. It reads a
run's artifacts directly — no GitHub data layer, no backend API.

## What it reads

A run lives in `runs/<id>/` and the viewer loads four artifacts
(`pipelines/sacredbench score` output):

- `summary.json` — per-model × task (and × tradition) accuracy, token `usage`, and the
  model `panel` (provider/model/endpoint).
- `scores.jsonl` — per-question metrics (exact / normalized / token-F1 / correct).
- `answers.jsonl` — each model's answer plus the prompt and expected text.
- `questions.jsonl` — the authoritative question roster, so a model's **un-answered**
  questions show as missing cells.

`src/lib/localResults.ts` fetches and joins these (`loadRun` for a full run,
`loadSummary` for just the per-model rollup the standings view needs); `src/lib/leaderboard.ts`
derives the leaderboard ranking/columns/token totals, `src/lib/explorer.ts` the per-question
classification and filters, and `src/lib/aggregate.ts` the cross-run standings rollup.

## Running it

```sh
pnpm -C apps/viewer install
pnpm -C apps/viewer dev          # then open the printed URL
```

- `/` shows the **leaderboard** for the most-recent run under `runs/`: models ranked by
  overall accuracy, per-task and per-tradition columns, and per-model token totals. A run
  selector switches between the runs present; the selection lives in the URL as a bare run
  id (`/?run=<id>`), so a view is shareable and survives refresh. If `runs/` is empty you
  get an informative empty state; if a selected run can't be loaded you get a localized
  error while the selector and other runs stay usable.
- Clicking a model (or a task / tradition cell) opens the **error explorer**
  (`/run/$runId/model/$modelId`): every question for that model with pass / fail / missing
  status, and for each one the prompt, the expected text, the model's answer, and the
  per-metric scores (exact / normalized / token-F1) side by side. Filter by task, tradition,
  correct/incorrect, and failure mode (missing cell vs wrong answer); the filters live in the
  URL (`?task=&tradition=&correct=&mode=`).
- **Standings** (`/standings`, linked in the header) is the cross-run view: one row per
  model showing its **most recent** result across all runs, keyed on the run panel's
  `(provider, model, tools)` identity (a missing `tools` ⇒ `[]`), so search-on/off stay
  distinct rows while two runs of the same model with the same tools dedupe to one, with
  the source run's id and date linking back into that run's leaderboard.
- The dev server exposes the repo's (gitignored) `runs/` at `/runs/` via a dev-only Vite
  middleware (`serveRuns` in `vite.config.ts`, logic in `vite/runsEndpoint.ts`), including
  a `/runs/_index` run index. Symlinked run directories are intentionally omitted from the
  index (the endpoint rejects symlink traversal).
- In production the app is served as a static SPA (`server/index.mjs`, a minimal hono
  host with history fallback). A production host has no `/runs` endpoint, so the home
  page's index fetch returns the SPA shell (HTML) and the app shows the empty state — it
  never crashes.

The committed sample run `runs/first-run-2026-10-11/` renders out of the box when it is
the only run present; `src/local/realRun.test.ts` pins it through `loadRun`,
`src/routes/LeaderboardPage.test.tsx` renders it through the leaderboard,
`src/routes/ExplorerPage.test.tsx` drills into it, and
`src/routes/StandingsPage.test.tsx` rolls it up as standings — all in the test gate, so the
committed evidence can't drift out of the viewer's schema.

## Status

The multibrowser surface this app was seeded from (`/t/...` traditions, the
GitHub-data-layer `/results`/`/raw` views, the `/review*` flows, and their components and
data layer) has been **removed**. The viewer is the three Spec 2 surfaces over local
`runs/`: the **leaderboard home + run selector**, the **error explorer**, and the
**cross-run standings** view.

## Provenance

The app was seeded from `multibench/apps/multibrowser` (commit 14f6c9d4). That history —
including the client-side GitHub data layer and its unauthenticated-rate-limit lessons —
is preserved in `README.multibrowser.md` for reference; none of that surface ships any
more.
