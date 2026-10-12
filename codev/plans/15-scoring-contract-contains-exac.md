# Plan: Scoring contract — containment headline, refused outcome, named-grader framework

**Specification**: [codev/specs/15-scoring-contract-contains-exac.md](../specs/15-scoring-contract-contains-exac.md)

## Executive Summary

Implements the spec's **Approach 1**: a deterministic **outcome classifier** (correct / incorrect /
refused) wrapping a small **named-grader registry** (`strict`, `containment`; future paid `jev` expressible
but unbuilt), selectable via `score --evaluator`. Refusal is an **outcome**, not a grader — detected
deterministically, run first, short-circuiting grading, universal across tasks, excluded from the accuracy
denominator. The judge pilot stays deferred (issue #21); the seam only has to let a separate-pass grader
merge metrics into `scores.jsonl`.

**Five phases, two deliberate rebaselines, one PR.** Phase 1 (containment headline + its rebaseline) is
**already merged on-branch and reviewed**. Phase 2 refactors the hardwired tiers into the named-grader seam
+ CLI as a **pure refactor** (byte-identical `scores.jsonl`, no rebaseline). Phase 3 adds the refused outcome
end-to-end — the **second** deliberate rebaseline (it adds `outcome` and changes the accuracy denominator).
Phase 4 makes the viewer tell the story (refused status/filter + search-on/off contrast). Phase 5 syncs the
docs. The whole re-scope lands as one PR (architect-directed); the headline is **decided** (no PR-gate
conditional). `Co-Authored-By` trailers are stripped from branch history in one non-interactive pass just
before the PR.

**Ordering rationale.** Build the grader seam (p2) before the outcome layer (p3) so refusal classification
wraps a stable grading interface; p2 is a no-op on the evidence (keeps the honest-diff story clean), and p3
is the single new rebaseline. Viewer (p4) depends on the p3 outcome shape. Docs (p5) last, once behaviour is
settled.

## Phases (Machine Readable)

<!-- REQUIRED: porch parses this JSON to track phase progress. Keep it in sync when you add or remove phases; at least two phases. -->

```json
{
  "phases": [
    {"id": "phase_1", "title": "Containment headline + one-shot rebaseline (DONE)"},
    {"id": "phase_2", "title": "Named-grader registry + score --evaluator CLI (pure refactor)"},
    {"id": "phase_3", "title": "Refused outcome classification + second rebaseline"},
    {"id": "phase_4", "title": "Viewer: three outcomes + search-on/off contrast"},
    {"id": "phase_5", "title": "Documentation sync for the evaluator/outcome contract"}
  ]
}
```

## Phase Breakdown

### Phase 1: Containment headline + one-shot rebaseline — DONE

**Dependencies**: None — already implemented, reviewed, and committed on-branch (commits `2e17d84`,
`142fc5c`).

#### Objective

Adopt containment into the headline (`correct = normalized OR contains_reference`) for the two
text-retrieval tasks and rebaseline both committed runs once (tutorial +20, first-run +1), with a durable
pinned-oracle witness (`test_contains_reference_rebaseline.py`).

#### Status

Complete. `contains_reference` reuses `_bounded_equal` (empty-guarded); `_SUBMETRICS` + accumulator updated;
provenance tasks untouched; both run guards + 5 viewer guards + the new oracle test green; both lanes pass.
The containment behaviour will be re-expressed as the `containment` grader in Phase 2 with **no change** to
the emitted metrics. **Documented known-issue** (phase-1 claude consult): 1 of the 21 rescued cells
(`opus-search / retrieve_quote-4ad4392645da`, Ketubot 8a:8) is a two-candidate hedge whose expected text is
the model's secondary guess — containment has no anti-hedge rule; carried into Phase 5 README prose + the
review as PR-gate evidence.

### Phase 2: Named-grader registry + `score --evaluator` CLI (pure refactor)

**Dependencies**: Phase 1

#### Objective

Introduce a minimal named-grader seam and make graders selectable on the `score` CLI — **without changing
any emitted metric** (byte-identical `scores.jsonl` ⇒ no rebaseline). This is the extensibility decision
(#3/#5) and the #21 forward-compat, kept simple.

#### Files to Create / Modify

- `pipelines/sacredbench/graders.py` (new) — a small registry: a `Grader` descriptor (name, a callable
  producing metric fields for a text-retrieval cell, `default: bool`, `inline: bool`) and
  `GRADERS = {"strict": …, "containment": …}` both `default=True, inline=True`. The callables wrap the
  existing logic (strict → exact/normalized; containment → contains_reference). A registry lookup that
  **raises on an unknown name** (fail-fast). Document the seam for a `default=False, inline=False`
  separate-pass grader (the future `jev`) whose metrics are merged into `scores.jsonl` by a distinct pass —
  no such grader is added here.
- `pipelines/sacredbench/score.py` — `score_answer` for the text-retrieval tasks delegates to the selected
  graders (default = the deterministic set) to assemble the same metrics dict it emits today; headline stays
  `normalized OR contains_reference`. `score_file` / `score_answer` accept the selected grader set. **No
  metric key or value changes** for the default set. Provenance tasks unchanged.
- `pipelines/sacredbench/cli.py` — `score` gains `--evaluator` (repeatable and/or comma-separated;
  default = the deterministic grader names; unknown ⇒ `ScoreError`/`BadParameter`; a non-default/paid grader
  is never auto-selected). Thread the selection into `score_file`.
- `pipelines/tests/test_graders.py` (new) — registry: known names resolve; unknown fails fast; default set is
  exactly the deterministic graders; a (fixture) non-inline/paid grader is never in the default and is
  representable; selecting `strict` only vs `containment` only vs both yields the expected metric subset.
- `pipelines/tests/test_score.py` — add a case asserting the default-grader metrics dict is byte-identical to
  phase-1 output for a sample cell (the no-op property).

#### Deliverables

- [ ] `graders.py` registry with `strict` + `containment` (default, inline); unknown-name fail-fast; a
      documented separate-pass/paid seam (no paid grader built).
- [ ] `score --evaluator` selects graders (comma-sep/repeatable); default = deterministic set; paid never default.
- [ ] Default-set scoring is a **pure refactor**: re-scoring both committed runs reproduces the current
      committed `scores.jsonl` **byte-for-byte** (the phase-1 run guards + oracle still pass unchanged — NO
      rebaseline this phase).
- [ ] Tests for this phase (`test_graders.py` + the no-op assertion).

#### Acceptance Criteria

- [ ] `.codev/checks/test.sh` green; the two run guards and `test_contains_reference_rebaseline.py` pass
      **unchanged** (proving the refactor emitted identical scores).
- [ ] `score --evaluator bogus` exits non-zero with a clear message; `score` with no flag uses the
      deterministic default; no paid grader is reachable by default.
- [ ] The seam can express a separate-pass grader (a test constructs/registers a non-inline fixture grader
      and shows the metrics-merge path, without running it inline).

#### Test Plan

- **Unit**: `test_graders.py` (resolution, fail-fast, default set, selection subsets, separate-pass fixture);
  `test_score.py` no-op byte-identity for the default set.
- **Regression**: both run byte guards + the oracle test pass with no edits (the refactor is invisible to evidence).
- **CLI**: `score --evaluator` parsing (comma-sep + repeat), unknown fail-fast.

### Phase 3: Refused outcome classification + second rebaseline

**Dependencies**: Phase 2

#### Objective

Add the core, always-on outcome classifier: every answered cell is `correct` / `incorrect` / `refused`.
Deterministic, conservative refusal detection runs first and short-circuits grading; `outcome` is emitted in
`scores.jsonl`; the summary reports the three outcome counts per model/tradition; **accuracy excludes
refusals**. This reshapes `scores.jsonl` and the accuracy denominator ⇒ the **second deliberate rebaseline**.

#### Files to Create / Modify

- `pipelines/sacredbench/graders.py` or a small `outcomes.py` — `classify_refusal(answer, task) -> bool`: a
  **conservative** deterministic matcher (clear decline phrases / shapes, e.g. "I can't/won't reliably
  reproduce…", "I'm not able to provide the exact text"); must not fire on a wrapped quote or a near-miss.
- `pipelines/sacredbench/score.py` — `score_answer` (all tasks): if `classify_refusal` → `outcome="refused"`
  and **skip grading** (no grader metrics decide it); else run grader(s) → `outcome = "correct"|"incorrect"`.
  Emit `outcome` in the metrics dict (keep `correct` as `int(outcome=="correct")` for continuity). `score_file`
  accumulators: per-cell `correct`/`incorrect`/`refused` counts; **accuracy = correct/(correct+incorrect)**;
  `_overall` and `by_tradition` likewise; summary cells expose the three counts.
- `runs/first-run-2026-10-11/*` and `runs/tutorial-2026-10-11/*` — **second rebaseline** (scores.jsonl +
  summary.{json,md}) via the recorded rebaseline script (now also emitting `outcome`), panel/usage preserved.
- `pipelines/tests/test_contains_reference_rebaseline.py` — extend: capture a **fresh** pre-change projection
  oracle (now over the containment-era committed scores) and pin the exact set of cells whose `outcome`
  becomes `refused`, plus the new per-model refused counts; assert nothing else moves.
- `pipelines/tests/test_first_run_regression.py`, `test_tutorial_run.py` — re-score byte guards pass against
  the 2nd-rebaselined evidence (confirm; FIRST_RUN_KEY / standings keys unchanged).
- `pipelines/tests/test_score.py` — outcome exclusivity; refusal short-circuits grading + excluded from
  accuracy; conservative-matcher cases (wrapped/near-miss are NOT refusals); provenance tasks gain only `refused`.

#### Deliverables

- [ ] `outcome ∈ {correct, incorrect, refused}` on every answered cell in `scores.jsonl`; refusal
      deterministic + short-circuits grading; universal across tasks.
- [ ] Summary reports per-model (and per-tradition) correct/incorrect/refused counts; **accuracy excludes refusals**.
- [ ] Second rebaseline of both runs via the recorded script; pre-registered refused set + counts; durable
      oracle extended; panel/usage preserved; no standings-key drift.
- [ ] Tests for this phase (outcome + conservative-refusal units + extended rebaseline witness).

#### Acceptance Criteria

- [ ] `.codev/checks/test.sh` green (both lanes); run byte guards reproduce the 2nd-rebaselined scores.
- [ ] The refused-cell set and per-model refused counts are pinned and documented as pre-registered evidence;
      accuracy denominators exclude exactly those cells.
- [ ] A near-miss retrieval and a wrapped-exact retrieval are classified as answers, not refusals (unit-asserted).
- [ ] Copyright audit passes on the 2nd-rebaselined artifacts.

#### Test Plan

- **Unit**: refusal matcher (real + synthetic declines vs wrapped/near-miss answers); outcome exclusivity;
  accuracy-excludes-refused; provenance `refused`.
- **Rebaseline witness**: fresh oracle hash + exact refused-set + counts; byte guards green.
- **Manual**: open both regenerated `summary.md`; confirm three-outcome reporting + denominator.

### Phase 4: Viewer — three outcomes + search-on/off contrast

**Dependencies**: Phase 3

#### Objective

Make the viewer tell the story without a README: a `refused` status and filter in the error explorer,
refused counts in the leaderboard, and the **search-on vs search-off contrast** visible.

#### Files to Create / Modify

- `apps/viewer/src/lib/localResults.ts` / explorer lib — read the `outcome` field; add `refused` as an
  explorer status alongside correct/incorrect; refused excluded from accuracy, surfaced as its own count.
- `apps/viewer/src/components/QuestionList.tsx` (or the explorer route) — a `refused` status badge + filter.
- `apps/viewer/src/routes/LeaderboardPage.tsx` — show refused count/rate per model.
- Leaderboard/Explorer — a search-on/off **contrast** affordance (e.g. paired on/off rows or a delta column),
  visible without a README; the exact form is an open question (any form that satisfies the criterion).
- `apps/viewer/src/**/*.test.ts(x)` — fixtures/tests for the refused status + filter, refused leaderboard
  count, and an assertion that the on/off contrast is rendered; update any committed-run fixtures the
  3-outcome summary changes.

#### Deliverables

- [ ] Error explorer has a `refused` status + filter; leaderboard shows refused counts.
- [ ] Search-on/off contrast visible in the leaderboard/explorer; a test asserts it.
- [ ] Viewer tests green against the 2nd-rebaselined committed evidence.

#### Acceptance Criteria

- [ ] `pnpm -C apps/viewer test` green; a test fails if the refused status/filter or the on/off contrast is absent.
- [ ] Manual: the contrast and refusals are legible in the UI without reading a README.

#### Test Plan

- **Unit/component**: refused filter narrows correctly; leaderboard refused count matches summary; contrast affordance renders.
- **Manual**: load both committed runs in the viewer; verify the story reads at a glance.

### Phase 5: Documentation sync for the evaluator/outcome contract

**Dependencies**: Phase 4

#### Objective

Bring every doc into line with the decided containment headline, the refused outcome, and the grader seam —
and add the "add an evaluator" recipe.

#### Files to Create / Modify

- `CODE_WALKTHROUGH.md` — add an **"add an evaluator" recipe** alongside recipes A and B, showing how a new
  grader is registered and becomes **selectable by name** via `--evaluator` (and noting the separate-pass/paid
  variant for #21); update `_SUBMETRICS`/accumulator notes, §5, the `:300-308` never-re-score / "add evidence
  not perturb" bullets (sanctioned exceptions), and **re-derive all `score.py:N` pointers**.
- `TUTORIAL.md` — `:94-103` + `:29`: adopt the decided containment headline and the three outcomes; add **one
  plain-language sentence** in the score step about choosing graders (`--evaluator`).
- `runs/tutorial-2026-10-11/README.md` / `runs/first-run-2026-10-11/README.md` — rebaselined figures + the
  three-outcome framing; first-run's "17 answers" cause fix; the **1/21 hedge caveat** (don't overstate the
  rescue); do NOT alter the correct "8 of 34"/"24 of 33" contains counts.
- `codev/resources/lessons-learned.md` (`:28-41`), `lessons-critical.md`, `arch-critical.md` scoring lines —
  rewrite under the **decided** contract (containment headline, refused outcome, grader seam) + the
  sanctioned re-score-in-place exception; headline is decided (no PR-gate conditional).
- `pipelines/sacredbench/score.py` / `graders.py` module docstrings — final contract wording.

#### Deliverables

- [ ] "Add an evaluator" recipe present and name-selectability demonstrated; TUTORIAL grader sentence present.
- [ ] All run READMEs, lessons/arch docs, and docstrings consistent with the implemented contract; `score.py:N`
      pointers re-derived; `test_code_walkthrough.py` green.

#### Acceptance Criteria

- [ ] `.codev/checks/test.sh` green (notably `test_code_walkthrough.py`).
- [ ] A reader of any touched doc gets the current contract (containment headline, three outcomes, grader
      selection), not the old frozen one.

#### Test Plan

- **Regression**: `test_code_walkthrough.py`; **Manual**: read all docs for contradictions with the code + evidence.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Refusal matcher misclassifies | Medium | High | Conservative deterministic matcher; unit tests (real + synthetic, incl. wrapped/near-miss negatives); pin the exact refused set in the rebaseline witness. |
| Phase-2 refactor accidentally changes a metric | Medium | High | The run byte guards + oracle test must pass **unchanged** — a no-op proof; a `test_score.py` byte-identity case. |
| Second rebaseline corrupts committed evidence | Low | High | Re-score in place via the recorded script; preserve panel/usage; extend the durable oracle; pre-register the refused set + counts. |
| Containment has no anti-hedge rule (1/21 hedge) | Medium | Low–Med | Documented in Phase 5 README + review as PR-gate evidence; prose must not overstate the rescue. |
| Grader seam over-engineered | Medium | Medium | Minimal registry + flag; refusal kept OUT of the grader list; no plugin loader; paid grader unbuilt. |
| `--evaluator` default includes a paid grader | Low | High | Paid graders flagged non-default + non-inline; test asserts the default is deterministic-only. |
| Viewer contrast/refused overlaps aspir-11 standings | Medium | Medium | Coordinate directly; second merger rebases; escalate if expensive. |
| Co-Authored-By trailers reach main's history | Low | Medium | Strip from branch history in one non-interactive pass just before the PR; dropped going forward. |

## Documentation Updates

- `CODE_WALKTHROUGH.md` (add-an-evaluator recipe, §5, never-re-score bullets, all `score.py:N` pointers) — Phase 5.
- `TUTORIAL.md` (containment headline, three outcomes, grader sentence) — Phase 5.
- `runs/*/README.md` (rebaselined figures, three outcomes, 1/21 hedge caveat) — Phase 5.
- `codev/resources/lessons-learned.md` / `lessons-critical.md` / `arch-critical.md` scoring lines — Phase 5 (decided contract).
- Spec 15 review records: the two rebaselines' evidence, the refused-set, the 1/21 hedge, the grader seam, the deferred judge (#21).
