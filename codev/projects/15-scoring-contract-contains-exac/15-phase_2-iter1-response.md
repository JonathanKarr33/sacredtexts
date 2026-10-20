# Spec 15 — phase_2 impl consult outcome + response

**Both reviewers APPROVE (HIGH).** codex: no issues. claude independently reproduced **both** committed
`scores.jsonl` byte-for-byte via the real CLI (`cmp` byte-identical), confirmed `--evaluator strict/containment`
subset behaviour and the killed `contains_reference: 0.0` bug, 310 tests green, `runs/**` untouched — the no-op
is genuinely provable. Six non-blocking polish items; I folded the cheap phase_2-local ones and deferred the rest.

## Folded now (phase_2 polish commit)

- **Import-time fail-fast** (claude #1): `graders.py` now raises at import if an **inline** grader owns metric
  keys outside `_CANONICAL_ORDER` (what `score.py` computes) — closes the silent-drop + verdict-`KeyError` trap
  the phase-5 "add an evaluator" recipe would otherwise invite. Non-inline graders are exempt (their own pass
  produces their fields).
- **Dead rows trimmed** (claude #3): `_SUBMETRICS` now holds only `identify_version` (the text-retrieval rows
  were unreachable via `_task_submetrics`), matching the thread note.
- **Loud accumulator** (claude #2): `acc[sm] += metrics[sm]` (was `.get(sm, 0)`) — `sm_keys` derives from the
  same selection, so a drift fails loudly instead of silently zero-filling. Also `score_answer(graders=[])`
  now raises instead of silently scoring `correct=0`.
- **Docstring fix** (claude #4): `graders.py` no longer claims values are "keyed by grader name" or cites a
  non-existent import cycle.

## Deferred (as the reviewer recommends)

- **Evaluator provenance stamp** (claude #5): record the selected graders in `summary.json` so a
  `--evaluator strict` run is distinguishable. Adding it in phase 2 would have broken the no-op; **phase 3
  rewrites the summaries anyway** — it lands there (`summary["evaluators"]`).
- **Test-quality notes** (claude #6): the `jev` seam test documents the shape; the paid-never-default property
  is covered by `test_default_set_is_the_deterministic_inline_graders`. Left as-is (non-blocking).
- **Phase-4 forward note**: `QuestionList.tsx` hardcodes three metric keys (absent under a subset selection) —
  already in phase-4 scope.

All 310 pipeline tests pass after the polish; the run byte-guards + durable oracle remain green (no-op intact).
