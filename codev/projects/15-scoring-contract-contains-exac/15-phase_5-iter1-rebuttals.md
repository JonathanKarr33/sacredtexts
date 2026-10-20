# Phase 5 impl consult (iter1) — disposition

codex + claude both **REQUEST_CHANGES** — all concrete doc/factual fixes (no code behaviour).
All addressed; dispatcher 345 pass / 1 skip, `test_code_walkthrough` 100 pass.

## Factual corrections (both lanes)

- **`runs/tutorial/README.md` "74 correct Talmud cells" → 8.** 74 is opus-search's *overall* correct
  count; only 34 Talmud questions exist and it contains the reference in 8. Reworded to "one of
  opus-search's 8 correct Talmud cells".
- **"265/266 refused cells below token_f1 0.3" → 267/268.** Verified across both committed runs: 268
  refused, 267 below 0.3, exactly one above (`e2d74279aaf0`, 0.68). Also reconciles the "across 268"
  in the same bullet.
- **`TUTORIAL.md` "a point of accuracy (100%→97%)" → "~3 points".**
- **first-run README mean token_f1 "0.13–0.24" → "~0.15 gemma / ~0.21 llama"** (the measured means).

## Stale contract wording (both lanes)

- **`TUTORIAL.md` grader sentence** no longer says a separate-pass grader is selected via
  `--evaluator`; it now states `--evaluator` accepts only inline graders and the paid/separate-pass
  grader (#21) merges through its own resumable pass (matches `graders.resolve_evaluators`).
- **"every answer gets both tiers"** removed from `CODE_WALKTHROUGH.md:241` and `score.py`'s opening
  docstring — both now say the selected graders set the emitted retrieval metrics + headline, plus
  the always-on outcome.
- **"strict + normalized + token-F1" one-liners** updated in the root `README.md` and `TUTORIAL.md`
  score step to the graders/coverage/refused contract.
- **`codev/resources/arch.md`** scoring bullet rewritten to the Spec-15 contract (grader-OR headline,
  refused outcome + coverage, sanctioned rebaseline, #23) — it had lagged the updated `arch-critical.md`.

No rebuttals — every point was a real doc error or staleness.
