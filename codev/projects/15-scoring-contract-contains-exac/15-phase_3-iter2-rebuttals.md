# Phase 3 impl consult (iter2) — disposition

codex **REQUEST_CHANGES (HIGH)** — two issues, both fixed. claude **COMMENT** — iteration-1 fixes
verified genuinely fixed and rebaseline re-verified clean; one calibration gap, fixed (not just
documented). All fixes verified: pipeline + viewer lanes green (340 pipeline tests, 1 skip); the
phase-1 projection oracle and the 1/20 flip set are **unchanged**.

## codex #1 (FIXED) — verify_source refusal defeated by a mere Yes/No mention

`parse_yes_no` returned the FIRST `yes`/`no` token, so "I can't verify whether the answer is yes or
no" was read as a committed "yes" — not refused, and falsely scored correct when the expected answer
was "yes".

**Fix** (`score.py`): `parse_yes_no` now requires a **single unambiguous** token — an answer
mentioning both (or neither) parses to `None`. So the ambiguous decline scores `correct=0`, and
`_with_outcome`'s `not correct` gate then lets `classify_refusal` mark it `refused` end-to-end.
Regression tests added: `parse_yes_no` single-commitment cases, and
`score_answer("verify_source", "I can't verify whether the answer is yes or no.")` → `refused`. No
committed evidence uses `verify_source` (both runs are `retrieve_quote`-only), so zero rebaseline
impact; existing `parse_yes_no` / verify tests still pass (their cases are single-token).

## codex #2 (FIXED) — fully-missing cells lacked the three-outcome schema

Zero-answer (expected-but-unanswered) cells emitted only `{n, accuracy, expected_n, missing}`.

**Fix** (`score.py`): a missing cell now goes through `_outcome_cell` with a zero accumulator, so it
carries the same shape — `correct/incorrect/refused = 0`, `accuracy/coverage/refused_rate = None` —
and `missing` stays distinct from `refused`. No committed-evidence impact (both runs are complete;
no `n=0` cells), verified by diff; `test_missing_cells_with_roster` extended to assert the new keys.

## claude (FIXED, not just documented) — two missed "I can neither … nor" declines

`llama-3.1-8b / retrieve_quote-22fab64cec81` and `-74d14c70efb0` ("I can neither provide … nor …")
are unambiguous declines the first hand survey missed (scored `incorrect`). Rather than document the
gap, I added the `"i can neither"` cue and **re-pinned** the refused set within the still-open phase-3
rebaseline (not a third rebaseline): first-run refused 139→141 (llama 18→20), SHA re-pinned; tutorial
unchanged. Impact is confined to the bottom-ranked model (accuracy 0.0122→0.0125, coverage
0.82→0.80); the two cells flip `incorrect→refused` and **nothing else moves** — per-cell
exact/normalized/token_f1 byte-identical, oracle + flip set unchanged (verified by diff).

## claude nits (applied)

- `leading_decline` now scans only the leading window (+ a cue-length margin) instead of the whole
  answer — same result, bounded work.
- Documented in `classify_refusal` why the containment half is load-bearing (it is redundant under
  the default graders but the only guard under `--evaluator strict`, where a contained-but-not-
  normalized answer scores `correct=0`).

## claude — remaining phase-5 / phase-4 notes (unchanged from iter1, still deferred)

- phase-5 README: tutorial `haiku-search/retrieve_quote-e2d74279aaf0` (the only refused cell above
  token_f1 0.5) documented beside the 1/21 hedge caveat.
- phase-4: `localResults.ts formatCell` null-accuracy cell drops `n`; fix with the coverage column.
