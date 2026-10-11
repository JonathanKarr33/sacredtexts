# Sacred Texts Benchmark viewer

A local-only single-page app for exploring a benchmark run: a leaderboard of which models
were tested and how they scored per task and per tradition, and (coming in the remaining
Spec 2 feature phases) a drill-in error explorer and a cross-run standings view. It reads
a run's artifacts directly — no GitHub data layer, no backend API.

## What it reads

A run lives in `runs/<id>/` and the viewer loads four artifacts
(`pipelines/sacredbench score` output):

- `summary.json` — per-model × task (and × tradition) accuracy, token `usage`, and the
  model `panel` (provider/model/endpoint).
- `scores.jsonl` — per-question metrics (exact / normalized / token-F1 / correct).
- `answers.jsonl` — each model's answer plus the prompt and expected text.
- `questions.jsonl` — the authoritative question roster, so a model's **un-answered**
  questions show as missing cells.

`src/lib/localResults.ts` (`loadRun`) fetches and joins these; `src/lib/leaderboard.ts`
derives the ranking/columns/token totals; `src/routes/LeaderboardPage.tsx` +
`src/components/LeaderboardTable.tsx` render the leaderboard.

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
- The dev server exposes the repo's (gitignored) `runs/` at `/runs/` via a dev-only Vite
  middleware (`serveRuns` in `vite.config.ts`, logic in `vite/runsEndpoint.ts`), including
  a `/runs/_index` run index. Symlinked run directories are intentionally omitted from the
  index (the endpoint rejects symlink traversal).
- In production the app is served as a static SPA (`server/index.mjs`, a minimal hono
  host with history fallback). A production host has no `/runs` endpoint, so the home
  page's index fetch returns the SPA shell (HTML) and the app shows the empty state — it
  never crashes.

The committed sample run `runs/first-run-2026-10-11/` renders out of the box when it is
the only run present; `src/local/realRun.test.ts` pins it through `loadRun`, and
`src/routes/LeaderboardPage.test.tsx` renders it through the leaderboard, in the test gate
so the committed evidence can't drift out of the viewer's schema.

## Status

The multibrowser surface this app was seeded from (`/t/...` traditions, the
GitHub-data-layer `/results`/`/raw` views, the `/review*` flows, and their components and
data layer) has been **removed**. The **leaderboard home + run selector** are in place; the
**error explorer** (drill into a model's per-question failures) and the **cross-run
standings** view land in the remaining Spec 2 feature phases.

## Provenance

The app was seeded from `multibench/apps/multibrowser` (commit 14f6c9d4). That history —
including the client-side GitHub data layer and its unauthenticated-rate-limit lessons —
is preserved in `README.multibrowser.md` for reference; none of that surface ships any
more.
