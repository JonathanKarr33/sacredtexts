# Specification: Scoring contract — containment headline, refused outcome, and a named-grader framework

<!--
SPEC vs PLAN BOUNDARY:
This spec defines WHAT and WHY. The plan defines HOW and WHEN.
Keep implementation phases, file paths, code, and "first we will… then we will…"
out of the spec — those belong in codev/plans/15-*.md.
-->

## Problem Statement

The `retrieve_quote` headline does not just under-report search gains — **it inverts their sign**, it
**miscounts refusals as wrong answers**, and the scoring tiers are **hardwired** with no way to choose a
grader or add one.

- **Sign inversion.** The headline is strict normalized equality, so a verbatim quote wrapped in ornate
  Qur'anic brackets `﴿…﴾` or followed by an English caveat scores **0** — identical to a hallucination.
  On the committed tutorial run this makes web search look like a 7-point *regression* (haiku-search 40 % vs
  haiku 47 %) when it is in fact a 5-point gain (52 % under containment).
- **Refusals miscounted.** A model that honestly declines ("I can't reliably reproduce the exact text…")
  is scored *incorrect*, conflating "won't answer" with "answered wrongly" — two very different behaviours
  for a scripture-fidelity benchmark.
- **No grader choice.** `score_answer` hardcodes the tiers; there is no way to select strict-vs-containment,
  and no seam for a future (paid) semantic judge.

This matters because the benchmark's Phase-1 question is *can models recognise and retrieve sacred text?*
and the working group needs the leaderboard to tell the truth about search, refusals, and grading method.

