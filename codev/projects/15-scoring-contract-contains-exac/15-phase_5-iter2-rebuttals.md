# Phase 5 impl consult (iter2) — disposition

codex **REQUEST_CHANGES** (two more stale user-facing READMEs), claude **COMMENT** (approve + two
nits). All fixed; dispatcher 346 pass / 1 skip. No code behaviour change.

- **`pipelines/README.md` score step** rewritten to the Spec-15 contract: selected named graders →
  OR-of-verdicts headline (default strict+containment), `--evaluator` subset selection, the
  paid/separate-pass #21 grader, and the outcome (refused) + accuracy-with-coverage reporting.
- **`apps/viewer/README.md`** leaderboard + explorer descriptions now match the shipped viewer:
  coverage column of equal weight, the four outcomes (correct/incorrect/refused/missing), the
  refused filter (`mode=missing/refused/wrong`), and the search-on/off contrast.
- **first-run README token_f1** now cites the **graded-cell** means from `summary.json` (~0.15 gemma
  / ~0.24 llama), not the abandoned all-100-cells denominator (claude).
- **CODE_WALKTHROUGH recipe** now names the `Grader.default = True` trap (`graders.py:37`): a new
  inline grader joins the default headline and reshapes committed `scores.jsonl` unless
  `default=False` (claude).
- **`cli.py:349` → `cli.py:361`** (the tools-marker line); `collect.py:129` already lands on the
  `panel_fingerprint` write, left as-is.

No rebuttals — all real.
