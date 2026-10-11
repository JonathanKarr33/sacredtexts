# Phase 7 implementation — review rebuttal (iter 1)

Both reviewers **REQUEST_CHANGES / HIGH**, converged on one real gap: the view
rendered only a compiled-in fixture, with no mechanism to read actual run artifacts
— which the spec ("a local dev server reading the run artifacts, committed or local
runs/") and Phase 8 ("the minimal viewer renders this committed run") require.
claude confirmed the shapes match score.py/collect.py exactly and the GitHub-layer
independence is clean. Accepted. 411 tests pass, tsc clean.

## Accepted and fixed

**1. Nothing read real run artifacts (both, blocking).** Added `loadRun(base,
fetcher)` — fetches `<base>/{summary.json,scores.jsonl,answers.jsonl}`, parses and
joins, returns null if any 404s. `/local-results?run=/runs/<id>` now loads a real
run; a dev-only Vite middleware (`serveRuns` in `vite.config.ts`) exposes the repo's
gitignored `runs/` at `/runs/`, confined to that directory. With no `?run` (or on a
404) the page falls back to the committed sample, so `pnpm dev` still works out of
the box and the loader + evidence path agree (Phase 8 commits a run, points the
viewer at it). The page handles loading/error/fallback states.

**2. Tests didn't exercise the loader (both).** Added `loadRun` tests against a
fake fetcher: a full run parses/joins (4 rows), and a 404 returns null (the
fallback trigger). The README's "point it at a real run" claim is now actionable.

## Smaller notes (claude) — addressed

- `parseJsonl` now reports `file:line` on malformed JSONL (an interrupted `collect`
  can truncate the last line).
- The page has an explicit error state (no crash) when loading fails.
- `expectedText` now renders `work — citation` for `identify_source` (was dropping
  the work); still fine for Phase 8's retrieve_quote-only run.
- `by_tradition` is no longer dead: a "By tradition" table renders it (mirrors
  score.py's markdown breakdown).
- Noted: `src/local/sample.ts` ships in a production build — harmless (no deploy;
  synthetic text), relevant only if Spec 2 ever deploys from this tree.

## Disagreements

None.
