# Plan: Scoring contract — contains-exact discriminator

**Specification**: [codev/specs/15-scoring-contract-contains-exac.md](../specs/15-scoring-contract-contains-exac.md)

## Executive Summary

Implements the spec's **Approach 1** (the recommended one): a deterministic, word-bounded
`contains_reference` submetric for the two text-retrieval tasks (`retrieve_quote`, `complete_unit`),
adopted into the headline as `correct = normalized OR contains_reference`. Approach 2 (encoding-variance
folding of `normalize()`) is rejected; Approach 3 (LLM judge on the 25 not-contained near-miss cells) is
deferred and out of scope for this PR.

**Why the phase shape is two phases, not three.** The scorer contract change and the rebaseline of the
two committed runs are *intrinsically one atomic unit*: changing the per-answer `metrics` dict makes the
committed `scores.jsonl` no longer reproduce, so the byte-for-byte run guards go red until the evidence is
regenerated. Splitting code from evidence would leave a red tree at a commit boundary; splitting
"diagnostic submetric" from "headline adoption" would force **two** rebaselines — exactly what the spec
and both reviewers said to avoid. So Phase 1 lands the scorer change **and** the one-shot rebaseline
**and** all four affected guard updates as a single green commit, with the pre-registered deltas
(tutorial `+20`, first-run `+1`) documented so the architect can surface the contract change at the PR
gate. Phase 2 syncs the docs that describe the old contract. The headline-vs-diagnostic confirmation is
the human's call at the PR gate (spec Open Questions); a revert is a bounded second rebaseline, pre-analysed.

## Phases (Machine Readable)

<!-- REQUIRED: porch parses this JSON to track phase progress. Keep it in sync when you add or remove phases; at least two phases. -->

```json
{
  "phases": [
    {"id": "phase_1", "title": "Contains-exact scoring contract + one-shot rebaseline"},
    {"id": "phase_2", "title": "Documentation sync for the new contract"}
  ]
}
```

## Phase Breakdown

### Phase 1: Contains-exact scoring contract + one-shot rebaseline

**Dependencies**: None

#### Objective

Add the deterministic `contains_reference` signal to the two text-retrieval tasks, adopt it into the
headline, and regenerate the committed run evidence + guards in the same atomic commit — leaving the tree
green and the search sign-inversion corrected. This is the whole user-visible value: the recovered gains
move the accuracy number `summary.md` and the viewer leaderboard already render.

#### Files to Create / Modify

- `pipelines/sacredbench/score.py` — in `score_answer()` for `retrieve_quote`/`complete_unit`: compute
  `contains_reference` (word-bounded normalized containment of `expected["text"]` in the answer, reusing
  the `(?<!\w)…(?!\w)` boundary style; **empty-normalising expected → 0**); set
  `correct = normalized OR contains_reference`. Add `"contains_reference"` to `_SUBMETRICS` for both
  tasks. Extend `score_file()`'s per-cell accumulator seed and the `acc[sm] += …` path so the new key
  aggregates without `KeyError`. **Do not touch** `normalize()`, `strip_script_marks()`, or the five
  provenance/other task branches.
- `pipelines/tests/test_score.py` — update the two whole-`metrics`-dict equality assertions (`:46`,
  `:231`) to include `contains_reference`; add unit cases: wrapped-exact (`﴿…﴾` / trailing note) →
  `contains_reference=1, normalized=0, correct=1`; strict match → both 1; not-contained near-miss → 0;
  fragment/boundary (`Jude 1:3` not in `Jude 1:30`); empty expected → 0; provenance-task dicts unchanged
  (no `contains_reference` key); accumulator carries the key.
- `runs/first-run-2026-10-11/scores.jsonl`, `runs/first-run-2026-10-11/summary.json`,
  `runs/first-run-2026-10-11/summary.md` — regenerated (rebaseline).
- `runs/tutorial-2026-10-11/scores.jsonl`, `runs/tutorial-2026-10-11/summary.json`,
  `runs/tutorial-2026-10-11/summary.md` — regenerated (rebaseline).
- `pipelines/tests/test_first_run_regression.py`, `pipelines/tests/test_tutorial_run.py` — the
  byte-for-byte re-score guards pass against the new committed `scores.jsonl` (no logic change needed if
  the committed files are regenerated; confirm green).

#### Deliverables

- [ ] `contains_reference` computed for `retrieve_quote`/`complete_unit` only; word-bounded; empty-expected guard.
- [ ] `correct = normalized OR contains_reference` for those two tasks; all five other task branches byte-for-byte unchanged.
- [ ] `_SUBMETRICS` **and** `score_file` accumulator both carry `contains_reference` (no `KeyError`); it appears in `scores.jsonl` and `summary.json`.
- [ ] Both committed runs rebaselined **once**: regenerated `scores.jsonl` + `summary.{json,md}`; panel/usage blocks preserved verbatim; only the accuracy figures move (+20 tutorial, +1 first-run) plus the `generated_at` timestamp.
- [ ] All four affected guards green (`test_first_run_regression.py`, `test_tutorial_run.py`, `test_score.py:46`, `test_score.py:231`).
- [ ] Tests for this phase (the `test_score.py` cases above).

#### Acceptance Criteria

