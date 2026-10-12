### Iteration 1 Reviews
- codex: APPROVE — Phase 3 delivers a complete, audited, secret-free, unpriced 100-question tutorial run with four valid panel entries and reproducible three-script evidence.
- claude: REQUEST_CHANGES — Run artifacts are reproducible, audit-clean, secret-free and correctly identity-marked, but the run README's analysis misattributes the search-on degradation to orthographic variance and wrongly reports no Talmud lift, when 20/400 zero-scored cells contain the exact reference text and opus-search retrieved the Aramaic in ~24% vs 0% for search-off.

### Builder Response to Iteration 1
# Phase 3 (committed tutorial run) — Iteration 1 rebuttals

**Codex: APPROVE / HIGH / no issues. Claude: REQUEST_CHANGES / HIGH** — one substantive,
load-bearing issue, which I **accept in full**. Claude verified against the committed data
(regenerated the question set to `/tmp`, confirmed byte-identical digest, then recomputed the
scores) and found my run `README.md`'s causal analysis contradicted by its own committed numbers.
It is a documentation defect, not an artifact defect — and the corrected story is both true and
more interesting than what I shipped.

## Blocking (claude): the README misreported the central finding — ACCEPTED, fixed (doc-only)

My README concluded "web search did not improve strict-reference accuracy, and slightly reduced
it," blamed the Qur'an drop on **orthographic variance**, and said the Talmud showed a flat
**recall floor** that "web search does not lift." I independently recomputed from the committed
`answers.jsonl` + `scores.jsonl` (using the repo's own `normalize`), counting how often each
answer *contains* the normalised reference text:

| model        | headline `correct` | contains exact ref | scored 0 yet contains it |
|--------------|--------------------|--------------------|--------------------------|
| opus         | 66                 | 66                 | 0                        |
| opus-search  | 66                 | **74**             | **8**                    |
| haiku        | 47                 | 47                 | 0                        |
| haiku-search | 40                 | **52**             | **12**                   |

The data says the **opposite** of my prose, and claude was right on every point:

1. **Not orthography — wrappers.** 20 of 400 cells score 0 while containing the exact reference
   text, and **all 20 are search-on** (opus-search 8, haiku-search 12). The search-on answers
   wrap the correct quote in citation/attribution prose; the "and nothing else" headline scores
   the wrapper as wrong. Only **one** search-on Qur'an miss is a genuine text/orthographic
   difference (confirmed by recompute: haiku-search Qur'an *contains-exact* 24/33 vs. headline
   12/33 — 12 wrapped, not misspelled). My orthographic-variance explanation was wrong.
2. **Talmud lift was inverted.** opus-search *contains the exact Aramaic reference in 8/34 (~24%)
   vs. 0/34 for opus-off* (recomputed, matches claude). Web search lifted Aramaic Talmud
   retrieval from nothing to ~24%; the headline hid it because the model cited its source around
   the quote. My "web search does not lift this" was flatly false.
3. **The opus right→wrong flip is a wrapper, not sampling noise.** `retrieve_quote-642fbf516c7a`
   is `normalize`-equal to the expected āyah and scored 0 only for a trailing English disclaimer.

**Fix (doc-only, no re-collect / no re-score / no code change / no spend):** rewrote the README's
"## The contrast" and "## Reading the scores" sections to lead with the **contains-exact-reference**
cut, the 20-wrapped-cells asymmetry (all search-on), the Talmud 8/34-vs-0/34 lift, and the Qur'an
24-vs-19 contains comparison — i.e. *web search retrieves more correct scripture, and the strict
headline penalises the citation wrapper*. The numbers in the README are recomputable from the
committed artifacts.

### On the scoring contract and the optional strengthener

Per claude and **spec requirement 4**, I did **not** touch `_SUBMETRICS` or the `retrieve_quote`
headline rule — the headline is working as designed; it was the prose that was wrong. Claude
suggested optionally adding a "contains exact reference" *metric* to the pipeline. I deliberately
kept it **out of the scoring code**: adding a submetric changes `scores.jsonl`'s shape, which
would force a re-score of the committed run and break the byte-for-byte re-score regressions in
`test_first_run_regression.py` and `test_tutorial_run.py` — a much larger, contract-adjacent
change for a Phase-3 documentation fix. Instead I put the recomputed contains-exact numbers
directly in the README prose, which gives the reader the discriminating data with zero code or
scoring change. A pipeline-level `contains_reference` submetric is a reasonable future refinement
(note it in the review/lessons doc), not this phase's work.

### `token_f1` caveat — corrected with my own recompute

Claude noted `token_f1` is an unreliable wrapper detector and cited a median ~0.54. My recompute
over the 20 wrapped cells gives a median of **0.45** (Qur'an-only 0.47; range 0.16–0.99) — same
conclusion (well below 1.0; a short quote diluted by an English caveat does not surface as "high
f1"), so I used my defensible figure in the README rather than claude's slightly-different subset.

## Net

Artifacts were already sound (codex APPROVE; claude confirmed reproducible, audit-clean,
secret-free, correctly identity-marked, 195 tests green). The single blocking issue was a false
interpretation in a committed public deliverable; it is corrected to match the data, with no
re-collection, no re-scoring, no spend, and no change to the scoring contract. 195 tests still pass.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
