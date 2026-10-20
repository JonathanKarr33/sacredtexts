# Plan: Scoring contract — containment headline, refused outcome, named-grader framework

**Specification**: [codev/specs/15-scoring-contract-contains-exac.md](../specs/15-scoring-contract-contains-exac.md)

## Executive Summary

Implements the spec's **Approach 1**: a deterministic **outcome classifier** (correct / incorrect /
refused) wrapping a small **named-grader registry** (`strict`, `containment`; future paid `jev` expressible
but unbuilt), selectable via `score --evaluator`. Refusal is an **outcome**, not a grader — detected
deterministically, run first, short-circuiting the *headline verdict* (not the diagnostic submetrics),
universal across tasks, excluded from the accuracy numerator/denominator. Judge pilot deferred (#21).

**Five phases, two deliberate rebaselines, one PR.** p1 (containment headline + rebaseline) is **merged
on-branch**. p2 refactors the tiers into the grader seam + CLI as a **provable no-op** (byte-identical
`scores.jsonl`). p3 adds the refused outcome end-to-end — the **second** rebaseline. p4 makes the viewer
tell the story. p5 syncs docs. `Co-Authored-By` trailers are stripped from history in one pass just before
the PR.

**Two findings from the fresh re-scope consult that reshape this plan (verified against the evidence):**

1. **Refusals are ~100–180 cells, not ~21.** Excluding them (decision #2) moves accuracy massively (opus
   66 %→100 %, haiku 47 %→71 %, claude-haiku 25 %→56 %) and **re-inverts the search sign** (opus 100 % >
   opus-search 99 %) — "100 %" is a false headline for a model that declined a third of the run. The honest
   implementation of #2 therefore reports an **answer-rate / coverage = (correct+incorrect)/n** beside every
   accuracy (summary.json, summary.md, viewer), and documents ranking. *(Surfaced to the architect as
   honest-#2 vs. new scope; design present here, trim to a plain count only if ruled out-of-scope.)*
2. **Refused cells KEEP their submetrics; `outcome` decides only the headline.** This preserves the phase-1
   durable oracle (the `(exact,normalized,token_f1)` SHA over all cells is unchanged) rather than discarding
   it. A refusal has `normalized == contains_reference == 0`, so `correct == normalized` still holds and the
   phase-1 invariants survive. The refusal matcher is **"decline phrase AND reference-not-contained"** — two
   `opus-search` cells open with a decline then deliver the verse; a phrase-only matcher would wrongly refuse
   them.

## Phases (Machine Readable)

<!-- REQUIRED: porch parses this JSON to track phase progress. Keep it in sync when you add or remove phases; at least two phases. -->

```json
{
  "phases": [
    {"id": "phase_1", "title": "Containment headline + one-shot rebaseline (DONE)"},
    {"id": "phase_2", "title": "Named-grader registry + score --evaluator CLI (provable no-op)"},
    {"id": "phase_3", "title": "Refused outcome + coverage + second rebaseline"},
    {"id": "phase_4", "title": "Viewer: four outcome categories + coverage + search-on/off contrast"},
    {"id": "phase_5", "title": "Documentation sync for the evaluator/outcome contract"}
  ]
}
```

## Phase Breakdown

### Phase 1: Containment headline + one-shot rebaseline — DONE

**Dependencies**: None — merged on-branch (`2e17d84`, `142fc5c`).

#### Status

`correct = normalized OR contains_reference` for text-retrieval; both runs rebaselined once (+20/+1);
`test_contains_reference_rebaseline.py` pins a pre-change `(exact,normalized,token_f1)` SHA oracle + the exact
21-cell flip set; 9 guards green. **Known issue** (phase-1 claude consult): 1/21 rescued cells
(`opus-search / retrieve_quote-4ad4392645da`, Ketubot 8a:8) is a two-candidate hedge whose expected text is
the model's secondary guess — documented as PR-gate evidence (Phase 5 README prose must not overstate).

### Phase 2: Named-grader registry + `score --evaluator` CLI (provable no-op)

**Dependencies**: Phase 1

#### Objective

A minimal named-grader seam, selectable on the `score` CLI, emitting **byte-identical** `scores.jsonl` for
the default set (⇒ no rebaseline; the phase-1 run guards + oracle must pass **unchanged**).

#### Design (precise — resolves the consult's grader-semantics gaps)

- **`token_f1` is an always-on diagnostic** for text-retrieval, owned by no grader (always emitted).
- **Graders own metric fields + a verdict:** `strict` → emits `exact`,`normalized`; verdict = `normalized==1`.
  `containment` → emits `contains_reference`; verdict = `contains_reference==1`.
- **Headline under any selection:** `correct = int(any(selected grader verdict))` — OR over the *selected*
  graders. Default `{strict,containment}` ⇒ `normalized OR contains_reference` (== phase 1). `--evaluator
  strict` ⇒ `correct = normalized`; `--evaluator containment` ⇒ `correct = contains_reference`.
- **Selection:** comma-separated/repeatable; **default = the inline deterministic set** `{strict,containment}`;
  unknown name ⇒ fail fast; empty selection ⇒ error; duplicates ⇒ deduped; a paid/non-inline grader is never
  in the default and cannot be run by the inline `score`.
- **`_SUBMETRICS` is DERIVED from the selected graders, not a module constant**, and the accumulator is
  seeded from the selection — so `--evaluator strict` does NOT emit a bogus `contains_reference: 0.0` into
  `summary.json` (the latent bug at `score.py:334`/`:372`). `token_f1` is always in the submetric set.
- **Non-inline descriptor:** a `Grader` for a separate-pass/paid grader carries `inline=False` and **no inline
  callable** (name + `default=False` + a declared metric-key set only); a future pass merges its metrics into
  each row's open metrics map. A test registers such a fixture and exercises the merge path without running it inline.

#### Files to Create / Modify

- `pipelines/sacredbench/graders.py` (new) — the registry + `Grader` descriptor (inline and non-inline forms),
  `GRADERS = {"strict":…, "containment":…}` (default, inline), unknown-name fail-fast, selection→submetric-set
  derivation helper.
- `pipelines/sacredbench/score.py` — `score_answer`/`score_file` take the selected grader set; text-retrieval
  delegates to graders; `_SUBMETRICS`/accumulator derived from the selection; default-set output byte-identical.
- `pipelines/sacredbench/cli.py` — `score --evaluator` (comma-sep/repeatable; default; unknown fail-fast; paid never default).
- `pipelines/tests/test_graders.py` (new) — resolution, fail-fast, default set, OR-verdict under subsets,
  empty/duplicate handling, derived `_SUBMETRICS` (no bogus `contains_reference` under `strict`-only),
  non-inline fixture + merge-path.
- `pipelines/tests/test_score.py` — default-set byte-identity (the no-op) for a sample cell.

#### Deliverables / Acceptance

- [ ] Registry + CLI per the design; unknown fails fast; paid never default.
- [ ] **Default-set re-score reproduces both committed `scores.jsonl` byte-for-byte** — phase-1 run guards +
      `test_contains_reference_rebaseline.py` pass **unchanged** (NO rebaseline this phase).
- [ ] `--evaluator strict` emits `{exact,normalized,token_f1}` (no `contains_reference` key) and `correct==normalized`.
- [ ] Separate-pass grader is expressible (fixture test) without inline execution.
- [ ] `.codev/checks/test.sh` green (both lanes).

### Phase 3: Refused outcome + coverage + second rebaseline

**Dependencies**: Phase 2

#### Objective

Add core, always-on outcome classification (correct / incorrect / refused), deterministic refusal detection
that short-circuits the headline verdict, three-outcome reporting **with coverage**, and the second
deliberate rebaseline. ~100–180 cells become `refused`.

#### Tasks (ordered — calibration FIRST, per the consult)

1. **Refusal calibration (pre-registration).** Survey **both** `answers.jsonl`, hand-classify declines,
   **freeze the expected refused `(model_id, question_id)` set and per-model counts** in the test, BEFORE
   writing the matcher. (The set is ~100–180 cells; capturing it after the matcher is not pre-registration.)
2. **Matcher.** `classify_refusal(answer, task, expected) -> bool` = a conservative **decline-phrase AND
   reference-not-contained** rule (reuse `_bounded_equal` for the containment half), so a decline-prefixed
   answer that still delivers the verse is an ANSWER, not a refusal. `verify_source` declines (currently
   parse to `None` → incorrect) become `refused` too.
3. **Outcome + reporting.** `score_answer` (all tasks): refusal → `outcome="refused"`, headline verdict
   skipped (`correct=0`); else graders decide `outcome∈{correct,incorrect}`. **Refused cells KEEP
   `exact/normalized/token_f1/contains_reference`** (preserves the phase-1 oracle). `score_file`: per-cell
   `correct/incorrect/refused` counts; **accuracy = correct/(correct+incorrect)** (`null` if all refused);
   **coverage = (correct+incorrect)/n**; **refused_rate = refused/n**; submetric averages over **graded**
   cells (correct+incorrect), not `n` (ruling: refusals never graded, so they don't dilute diagnostics).
   `_overall`, `by_tradition` carry the same. `missing` roster cells stay distinct from `refused`.
4. **Second rebaseline** of both runs via the recorded script (now emitting `outcome`+counts+coverage),
   panel/usage preserved.

#### Files to Create / Modify

- `pipelines/sacredbench/graders.py` or `outcomes.py` — `classify_refusal` (decline-phrase set + not-contained guard).
- `pipelines/sacredbench/score.py` — outcome classification; keep submetrics on refused; counts/coverage/refused_rate;
  accuracy & submetric denominators per the ruling.
- `runs/*/scores.jsonl`, `runs/*/summary.{json,md}` — second rebaseline.
- `pipelines/tests/test_contains_reference_rebaseline.py` — **the phase-1 `(exact,normalized,token_f1)` SHA
  oracle stays and must still pass** (submetrics preserved); ADD: the frozen refused-set + per-model
  refused/coverage counts; update the moved `EXPECTED_ACCURACY` pins (0.52/0.47/0.74/0.66 → refusal-excluded
  values) and `test_first_run_overall_and_lds_tradition_pinned` (0.25/0.76 → moved) — flag these as changed.
- `pipelines/tests/test_score.py` — outcome exclusivity; refusal short-circuits headline but keeps submetrics;
  accuracy excludes refused; **named negative test: decline-prefixed-but-delivers → NOT refused** (the two
  real opus-search cells); provenance `verify_source` decline → refused; all-refused → accuracy `null`.
- `pipelines/tests/test_first_run_regression.py`, `test_tutorial_run.py` — re-score byte guards pass against the 2nd rebaseline.

#### Deliverables / Acceptance

- [ ] `outcome∈{correct,incorrect,refused}` on every answered cell; refusal deterministic, matcher =
      decline-AND-not-contained; universal; `verify_source` declines refused.
- [ ] Summary emits per-model/tradition correct/incorrect/refused **+ coverage + refused_rate**; accuracy
      excludes refusals (`null` if all refused); submetric averages over graded cells.
- [ ] Refused cells keep submetrics ⇒ **phase-1 SHA oracle passes unchanged**; frozen refused-set + counts pinned.
- [ ] Decline-prefixed-but-delivers cells are NOT refused (pinned test); wrapped/near-miss NOT refused.
- [ ] Second rebaseline committed; run byte guards green; copyright audit passes; moved accuracy pins updated.

#### Test Plan

- Calibration survey artifact (frozen set) + matcher units (declines, decline-but-delivers negatives,
  wrapped/near-miss negatives, verify_source decline); outcome exclusivity; coverage/accuracy denominators;
  all-refused `null`; rebaseline byte guards + unchanged phase-1 oracle + new refused witness.

### Phase 4: Viewer — four outcome categories + coverage + search-on/off contrast

**Dependencies**: Phase 3

#### Objective

Make the viewer tell the story without a README: the error explorer distinguishes
correct/incorrect/refused/**missing**; the leaderboard shows refused + **coverage** beside accuracy; the
search-on/off contrast is visible.

#### Files to Create / Modify (the real taxonomy sites)

- `apps/viewer/src/lib/explorer.ts` — `FailureMode`, `ExplorerFilters.correct` (today binary
  `"correct"|"incorrect"`), `filterQuestions`, `questionStats`: add `refused` as a status distinct from
  `incorrect` and from the existing `missing` mode (four categories).
- `apps/viewer/src/components/ExplorerFilters.tsx`, `routes/ExplorerPage.tsx`, `router.tsx` — extend the URL
  contract `?task=&tradition=&correct=&mode=` to carry `refused` (filter).
- `apps/viewer/src/components/LeaderboardTable.tsx`, `lib/leaderboard.ts` — **sort by accuracy**, but
  **coverage is an adjacent column of equal visual weight** (same styling as the accuracy column, not a
  footnote) plus the refused count (architect-specified presentation).
- `apps/viewer/src/routes/StandingsPage.tsx`, `lib/aggregate.ts` — standings rank on `overall.accuracy`
  which now excludes refusals: **values move** (not just keys); show coverage so the ranking isn't misread.
- **Search-on/off contrast:** pairing key = strip the `[web_search]`/`[no-tools]` marker from
  `summary.panel[id].model` to the base model (the only on/off signal; `PanelEntry` has no `api_model`).
  Present the contrast (paired on/off rows or a delta) in the leaderboard. **No-pair fallback:** `panel` is
  only emitted with a run config and **first-run has no on/off pair** — the affordance degrades gracefully
  and the "contrast visible" test asserts only on a run that HAS a pair (tutorial), never fires on first-run.
- `apps/viewer/src/**/*.test.ts(x)` — refused status+filter, four-category coexistence, leaderboard
  refused+coverage, the contrast affordance (tutorial), and updated committed-run fixtures for the moved
  accuracy/coverage values.

#### Deliverables / Acceptance

- [ ] Explorer: correct/incorrect/refused/missing all distinguishable + a `refused` filter (URL contract updated).
- [ ] Leaderboard: refused count + coverage beside accuracy; standings values updated.
- [ ] Search-on/off contrast visible on a paired run; no-pair fallback for first-run; test asserts it (tutorial only).
- [ ] `pnpm -C apps/viewer test` green against the 2nd-rebaselined evidence.

### Phase 5: Documentation sync for the evaluator/outcome contract

**Dependencies**: Phase 4

#### Files to Create / Modify

- `CODE_WALKTHROUGH.md` — **"add an evaluator" recipe** (register a grader → selectable by name via
  `--evaluator`; note the separate-pass/paid variant for #21); `_SUBMETRICS`/accumulator notes now
  selection-derived; §5; the `:300-308` never-re-score / "add evidence not perturb" bullets (sanctioned
  exceptions); **re-derive all `score.py:N` pointers**.
- `TUTORIAL.md` — adopt the decided containment headline + three outcomes + coverage; **one plain sentence**
  in the score step about choosing graders (`--evaluator`); and **one plain sentence explaining the
  accuracy/coverage pair** — "accuracy = how often it's right *when it answers*; coverage = how often it
  answers" (architect-specified; same sentence in the run READMEs).
- `runs/*/README.md` — rebaselined figures, three outcomes + coverage, the **narrative direction change**
  (surface the moved numbers to the architect first); first-run "17 answers" cause fix; the **1/21 hedge
  caveat**; do NOT alter the correct "8 of 34"/"24 of 33" **contains** counts.
- `codev/resources/lessons-learned.md` (`:28-41`), `lessons-critical.md`, `arch-critical.md` — decided
  contract (containment headline, refused outcome + coverage, grader seam) + the re-score-in-place sanctioned
  exception + **the porch rollback-replay quirk** (architect-requested lessons entry).
- docstrings (`score.py`, `graders.py`).

#### Deliverables / Acceptance

- [ ] Recipe present + name-selectability shown; TUTORIAL grader sentence; docs match the implemented contract;
      `test_code_walkthrough.py` green; `score.py:N` pointers re-derived.

## History cleanup (just before the PR)

After **all** phases are committed: `git branch backup/pre-trailer-strip` (safety ref), then strip
`Co-Authored-By` from the 9/28 affected commits in one non-interactive pass (`git filter-branch --msg-filter`
or `git rebase --exec` with a `sed` that drops the trailer line), verify porch still resolves state, then
open the PR. Trailers already dropped going forward.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Excluding refusals re-inverts the search sign / "100%" is a false headline | **High if coverage omitted** | High | Report coverage = (correct+incorrect)/n beside every accuracy (summary + viewer); document ranking; surface moved numbers to the architect before Phase-5 prose. |
| Phase 3 under-sized (~130 cells, not 21) | — | High | Calibration-first: survey + hand-classify + freeze the refused set before the matcher; size the rebaseline accordingly. |
| Refusal matcher misclassifies a decline-prefixed answer that delivers the verse | Medium | High | Matcher = decline-phrase AND reference-not-contained; the two real opus-search cells are a pinned negative test. |
| Refused cells dropping submetrics breaks the phase-1 oracle | Medium | High | Keep submetrics on refused cells; `outcome` decides only the headline; phase-1 SHA oracle passes unchanged. |
| `--evaluator strict` emits a bogus `contains_reference: 0.0` | Medium | Medium | `_SUBMETRICS`/accumulator derived from the selected graders, not a static constant. |
| Phase-2 refactor changes a metric | Medium | High | Default-set byte-identity vs committed `scores.jsonl`; phase-1 guards + oracle pass unchanged. |
| Second rebaseline corrupts evidence | Low | High | Re-score in place via the recorded script; preserve panel/usage; keep the phase-1 oracle; pin the refused set + counts. |
| Standings values move silently (denominator change) | Medium | Medium | Phase 4 updates `aggregate.ts`/`StandingsPage` fixtures; show coverage; it's a value move, not just keys. |
| first-run has no on/off pair → contrast test misfires | Medium | Low | No-pair fallback; the contrast test asserts only on the tutorial (paired) run. |
| Viewer overlaps aspir-11 standings | Medium | Medium | Coordinate directly; second merger rebases; escalate if expensive. |
| Co-Authored-By trailers reach main | Low | Medium | Backup ref + one-pass strip just before the PR; dropped going forward. |

## Documentation Updates

- `CODE_WALKTHROUGH.md` (recipe, selection-derived submetrics, never-re-score bullets, `score.py:N` pointers) — Phase 5.
- `TUTORIAL.md` (containment headline, three outcomes, coverage, grader sentence) — Phase 5.
- `runs/*/README.md` (rebaselined figures + coverage + narrative shift + 1/21 hedge) — Phase 5.
- `lessons-learned.md`/`lessons-critical.md`/`arch-critical.md` (decided contract + re-score exception + porch rollback-replay quirk) — Phase 5.
- Spec 15 review: two rebaselines' evidence, the refused set + coverage numbers, the 1/21 hedge, the grader seam, deferred #21, the porch quirk.