- [ ] `.codev/checks/test.sh` (pipelines → uv pytest) passes; the two run guards re-score the regenerated committed answers byte-for-byte.
- [ ] Tutorial: the 20 identified wrapped-exact cells flip to `correct=1`; haiku-search 40 %→52 %, opus-search by its measured delta; no no-tools cell moves. First-run: claude-haiku 24 %→25 %; no other cell moves.
- [ ] Latin-invariance: every Latin answer in first-run keeps `exact`/`normalized`/`token_f1`; `normalized` unchanged everywhere.
- [ ] Copyright audit gate (`audit.py` in `.codev/checks/test.sh`) passes on the rebaselined artifacts.
- [ ] The commit message / review pre-registers the exact +20 / +1 deltas as predicted evidence for the PR gate.

#### Test Plan

- **Unit** (`test_score.py`): the wrapped-exact / strict / not-contained / boundary / empty / provenance-unchanged / accumulator cases above, including real tutorial wrapper strings (`﴿…﴾`, trailing English note).
- **Regression** (both run guards): re-score committed `answers.jsonl` → reproduces the regenerated `scores.jsonl` byte-for-byte.
- **Evidence assertion** (may live in a test or be shown in the review): recomputed tutorial/first-run accuracy deltas equal exactly +20 / +1 and touch only search-on / the one first-run cell.
- **Manual**: open the regenerated `summary.md` for both runs and confirm the headline accuracy reflects the recovered cells.

### Phase 2: Documentation sync for the new contract

**Dependencies**: Phase 1

#### Objective

Bring the prose docs that currently describe the *finding* (and the old frozen contract) into line with the
*implemented* contract, so no doc contradicts the code or misleads the next contributor.

#### Files to Create / Modify

- `CODE_WALKTHROUGH.md` — the `_SUBMETRICS` list (~`:246`) now includes `contains_reference`; fix the
  misleading "add a line to `_SUBMETRICS`" note (~`:256`) to state the accumulator must learn the key too;
  update §5 (~`:310`-`:325`, the contains-exact follow-up / `token_f1`-unreliability note) from "a follow-up
  should…" to "implemented as `contains_reference`, adopted into the headline"; check §4 task-touching table
  (~`:281`-`:288`) references.
- `runs/tutorial-2026-10-11/README.md` — the contains-exact table (~`:44`-`:110`) and the "scored 0 yet
  contains it" caveat now describe a scored signal, not a hidden one; update the headline figures to the
  rebaselined numbers.

#### Deliverables

- [ ] `CODE_WALKTHROUGH.md` §4/§5 + the `_SUBMETRICS`/accumulator note updated and internally consistent with `score.py`.
- [ ] `runs/tutorial-2026-10-11/README.md` reflects the new contract and the rebaselined headline figures.
- [ ] No test asserts on these prose files beyond existing ones; confirm `test_code_walkthrough.py` (which pins `_SUBMETRICS = {` and line anchors) still passes.

#### Acceptance Criteria

- [ ] `.codev/checks/test.sh` still green (notably `test_code_walkthrough.py`, which anchors CODE_WALKTHROUGH references).
- [ ] A reader of either doc gets the current contract, not the pre-change finding.

#### Test Plan

- **Regression**: `test_code_walkthrough.py` passes (its `_SUBMETRICS`/line anchors still resolve).
- **Manual**: read both docs end-to-end for contradictions with `score.py` and the rebaselined summaries.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Summary regeneration drifts panel/usage/cost blocks (not just accuracy) | Medium | Medium | Regenerate scores via the guarded `score_file` path; carry panel/usage blocks forward verbatim (they derive from unchanged answers + config); assert only accuracy + `generated_at` differ from committed. |
| `_SUBMETRICS` add without accumulator seed → `KeyError` | Medium | Medium | Phase-1 deliverable updates both together; the run guards + unit tests catch it immediately. |
| A provenance task's dict changes accidentally | Low | High | Phase-1 touches only the two text-retrieval branches; a unit case asserts the other five dicts byte-for-byte. |
| `test_code_walkthrough.py` line anchors break when editing CODE_WALKTHROUGH | Medium | Low | Phase 2 re-runs that test; adjust anchors if the pinned line moves. |
| Merge race with `aspir-11` (score.py/cli.py/guards) | Medium | Low | Narrow additive diff; no viewer/standings change; second merger rebases per the coordination note. |
| Human reverts headline to diagnostic-only at PR | Low | Medium | Pre-analysed as a bounded second rebaseline (accuracy returns, `contains_reference` stays a column); documented in the review. |
| Double rebaseline from splitting code/evidence | Low (avoided by design) | Medium | Phase 1 bundles scorer + rebaseline + guards into one atomic commit. |

## Documentation Updates

- `CODE_WALKTHROUGH.md` (§4/§5, `_SUBMETRICS`/accumulator note) — Phase 2.
- `runs/tutorial-2026-10-11/README.md` — Phase 2.
- Spec 15 review (`codev/reviews/15-…md`) records the pre-registered rebaseline deltas, the judge-pilot deferral rationale, and the headline-contract decision routed to the PR gate.
- `arch-critical.md` scoring-contract line (`_SUBMETRICS`/headline) — candidate update via the MAINTAIN arch-doc step if the headline contract is confirmed at PR; not edited in this PR.
