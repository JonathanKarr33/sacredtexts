# Phase 5 impl consult (iter3) — disposition

codex **REQUEST_CHANGES** (3 factual doc items), claude **COMMENT** (same opus-off item + 2 nits).
Fixed the three real items; one claude nit is a false positive (verified). Dispatcher 346 pass / 1 skip.

## Fixed (both lanes agree)

- **tutorial README Talmud parenthetical.** Corrected: opus-off **refused all 34** Talmud cells
  (Judaism accuracy `null`, coverage 0% — verified in `summary.json`), not "refuses most / high-but-
  low-coverage" (that shape is opus-**search**'s, 80% @ 29%). Reworded to "search converted a total
  abstention into 8 correct retrievals at 29% coverage."
- **first-run README provenance.** It no longer claims `TUTORIAL.md` Track B generates it — Track B
  now produces the three-corpus tutorial run (`37eb58400fdf4ea9`). Reworded: an earlier English-only
  run (digest `ef837474ed7b22ec`, mixed-provider panel) from the same generate→collect→score pipeline.
- **score.py docstring.** Dropped the stale "the group's open question" clause; the default
  strict+containment contract is settled (Spec 15).

## Disputed (false positive)

- claude: "`CODE_WALKTHROUGH.md` points `filterQuestions` at `explorer.ts:40`; the definition is line
  39." **Verified line 40** is `export function filterQuestions(...)` (`grep -n`); the pointer is
  correct, no change. (The `explorer.ts:40` in the doc resolves to the exact def line.)