**Binding maintainer decisions (issue #15, 2026-10-12) — scope frozen, drive this spec:**
1. **Containment counts as correct** for text-retrieval; strict whole-answer equality is a secondary column.
2. **Refusals are their own outcome**, not errors: every cell is exactly one of **correct / incorrect /
   refused**; refusal detection is deterministic, runs in core outcome classification, and short-circuits
   grading; reported in `scores.jsonl`, summary, and viewer; accuracy excludes refusals.
3. **A named-grader framework**: multiple graders (strict, containment; a judge stays optional/deferred)
   with a clear seam for adding more, documented by an "add an evaluator" recipe in `CODE_WALKTHROUGH.md`.
4. **The viewer surfaces the search-on/off contrast** in the leaderboard/explorer without reading a README.
5. **Graders are a `score` CLI parameter** (comma-separated/repeatable; default = the deterministic grader
   set; unknown names fail fast; paid graders never default).
6. **TUTORIAL.md** gains one plain-language sentence about choosing graders, and the recipe shows how a new
   grader becomes selectable by name.

Plus a forward-compatibility constraint from issue #21 (filed, blocked on this work): a future **paid,
explicitly-invoked, resumable** Jev-based judge grader will run as a **separate pass** that merges
verdict+probability metrics into `scores.jsonl`. We do **not** build it, but the seam must not assume
graders are free/local/synchronous-in-score.

## Current State

Scoring (`pipelines/sacredbench/score.py`) emits per answer `exact`, `normalized`, `token_f1`, and a
per-task headline `correct`. **Phase 1 of this work is already merged on-branch**: for
`retrieve_quote`/`complete_unit`, `correct = normalized OR contains_reference` (a word-bounded normalized
containment submetric, reusing `_bounded_equal`), and both committed runs were rebaselined once
(tutorial +20, first-run +1) with a durable pinned-oracle witness. So **decision #1 is implemented.**

What remains hardwired / missing:

- **Refusals** are scored as incorrect — there is no `refused` outcome anywhere (scores/summary/viewer).
- **Graders are not selectable**: `score_answer` computes a fixed tier set; the `score` CLI has no grader
  flag; there is no registry or seam for a separate-pass/paid grader.
- **The viewer** renders accuracy but nothing that makes the search-on/off contrast or refusals legible:
  `QuestionList.tsx` hardcodes three metrics; the leaderboard/explorer have no refused status/filter and no
  on/off comparison affordance.
- Docs describe the old frozen contract (`CODE_WALKTHROUGH.md`, `TUTORIAL.md`, run READMEs,
  `lessons-learned.md:28-41` which literally says "don't reshape the headline contract").

## Desired State

- **Outcome classification is core and always-on.** Every answered cell is classified as exactly one of
  `correct` / `incorrect` / `refused`. Deterministic refusal detection runs first and short-circuits the
  graders; a refused cell is never graded. `scores.jsonl` carries an explicit `outcome`; the summary reports
  the three outcome counts per model; **accuracy = correct / (correct + incorrect)** (refusals excluded).
- **Graders are named and selectable.** The deterministic graders are `strict` (exact/normalized) and
  `containment` (contains_reference → the adopted headline). `score --evaluator a,b` selects them
  (comma-separated/repeatable); the default is the deterministic set; an unknown name fails fast; a paid
  grader is never in the default. The seam expresses a **separate-pass** grader (the future paid Jev judge)
  that merges its metrics into `scores.jsonl` without being computed inline — without building it.
- **The viewer tells the story.** The error explorer gains a `refused` status and filter; the leaderboard
  shows refused counts/rate; and the search-on vs search-off contrast is visible in the leaderboard/explorer
  without reading a README.
- **The docs match the implemented contract.** `CODE_WALKTHROUGH.md` has an "add an evaluator" recipe
  alongside recipes A and B; `TUTORIAL.md` has one plain sentence about choosing graders; the run READMEs,
  `lessons-learned.md`, and `arch-critical.md` reflect the decided containment headline, the refused outcome,
  and the grader seam.

## Success Criteria

- [ ] **(decision 1 — done)** `correct` for text-retrieval = containment; strict reported as a secondary
      submetric. (Already merged on-branch in phase 1.)
- [ ] **(decision 2)** Every answered cell has an `outcome ∈ {correct, incorrect, refused}` in `scores.jsonl`;
      refusal detection is deterministic and short-circuits grading; the summary reports per-model
      correct/incorrect/refused counts; **accuracy excludes refusals**; the viewer shows a `refused` status.
- [ ] **(decision 3/5)** A grader registry with `strict` and `containment`; `score --evaluator` selects
      graders (comma-sep/repeatable), defaults to the deterministic set, **fails fast on an unknown name**,
      and **never defaults a paid grader**; the metrics dict is an open map a **separate-pass** grader can
      merge into (the #21 Jev judge is *expressible*, not built).
- [ ] **(decision 4)** The search-on/off contrast is visible in the viewer leaderboard/explorer without a
      README; a viewer test asserts it.
- [ ] **(decision 6)** `CODE_WALKTHROUGH.md` has an "add an evaluator" recipe showing name-selectability;
      `TUTORIAL.md` score step has one grader sentence.
- [ ] Refusal detection is **conservative** (only clear declines) and unit-tested against real and
      synthetic refusal/non-refusal answers; a near-miss retrieval is NOT misread as a refusal.
- [ ] Two **deliberate** rebaselines total: the containment one (phase 1, done) and the refused-outcome one
      (this work), each with pre-registered evidence and all run/viewer guards updated; the durable-oracle
      witness is extended so the refused rebaseline's collateral is pinned.
- [ ] Provenance tasks (`verify_source`, `cite_passage`, `identify_source`, `identify_version`) keep their
      correct/incorrect scoring; they gain only the universal `refused` outcome, nothing grader-specific.
- [ ] The copyright audit gate still passes; no paid grader egresses `restricted`-source text (future-guarded).

## Constraints

- **Scope is frozen** (human-confirmed): exactly the six decisions + the #21 seam constraint. Anything new is
  a follow-up issue, not mid-flight scope.
- **Keep it simple throughout** — no machinery beyond what the six decisions require. The grader seam is a
  small named registry + a CLI flag, not a plugin system; refusal detection is a conservative deterministic
  matcher, not an ML classifier.
- **Refusal is an OUTCOME, not a grader.** It is universal (any task), runs in core classification, and
  short-circuits grading. The `--evaluator` list holds graders only.
- **Two deliberate rebaselines**, each well-evidenced; never hand-edit `scores.jsonl`, never bypass a guard,
  never re-run `collect`/`generate` (re-score committed answers in place only).
- **The #21 seam**: a grader may be inline-deterministic or a separate resumable pass that merges metrics;
  paid graders are never default and are future work — expressible, not implemented here.
- **Provenance anti-evasion** (Spec 1/8) stays: containment is confined to the text-retrieval graders.
- **Parallel work**: `aspir-11` changes `score.py`/`cli.py` and the viewer standings; the viewer contrast +
  refused filter overlap it. Second merger rebases; escalate to the architect if the collision gets expensive.
- **`normalize()` pass order is fixed** (script-aware marks before punctuation; Latin byte-for-byte).
- **Attribution**: commit messages carry no `Co-Authored-By` trailer (project owner's global rule).

## Assumptions

- Refusals are detectable deterministically with a conservative phrase/shape matcher on the answer text; the
  committed runs contain enough real declines to validate it (to be confirmed against the evidence).
- The committed `answers.jsonl` for both runs is authoritative and re-scorable; the refused rebaseline
  re-scores in place (the sanctioned exception), preserving panel/usage.
- Adding an `outcome` key and a grader registry does not require a viewer-source rewrite beyond the new
  refused status/filter and the contrast affordance; `ScoreMetrics` keys are optional (verified in phase 1).
- The future paid Jev judge (issue #21) will supply its own validation sample and copyright-egress guard; the
  seam only needs to let it merge metrics.

## Solution Approaches

### Approach 1: outcome classifier wrapping a named-grader registry — RECOMMENDED

A thin, deterministic **outcome classifier** runs on every answered cell: detect refusal first (conservative
matcher) → if refused, `outcome = refused`, skip grading; else run the selected grader(s) → `outcome` is
`correct`/`incorrect` from the grader. A small **grader registry** maps names (`strict`, `containment`,
future `jev`) to graders; the `score` CLI's `--evaluator` selects them (default = deterministic set,
unknown fails fast, paid never default). The per-cell metrics dict stays an open map so a separate-pass
grader can merge keys later. Summary/viewer report the three outcomes; accuracy excludes refusals.

- **Pros:** Matches the frozen decisions exactly; minimal new machinery (a registry + a flag + a matcher);
  refusal-as-outcome keeps grading orthogonal; the open metrics map makes #21 expressible with zero new code
  now; phase 1's containment headline slots in as the `containment` grader.
- **Cons:** A second rebaseline (refused reshapes `scores.jsonl` and the accuracy denominator); refusal
  detection is a heuristic with false-negative/positive risk (mitigated by being conservative + unit-tested).
- **Risk/complexity:** Low–moderate, concentrated in the refusal matcher's calibration and the 2nd rebaseline.

### Approach 2: refusal as just another grader/metric — REJECTED

Treat refusal as a grader in the `--evaluator` list (the original pre-correction shape).

- **Cons:** The human explicitly corrected this: refusal is an outcome, not a grader — it must short-circuit
  grading and be universal, which a grader in a selectable list cannot guarantee (you could deselect it, or
  run it alongside a grader that also fires). Violates decision #2. **Not pursued.**

### Approach 3: LLM judge grader now — DEFERRED (issue #21)

Build the paid Jev judge grader in this PR.

- **Cons:** Explicitly out of scope / a separate blocked issue; paid, async, needs a validation sample and a
  copyright-egress guard. **Deferred**; this spec only keeps the seam able to express it.

**Recommendation:** Approach 1. The seam stays minimal; refusal is an outcome; the judge is expressible but
unbuilt.

## Open Questions

**Important (shapes design):**

- The exact refusal matcher (phrase set / shape). Must be conservative — a near-miss *retrieval* (wrong
  orthography, or a wrapped quote) is an answer, not a refusal. Calibrate against the committed answers.
- Representation of `outcome` vs the legacy `correct` field: keep `correct` (0/1, = `outcome=="correct"`) for
  continuity and add `outcome`, vs. replace `correct`. (Leaning: keep both; viewer/tests read `outcome`.)

**Nice-to-know:**

- How prominently the viewer shows the on/off contrast (a delta column, paired rows, or a toggle) — any form
  that satisfies "visible without a README".

## Test Scenarios

- **Outcome exclusivity:** every answered cell gets exactly one of correct/incorrect/refused.
- **Refusal short-circuits:** a clear decline ("I can't reliably reproduce…") → `refused`, no grader metrics
  decide it; it is excluded from the accuracy denominator.
- **Conservative refusal:** a wrapped-exact retrieval and a wrong-orthography near-miss are NOT refusals.
- **Grader selection:** `--evaluator strict` vs `--evaluator containment` vs both; default = deterministic
  set; `--evaluator bogus` fails fast; a paid grader is never selected by default.
- **Separate-pass expressibility:** a registered non-inline grader is representable (metrics-merge path
  exists) without being run in the inline score.
- **Containment headline (regression):** phase-1 behaviour preserved for non-refused text-retrieval cells.
- **Provenance untouched:** the four provenance tasks keep correct/incorrect; they gain only `refused`.
- **Rebaseline witness:** the durable oracle + exact flip/outcome-change set pins the refused rebaseline's
  collateral; both run guards + viewer guards green.
- **Viewer:** refused status + filter in the explorer; refused count in the leaderboard; the search-on/off
  contrast is asserted visible.
- **Docs:** CODE_WALKTHROUGH recipe makes a new grader selectable by name; TUTORIAL grader sentence present.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Refusal matcher misclassifies (a real retrieval read as refused, or vice-versa) | Medium | High | Conservative matcher (only clear declines); unit tests over real + synthetic answers; pin the exact refused-cell set in the rebaseline witness so any drift is caught. |
| Containment has no anti-hedge rule (unlike cite/identify) | Medium | Low–Med | Known and documented: 1 of phase-1's 21 rescued cells (opus-search Ketubot 8a:8) is a 2-candidate hedge whose expected text is the *secondary* guess — ~1pt on opus-search. Record as PR-gate evidence; run-README prose must not overstate the rescue's cleanliness. |
| Second rebaseline corrupts committed evidence | Low | High | Re-score in place from committed answers; preserve panel/usage; extend the durable-oracle witness; pre-register the outcome-change set. |
| Grader seam over-engineered | Medium | Medium | Minimal registry + flag; refusal kept OUT of the grader list; no plugin loader. |
| Viewer contrast/refused overlaps aspir-11 standings | Medium | Medium | Coordinate directly; second merger rebases; escalate if expensive. |
| `--evaluator` default accidentally includes a paid grader | Low | High | Paid graders flagged non-default + non-inline; a test asserts the default set is deterministic-only. |

## References

- Issue #15 — binding maintainer decisions (2026-10-12): the six decisions above.
- Issue #21 — future paid Jev judge grader (separate-pass, resumable); the seam-expressibility constraint.
- `codev/plans/15-scoring-contract-contains-exac.md` — the p1–p5 execution plan.
- `codev/specs/8-…`, `codev/specs/1-…` — the frozen `_SUBMETRICS`, script-aware `normalize()`, regression
  guards, and the provenance anti-evasion contract.
- `pipelines/sacredbench/score.py`, `cli.py`; the run guards and `test_contains_reference_rebaseline.py`
  (phase-1 durable oracle); `apps/viewer/*` (QuestionList, Leaderboard/Explorer/Standings).
- `runs/first-run-2026-10-11/`, `runs/tutorial-2026-10-11/` — committed evidence (both `retrieve_quote`-only).
