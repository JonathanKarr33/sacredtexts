# Spec 15 — Rebuttal to iteration-1 review (codex + claude)

Both reviewers returned **REQUEST_CHANGES (HIGH)** and converged. The feedback was accurate and
code-verified; I independently re-verified the two load-bearing claims (reporting surface, first-run
delta) against the code and evidence before accepting. **All points accepted and folded into the
revised spec** — no substantive disagreement. Summary of each point and the change made.

## Reporting surface does not exist / "renders as a summary column" unachievable (codex #2, claude #1) — ACCEPTED

Verified myself: `summary_markdown()`→`_cell_str()` renders only `accuracy (n=N)` (no submetric
columns in any committed `summary.md`); the viewer leaderboard shows no submetrics and
`QuestionList.tsx:85-87` / `localResults.ts:169` hard-code exactly three metrics. My first draft's "at
a glance / renders as a summary column" claim was wrong.

**Change + reconciliation:** rather than scope in a viewer/Markdown column (complexity the maintainer
asked to avoid), I **recommend adopting the headline contract** `correct = normalized OR
contains_reference` for the two text-retrieval tasks. The recovered cells then move the **accuracy**
number that `summary.md` and the leaderboard *already* render — so the gain is visible at a glance with
**no new surface and no viewer change**. `contains_reference` is carried in `scores.jsonl` +
`summary.json` for transparency. Desired State / Success Criteria reworded accordingly; an optional 4th
explorer `<Metric>` row is listed as a nice-to-have, not required.

## `_SUBMETRICS`-alone raises `KeyError` in `score_file`'s fixed-key accumulator (claude #1 trap) — ACCEPTED

Correct: the accumulator is seeded `{"n","correct","exact","normalized","token_f1"}` then read as
`acc[sm]`. Added an explicit constraint + success criterion that the accumulator must learn the new key
alongside `_SUBMETRICS`, and flagged `CODE_WALKTHROUGH.md:256` ("add a line to `_SUBMETRICS`") as
misleading and in-scope to correct. Added an accumulator test scenario.

## The 20 and 29 sets overlap by 4 — residue is 25, not 29 (claude #2) — ACCEPTED

My "a further 29 … not contained" was false. Corrected the Problem Statement to **25** not-contained
near-miss cells, and defined the judge-pilot cell set precisely as
`normalized==0 ∧ token_f1 high ∧ ¬contains_reference`.

## First-run delta unstated (codex #5, claude #3) — ACCEPTED

Verified: first-run has a +1 cell delta (claude-haiku 24 %→25 %). Pre-registered **both** deltas
(tutorial +20, first-run +1) in Desired State / Success Criteria / test scenarios as predicted evidence
for the rebaseline.

## More guards affected than listed (claude comment) — ACCEPTED

`test_score.py:46` and `:231` assert whole metrics dicts by equality and will break too. Enumerated
**all four** affected guards (two run guards + the two `test_score.py` asserts) as the rebaseline scope.

## Convert decided open questions into decisions (codex #3) — ACCEPTED

Added a **Decisions (resolved)** section: word-bounded containment = yes; `complete_unit` = yes; judge
pilot = out of scope for this PR; empty-expected = `contains_reference=0`.

## Empty-normalized-reference behavior undefined (codex #4, claude edge case) — ACCEPTED

`re.escape("")` would match anywhere. Decided: empty-normalising expected → `contains_reference = 0`.
Added as a decision, a success criterion, and a test scenario.

## Headline decision: deferring past rebaseline forces a second rebaseline (codex #1, claude comment) — ACCEPTED

The tension both flagged: "purely additive, nothing changes" is incompatible with a later `correct`
change, and deferring the decision past the rebaseline costs a second re-score.

**Resolution:** I now **recommend implementing the headline adoption now** so the rebaseline is done
**once**, while honoring the architect's directive that the contract change is *surfaced to the human at
the PR gate*. Surfacing ≠ deferring the implementation: the human confirms (or reverts to diagnostic-only)
at PR, and the spec pre-analyses the revert as a **bounded, single** second rebaseline. This removes the
additive-vs-headline contradiction codex identified.

## Sign-inversion strengthens the argument (claude comment) — ACCEPTED

Adopted: the Problem Statement now leads with the sign-inversion (haiku-search 40 %→52 % vs 47 %) rather
than "+5pp" — a sharper motivation and direct justification for the recommended headline adoption.

## Judge-pilot copyright egress (claude comment) — ACCEPTED

Sending `restricted`-source (NABRE, TLG) expected text to a third-party judge API is egress the audit
gate (committed-artifact-only) does not cover. Added to Approach 3 cons and the judge-pilot success
criterion ("never egresses restricted-source expected text").

## Docs out of date (claude comment) — ACCEPTED

Added `CODE_WALKTHROUGH.md` §4/§5 + line ~256 and `runs/tutorial-2026-10-11/README.md` to References and
to a success criterion (update to match the new contract).

---

**Net:** every REQUEST_CHANGES point and comment accepted; spec revised in iteration 2. The central
design move — recommending headline adoption so the gain rides the existing accuracy surface — resolves
the reporting-surface, double-rebaseline, and keep-it-simple concerns together. The only item left
genuinely open is the human's PR-gate confirmation of the headline contract (the architect's call to
surface), with the revert pre-analysed.
