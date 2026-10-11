# Sacred Texts Benchmark viewer

A local-only single-page app for exploring a benchmark run: which models were tested,
how they scored per task and per tradition, and (coming in the Spec 2 feature phases) a
drill-in error explorer. It reads a run's artifacts directly — no GitHub data layer, no
backend API.

## What it reads

A run lives in `runs/<id>/` and the viewer loads four artifacts
(`pipelines/sacredbench score` output):

- `summary.json` — per-model × task (and × tradition) accuracy, token `usage`, and the
  model `panel` (provider/model/endpoint).
- `scores.jsonl` — per-question metrics (exact / normalized / token-F1 / correct).
- `answers.jsonl` — each model's answer plus the prompt and expected text.
- `questions.jsonl` — the authoritative question roster, so a model's **un-answered**
  questions show as missing cells.

`src/lib/localResults.ts` (`loadRun`) fetches and joins these;
`src/components/LocalResults.tsx` renders them.

## Running it

```sh
pnpm -C apps/viewer install
pnpm -C apps/viewer dev          # then open the printed URL
```

- `/` loads the **most-recent** run under `runs/` and renders it. If `runs/` is empty you
  get an informative empty state.
- The dev server exposes the repo's (gitignored) `runs/` at `/runs/` via a dev-only Vite
  middleware (`serveRuns` in `vite.config.ts`, logic in `vite/runsEndpoint.ts`), including
  a `/runs/_index` run index. Symlinked run directories are intentionally omitted from the
  index (the endpoint rejects symlink traversal).
- In production the app is served as a static SPA (`server/index.mjs`, a minimal hono
  host with history fallback). A production host has no `/runs` endpoint, so the home
  page's index fetch returns the SPA shell (HTML) and the app shows the empty state — it
  never crashes.

The committed sample run `runs/first-run-2026-10-11/` renders out of the box when it is
the only run present; `src/local/realRun.test.ts` pins it through `loadRun` in the test
gate so the committed evidence can't drift out of the viewer's schema.

## Status

This is the interim state of the Spec 2 rework. The multibrowser surface it was seeded
from (`/t/...` traditions, the GitHub-data-layer `/results`/`/raw` views, the `/review*`
flows, and their components and data layer) has been **removed**. The home page currently
reuses the local-results view; the dedicated **leaderboard + run selector** and **error
explorer** land in the Spec 2 feature phases.

## Provenance

The app was seeded from `multibench/apps/multibrowser` (commit 14f6c9d4). That history —
including the client-side GitHub data layer and its unauthenticated-rate-limit lessons —
is preserved in `README.multibrowser.md` for reference; none of that surface ships any
more.
