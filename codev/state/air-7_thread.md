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
- Implementing. Viewer-only → dispatcher runs vitest.
