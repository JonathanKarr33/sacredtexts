# Phase 8 — iter-3 consult disposition

**claude APPROVE, codex COMMENT** — both non-blocking; the reviewers converged.
claude verified the load-bearing claims by execution (Track A scoring reproduced to
`/tmp` byte-identical with `git status runs/` clean; Track B generation byte-identical,
digest `ef837474`; dev server serves the run; both gates green). No blocking issues.

All remaining comments were cheap and are landed:

1. **Partial-pricing cost total** (codex key issue, claude comment #1 — the one real
   defect). Fixed in this iteration: a TOTAL `cost_usd` is emitted only when EVERY
   model is priced; unpriced models and a partially-priced total render `n/a` /
   `n/a (partial pricing)` instead of `$0.0000`. The test now asserts the
   partial-pricing (no-total) behaviour and a separate all-priced case asserts the
   total appears. (This is the uncommitted work claude saw in the tree — now landed
   with the updated test.)

2. **TUTORIAL Track B audited only the questions** (claude comment #2): added a
   post-`score` `audit "$RUN"` step so the `answers`/`scores` a user would commit are
   audited too.

3. **`cp` could clobber a user's panel** (claude comment #5): `cp -n` + a note.

4. **Committed evidence was not self-describing** (claude comment #4 — "before
   Monday's meeting"): added `runs/first-run-2026-10-11/README.md` stating the strict
   contract, the abstention-vs-fabrication caveat (gpt-oss-20b ~58/100 explicit
   refusals; gemma/llama fabricate; the split is the informative next cut), the
   claude-haiku near-miss note, and that the audit ran origin-only here.

5. **Content layer inert without local restricted payloads** (claude comment #3,
   codex iter-1/2): documented in the run README and `pipelines/README.md`; the
   deeper note goes in `codev/reviews/1-*.md`.

Deferred to the review doc (gated Phase-6 contract, both reviewers agree): the
abstention-vs-hallucination metric and the relaxed "quote-contained" retrieval
metric.

Gate: `pipelines` 142 tests, `apps/viewer` 412 / 9 skipped — all green.
