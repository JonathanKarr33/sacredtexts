# Phase 8 — iter-3 context for reviewers

iter-2 was codex REQUEST_CHANGES + claude COMMENT; both re-ran the pipeline and
confirmed the evidence is real and reproducible. Their three overlapping findings are
all fixed in commit `7e326ef`. Full disposition: `1-phase_8-iter2-rebuttals.md`.

## What changed since iter-2

1. **TUTORIAL no longer writes over the committed evidence** (codex #1, claude #1).
   Rewritten into three tracks:
   - **Track A — explore the committed run (no keys):** reads
     `runs/first-run-2026-10-11/` and re-derives scores to `/tmp` only (verified:
     `git status runs/` stays clean after it).
   - **Track B — your own run (needs keys):** `RUN=runs/my-run`; generate → audit →
     collect → score all under `$RUN`. A verbatim `collect` now actually calls the
     panel (the old command targeted the already-complete committed `answers.jsonl`,
     so it resume-skipped all 400 cells and made zero calls).
   - **Track C — view.**

2. **Keyless `score` no longer emits a degraded panel "proof"** (codex #2, claude #1).
   `score.py` omits the `panel` block entirely when no run config is supplied (so it
   never renders a `provider: null` table under a proof heading); `usage` is still
   emitted because it is evidence-derived. New assertion covers no-config →
   `usage` present, `panel` absent.

3. **Cost path is now reachable and tested** (codex #3, claude #3). `ModelSpec` gains
   optional `price_in`/`price_out`; `load_config` validates them (both-or-neither,
   non-negative); the score CLI threads them into the panel; `score.py` computes
   per-model + total `cost_usd` only when supplied (prices never invented).
   `models.example.yaml` documents the fields. New test
   `test_usage_totals_and_optional_cost` exercises the cost path, the no-price path,
   token totals, and panel served_by.

4. **iter-2 usage/panel code is now under test** (claude #2): the test above plus the
   no-config/no-panel assertion in `test_score_file_and_summary`.

The committed `runs/first-run-2026-10-11/summary.json`/`summary.md` are unchanged
(the with-config output is byte-identical under the new code) and still carry the
panel proof (`claude-haiku → anthropic / api.anthropic.com`; three others → `openai
/ openrouter.ai`) and token totals (25,220 in / 134,131 out).

Deferred to `codev/reviews/1-*.md` (gated Phase-6 contract, both reviewers agree):
the abstention-vs-hallucination split and the 17 haiku near-misses.

Gate: `pipelines` 141 tests, `apps/viewer` 412 / 9 skipped — all green.
