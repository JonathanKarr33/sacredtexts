### Iteration 1 Reviews
- codex: REQUEST_CHANGES — Phase 5 is substantially complete, but several documentation statements contradict the implementation or committed evidence.
- claude: REQUEST_CHANGES — Phase-5 doc sync is substantively complete and the evaluator recipe/pointers check out, but two factual errors in the tutorial run README's caveats (267/268 reported as 265/266; "74 correct Talmud cells" where it is 8) and a stale scoring contract in arch.md need fixing.

### Builder Response to Iteration 1
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


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
