# Phase 3 impl consult (iter3) — disposition

codex **REQUEST_CHANGES (HIGH)** and claude **COMMENT** converged on the same root cause: my iter-2
`parse_yes_no` change over-corrected in both directions. Fixed by moving verify_source refusal out of
the parser entirely. No committed evidence uses `verify_source` (both runs are `retrieve_quote`-only),
so **no rebaseline** — the `retrieve_quote` refused set, oracle, and flip set are untouched (verified:
`git status runs/` clean). Pipeline + viewer lanes green.

## Root cause (both lanes)

iter-2 made `parse_yes_no` return `None` when *both* `yes` and `no` appear anywhere. That:
- **(claude, regression I introduced)** broke genuine commitments: "Yes, there is no doubt…" → `None`
  → scored incorrect.
- **(codex)** still mis-scored single-incidental-token declines: "I can't verify whether the answer
  is yes" (one `yes`) committed to "yes"; "I cannot verify this; no reliable source" (one `no`)
  committed to "no".

Trying to make a token parser detect *commitment vs incidental mention* is the deferred verify_source
hardening problem (module docstring: "must be hardened before any verify_source number is reported").

## Fix

1. **`parse_yes_no` reverted** to the simple first-token verdict — removes claude's regression
   ("Yes, there is no doubt…" → "yes" again) and restores the documented pre-existing behavior.
2. **verify_source refusal now comes from the decline cue, not the parser.** `classify_refusal`
   returns `True` for any leading decline on verify_source, and `_with_outcome` applies it **ungated**
   for verify_source (a leading "I can't verify…" is a refusal regardless of an incidental Yes/No
   token). The delivered-result tasks keep the `not correct` gate (a hedged-but-correct citation is
   still an answer).

Both codex examples now resolve: "I can't verify whether the answer is yes" and "I cannot verify
this; no reliable source is available" lead with a decline cue → `refused`, not correct. claude's
"Yes, there is no doubt…" has no decline cue → committed "yes" → correct. Tests added for all four.

Residual (unchanged, deferred): a NON-declining verify_source answer that evades via negation without
a Yes/No verdict is still gameable by the first-token parser — the pre-existing verify_source gap,
out of phase-3 scope and affecting no committed number.

## claude notes (deferred to phase 5 docs)

- `score.py` module docstring's verify_source paragraph is accurate again after the revert ("first
  Yes/No token"); the phase-5 docstring sync will confirm it reads cleanly with the refusal note.
- Phase-5 prose: ~75 of the refused cells declined then offered a from-memory reconstruction;
  excluding them (correct under the frozen rule) is part of why `opus` reads 100% — one sentence
  beside the coverage explanation, with the 0.68 cell and the 1/21 hedge.
