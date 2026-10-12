# air-7 thread — Issue #7: run recency must not depend on directory mtime

## Context / findings (2026-10-12)
- **Bug**: viewer derives "most recent" run from `runs/` directory **mtime** with an
  id-ascending tiebreak. In a fresh clone every committed run shares the checkout mtime, so
  the tiebreak crowns the chronologically OLDEST date-stamped id as "most recent" →
  corrupts the standings rollup (each model's latest result).
- **Pipeline half ALREADY DONE + tested** (committed under Spec 8, commit a642b5c):
  `score.py:435` writes `summary["generated_at"] = datetime.now(utc).isoformat()`;
  `generate.py:354` writes it into questions metadata too. Tests already assert it:
  `pipelines/tests/test_tutorial_run.py:54-56` and `test_phase2_tools.py:260-261`
  (both tagged "Issue #7"). So **no pipeline change needed** — this PR is viewer-only.
- **Real evidence confirms the bug**: `runs/first-run-2026-10-11/summary.json` has NO
  `generated_at` (pre-Spec-8); `runs/tutorial-2026-10-11/summary.json` has
  `generated_at=2026-10-12T01:20…`. Both share run-id date 2026-10-11. In a fresh clone,
  mtime+id-asc would pick `first-run` as newest; by generated_at the tutorial is newer.

## Plan (viewer half)
Precedence for recency, mtime-independent: `generated_at` (summary.json) → run-id date
(`…-YYYY-MM-DD…` as UTC midnight) → `mtimeMs` (last resort).
- New pure helper `apps/viewer/src/lib/recency.ts` (`runRecencyMs`), used by all three
  consumers so they agree: `listRuns` (server), `fetchRunIndex` (client), `aggregate`.
- `Summary.generated_at` added to the type + passed through `parseSummary` (was dropped).
- `listRuns` reads each summary.json to surface `generatedAt` in the index entry; the
  client re-derives recency defensively. StandingsPage display switches mtime→recency.

## Status
- Implemented + PR #17 opened (review embedded in body, `Closes #7`). Viewer-only.
- **CMAP (codex + claude, gemini dropped per config)**: both APPROVE / HIGH.
  - codex: no issues.
  - claude: APPROVE; verified the fix against real evidence + the prod no-`/runs` path.
    Flagged 3 cleanups, all addressed:
    1. orphaned `listRuns` JSDoc above `readGeneratedAt` → moved back above `listRuns`;
    2. stale module header (`[{id, mtimeMs}]`) → updated to `{id,mtimeMs,generatedAt?}` + recency;
    3. untested display branch → added StandingsPage test for "dated <date>" + "date unknown".
- First CMAP run failed on `consult` project auto-detect ("Multiple projects found") →
  re-ran with `--project-id 7`. (Note for siblings: pass `--project-id` in this multi-project worktree.)
- Tests: 141 pass. `porch check 7` green (implement + pr phases).
- Waiting on human PR-gate approval before `porch approve`.
