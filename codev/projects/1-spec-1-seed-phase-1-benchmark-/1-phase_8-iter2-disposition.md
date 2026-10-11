# Phase 8 — iter-2 consult disposition

codex REQUEST_CHANGES, claude COMMENT. Both re-ran the pipeline and confirmed the
evidence is real and reproducible (scores byte-identical on re-score; usage totals
25,220/134,131 match; panel proof present and secret-free; the audit content-layer
test is non-vacuous). The two reviewers' findings overlap; all three are accepted
and fixed. (Both lanes printed a "working tree / repo moved" warning — that was my
committing the iter-2 **context** file and the price-field edits while the lanes
ran; it touched no reviewed conclusion.)

## Fixed

1. **TUTORIAL `collect` targeted the already-complete committed `answers.jsonl`**
   (codex #1): a verbatim fresh-clone `collect` there resume-skips all 400 cells and
   makes zero calls, so the documented step never actually collects. → TUTORIAL is
   restructured into **Track A** (explore the committed run — keyless, writes only to
   `/tmp`), **Track B** (your own run under a fresh `runs/<id>/` — generate → audit →
   collect → score all under `$RUN`), and **Track C** (view). A verbatim Track B run
   now genuinely collects; nothing writes over the committed evidence.

2. **Keyless `score` overwrote the committed summary with a null-provider panel**
   (codex #2, claude #1): without `--config` the panel block rendered `provider:
   null`/`endpoint: null` under a "proof" heading, and writing to the committed paths
   clobbered the real proof. → two fixes: Track A's keyless score writes to `/tmp`
   (committed artifact is read, never rewritten — verified: `git status runs/` stays
   clean), and `score.py` now **omits the panel block entirely when no run config is
   supplied** (usage, which is evidence-derived, is still emitted). New assertion:
   no-config summary has `usage` but no `panel`, and the markdown has no "Panel".

3. **Cost branch unreachable + docs claimed otherwise** (codex #3, claude #3):
   `price_in`/`price_out` were read from the panel dict but never produced. → wired
   end to end: `ModelSpec` gains optional `price_in`/`price_out`; `load_config`
   validates them (both-or-neither, non-negative); the score CLI passes them into the
   panel; `score.py` computes per-model + total `cost_usd` only when present (never
   invents prices). New test `test_usage_totals_and_optional_cost` exercises the cost
   path, the no-price path, totals, and panel served_by. `models.example.yaml` shows
   the optional fields; `README` already states the "cost only if prices supplied"
   contract, now true.

4. **No tests for the iter-2 usage/panel code** (claude #2): added
   `test_usage_totals_and_optional_cost` (usage per-model + totals, a row with no
   `usage` contributing 0, cost path, panel passthrough) and the no-config
   usage/no-panel assertion above.

## Agreed, deferred to the review doc (gated Phase-6 contract)

- Abstention-vs-hallucination split and the 17 haiku near-misses → `codev/reviews/1-*.md`
  / Spec 2 (both reviewers agree it's the run's most interesting signal but not a
  Phase-8 contract change).

Gate: `pipelines` 141 tests, `apps/viewer` 412 / 9 skipped — all green.
