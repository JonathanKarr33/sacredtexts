# Spec 15 — plan iteration-1 rebuttal → SUPERSEDED BY A BINDING RE-SCOPE

**Read this first.** Between the iteration-1 plan reviews and now, the human posted a **binding scope
comment on issue #15** (2026-10-12) and the architect **approved a full re-plan** (rollback to the plan
phase). The plan has been **rewritten end-to-end** — it is no longer the 2-phase "add a `contains_reference`
submetric" plan the iteration-1 reviews (`15-plan-iter1-codex.txt`, `15-plan-iter1-claude.txt`) critiqued.
Those reviews were about the old plan; their specific concerns were already addressed in the old
iterations 2–3 (see git history) and then the whole plan was replaced. **Please review the NEW plan fresh.**

## What changed (the frozen six-decision scope + the #21 seam)

The work is now an **evaluator/outcome framework**, not a single submetric:

1. **Containment = correct** in the headline for text-retrieval — **already implemented and reviewed in
   phase 1** (commits `2e17d84`, `142fc5c`): `correct = normalized OR contains_reference`, both runs
   rebaselined once (+20 / +1), durable-oracle witness green. This resolves the old plan's "route the
   headline decision to the PR gate" open question — **the human decided it; it is done.**
2. **Refusal is an OUTCOME, not a grader.** Every cell is exactly one of correct / incorrect / refused;
   deterministic refusal detection runs in core outcome classification and **short-circuits** grading;
   accuracy excludes refusals; reported in scores/summary/viewer.
3. **A named-grader registry** (`strict`, `containment`; future paid `jev` deferred) with an "add an
   evaluator" recipe in `CODE_WALKTHROUGH.md`.
4. **The viewer surfaces the search-on/off contrast** without a README.
5. **`score --evaluator`** selects graders (comma-sep/repeatable; default = deterministic set; unknown fails
   fast; paid never default).
6. **TUTORIAL.md** gains a grader sentence; the recipe shows name-selectability.

Plus the **issue #21 forward-compat seam**: a future paid, resumable, **separate-pass** Jev judge grader must
be *expressible* (merges verdict+probability metrics into `scores.jsonl`) — not built here; the seam must not
assume graders are free/local/synchronous.

## New plan shape (p1–p5)

- **p1** Containment headline + rebaseline — **DONE** (satisfies decision 1).
- **p2** Named-grader registry + `score --evaluator` CLI — **pure refactor**, byte-identical `scores.jsonl`,
  no rebaseline; expresses a separate-pass/paid grader for #21.
- **p3** Refused outcome classification (short-circuits graders) — the **second deliberate rebaseline**.
- **p4** Viewer: three outcomes + refused status/filter + search-on/off contrast.
- **p5** Documentation sync (recipe, TUTORIAL sentence, run READMEs incl. the 1/21-hedge caveat, governance).

## Carry-over from the phase-1 implementation review (keep as PR-gate evidence)

- **1 of phase-1's 21 rescued cells is a hedge** (`opus-search / retrieve_quote-4ad4392645da`, Ketubot 8a:8):
  the expected text is the model's *secondary* guess in a two-candidate hedge; containment has no anti-hedge
  rule (unlike cite/identify). ~1pt on opus-search. Documented in p5's README prose + the review; prose must
  not overstate the rescue's cleanliness.

Architect-confirmed: scope frozen, two deliberate rebaselines, one PR. Please review the new plan on its own
terms.
