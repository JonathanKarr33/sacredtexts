# Review (PR consult, iter 1) — Rebuttal / disposition

**Verdicts:** codex `REQUEST_CHANGES` (HIGH); claude `REQUEST_CHANGES` (HIGH). Both found the
implementation/tests/migration sound but the **branch 18 commits behind `main`** and its new
recency docs/tests falsified by the now-merged Issue #7 (`generated_at` recency) and #19
(TUTORIAL/CODE_WALKTHROUGH single-track rewrite). **Both verdicts are correct — all points
accepted and fixed** via a `main` merge + reconciliation that architect `main` explicitly
authorized (2026-10-12 17:51Z: "MERGE origin/main … reconcile to #7's landed reality").

Re-verified after integration: `.codev/checks/test.sh` green (viewer vitest 145 passed / 18 files;
pipeline pytest 270 passed / 1 pre-existing unrelated skip, including the CODE_WALKTHROUGH pointer
guard now mapped into the pipelines lane) and `pnpm -C apps/viewer check-types` clean. The PR is no
longer `CONFLICTING`.

## Integration-readiness (both reviewers) — ACCEPTED, fixed

- **Branch behind `main` / `CONFLICTING`** → merged `origin/main` (commit `e6cd2cf`, `--no-ff`,
  architect-approved over a 37-commit rebase). All 8 overlapping files resolved.

## Issue #7 recency must not be clobbered (both reviewers) — ACCEPTED, fixed

- `aggregate.ts`: the tools key `${provider}\u0000${model}\u0000${sortedTools}` is composed **on
  top of** `runRecencyMs` (generated_at → run-id date → mtime). `StandingsPage.tsx` keeps main's
  `recencyMs`/`recencyDate`. `lib/recency.ts` is untouched. Nothing from #7 is reverted.

## Falsified docs/comments (claude #2, #3) — ACCEPTED, fixed

- The doc corrections were **re-applied onto #19's rewritten** `CODE_WALKTHROUGH.md` (its compact
  section-6 panel bullet, now `panel.tools` + `score.py:430`, marker dropped) and `TUTORIAL.md`
  (a small tone-matching edit to #19's single-track standings bullet, no mtime/issue jargon),
  keeping #19's structure as the architect required.
- The `tutorialRun.test.ts` comment and the review prose that asserted "Issue #7 out of scope /
  mtime tie / no winner" were rewritten to the **post-#7 reality**: the tutorial run wins the
  shared `claude-haiku-5-5` key via its newer `generated_at`.

## Inert injected mtimes (claude #3) — ACCEPTED, fixed

- `tutorialRun.test.ts` now gives **first-run the larger mtime** and asserts the tutorial still
  supplies the shared row — proving recency resolves via `generated_at` (tutorial 2026-10-12) over
  first-run's run-id-date fallback (2026-10-11), not mtime. The assertion is meaningful again.

## `generated_at` bumped by the migration (claude #4) — ACCEPTED, fixed

- Restored the tutorial run's `generated_at` to its original run time `2026-10-12T01:20:16` (the
  migration had set it to the regeneration time). Under #7 it is the load-bearing recency signal,
  so the migration must stay panel-only; the committed `summary.json` now differs from `main` only
  in the `panel` block. The tutorial still wins the shared key (Oct 12 > first-run's Oct 11).

## Nits (claude #5/#6) — ACCEPTED

- `StandingsPage` subtext changed from `[web_search]` to `· web_search` (no longer reads like the
  model-id marker this spec removes); the test + TUTORIAL wording follow.
- Also corrected `arch.md`'s now-stale "`generated_at` … the viewer ignores it" line (post-#7 it is
  the viewer's primary recency signal, pointing at `lib/recency.ts`).

## Out-of-scope, left deliberately (claude)

- `pipelines/README.md:101` + `apps/viewer/README.md:14` loose `panel (provider/model/endpoint)`
  summaries omit `tools`/`served_by` → **N/A**: claude confirms these are **not** falsified by this
  change; left per tight-diff, recorded as a Follow-up for a deliberate PR-review decision.
