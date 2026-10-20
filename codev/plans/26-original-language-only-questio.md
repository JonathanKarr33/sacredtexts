# Plan: Original-language-only question set — four templates, per-text quota, ask_as/citation_hint metadata

**Specification**: [codev/specs/26-original-language-only-questio.md](../specs/26-original-language-only-questio.md)

## Executive Summary

The spec's shape is fixed by Waleed's baked decisions; the plan sequences them along the pipeline's
data flow so each phase is a complete, independently testable unit and each later stage builds on a
green earlier one. The order follows the JSONL seams (catalogue → generate → score) plus the viewer
and docs that trail the code, ending with the committed live run that is the real proof the whole
path works (lessons-critical: "tests pass" ≠ "it works").

1. **Catalogue metadata** is first because generation and selection both read the three new fields;
   nothing downstream can be built or tested until `original_language`/`ask_as`/`citation_hint` load,
   validate, and recover from the standardized path the way `license` does.
2. **Generation** reshapes selection + quota + the four templates on top of that contract.
3. **Scoring** hardens `parse_yes_no` (closes #23) and adds the per-text summary; this is where the
   Spec 15 / PR #24 dependency lands (see Risks).
4. **Viewer** drops the two retired tasks (a separate app with its own vitest suite).
5. **Docs** are updated once the behavior they describe is settled.
6. **Live run + evidence** generates the default original-language set, runs the tutorial panel, and
   commits a fresh `runs/original-<date>/` whose scores re-derive bit-for-bit.

Each phase is a single atomic commit. Approaches recommended in the spec are adopted: per-text even
split with deterministic remainder (spec Approach 1), `display_citation` prefix-strip (spec Approach
A), leading-stance window before `normalize()`.

## Phases (Machine Readable)

<!-- REQUIRED: porch parses this JSON to track phase progress. Keep it in sync when you add or remove phases; at least two phases. -->

```json
{
  "phases": [
    {"id": "phase_1", "title": "Catalogue metadata: original_language / ask_as / citation_hint"},
    {"id": "phase_2", "title": "Original-language selection, per-text quota, four-template generation"},
    {"id": "phase_3", "title": "Scoring: leading-stance yes/no (#23), retire tasks, per-text summary"},
    {"id": "phase_4", "title": "Viewer: retire identify_version / identify_source"},
    {"id": "phase_5", "title": "Docs: tutorial, walkthrough, README, arch-critical"},
    {"id": "phase_6", "title": "Live run and committed original-language evidence"}
  ]
}
```

## Phase Breakdown

### Phase 1: Catalogue metadata — original_language / ask_as / citation_hint

**Dependencies**: None

#### Objective

Make the three new per-target fields a validated, fail-fast part of the catalogue contract and
available to generation through the same recovery channel as `license`, so every later phase can rely
on them. Delivers: every committed `source.yaml` carries the fields; a missing or ill-typed field
fails loading with the file and target named.

#### Files to Create / Modify

- `pipelines/sacredbench/catalogue.py` — add the three fields to `_TARGET_REQUIRED`; add a bool
  validator for `original_language` (the existing `_TARGET_STR_FIELDS` loop covers `ask_as` /
  `citation_hint` as non-empty strings); add them to the `Target` dataclass and the `Target(...)`
  constructor; extend the standardized-path recovery (the `license_for_standardized_path` analog) so
  the three fields reach `generate` fail-closed, with the slug-agreement check extended to them;
  update the module docstring + annotated example YAML.
- `texts/raw/*/source.yaml` (6 files, 23 targets) — add `original_language`, `ask_as`,
  `citation_hint` to every target per the spec's census (OL column) and the baked mapping.
- `pipelines/tests/test_catalogue.py` — new/extended tests.

#### Deliverables

- [ ] Three fields required + validated (bool for `original_language`); `Target` exposes them.
- [ ] Recovery channel delivers the fields to standardized docs fail-closed; slug-agreement covers them.
- [ ] All 23 targets in the 6 `source.yaml` files carry natural `ask_as` / `citation_hint` wording and
      the correct `original_language` flag (per the spec census).
- [ ] Docstring + example YAML document the three fields.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Loading a target missing any of the three fails, naming file + `targets[i]`; a non-bool
      `original_language` is rejected.
- [ ] A slug shared by two targets that disagree on a new field fails (slug-agreement).
- [ ] Pipeline suite green; the real `source.yaml` trackable/payload-ignored test still passes.

#### Test Plan

Unit: field-presence fail-fast (parametrized over the three), non-bool rejection, slug-agreement on a
disagreeing-fixture, fail-closed recovery when the path can't resolve. Regression: existing catalogue
tests stay green. Manual: `uv --project pipelines run python -m sacredbench catalogue` (or the gate)
loads all real sources.

### Phase 2: Original-language selection, per-text quota, four-template generation

**Dependencies**: Phase 1

#### Objective

Replace the per-task/tradition-balanced generator with original-language-only selection, a per-text
quota over exactly four templates, and natural-language prompts using `ask_as` / `display_citation` /
`citation_hint`. Delivers the new question set.

#### Files to Create / Modify

- `pipelines/sacredbench/generate.py` — `TASKS` → the four kept names (retire `identify_version`,
  `identify_source`); delete `_balanced_sample` and the per-task `quotas`/`per_task` machinery; add
  `(work, version, language)` grouping into "texts"; add original-language default selection +
  `--include-translations` (keep `--include-restricted`); add `--per-text` (default 20) with the
  deterministic `N//4`+remainder split over the canonical template order; render the four templates
  (with `display_citation` prefix-strip for `retrieve_quote`; `citation_hint` appended to
  `cite_passage`); keep `verify_source` negative sampling + the existing deterministic negative share;
  fail fast (naming text+template) when a template's share can't be filled; manifest records
  `per_text`, `include_translations`, and the selected-texts list.
- `pipelines/sacredbench/cli.py` — `generate` command: drop `--per-task` / `--quota`; add
  `--per-text` / `--include-translations`; keep `--tasks` / `--negatives-share`.
- `pipelines/tests/test_generate.py` — rewrite the retired-task and quota/balancing tests; add the new ones.

#### Deliverables

- [ ] Default selection = the 14 original-language non-restricted texts (grouped by tuple); 5/template
      at `--per-text 20`.
- [ ] `--include-translations` adds the `original_language:false` non-restricted texts;
      `--include-restricted` unchanged (TLG local-only).
- [ ] Deterministic non-multiple-of-4 split; fail-fast on an unfillable template share.
- [ ] Prompts use `ask_as` (never `version`); no duplicated edition name (`display_citation`);
      `cite_passage` appends `citation_hint`.
- [ ] `identify_version` / `identify_source` gone from `TASKS` and `_build`; manifest fields added.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Rendered `retrieve_quote` over a hadith text shows the edition once; over Qur'an/Talmud/BoM
      unchanged.
- [ ] Generate with defaults over a fixture catalogue emits N/text, N/4 per template; `--per-text 18`
      → deterministic remainder.
- [ ] Question-set digest machinery unchanged; manifest records the new fields.
- [ ] Pipeline suite green.

#### Test Plan

Unit: selection by `original_language`/restricted; `--include-translations`; per-text split incl.
non-multiple-of-4; display_citation no-duplication for a work-prefixed vs bare-citation fixture;
`citation_hint` appended; fail-fast naming text+template; `verify_source` negatives (cross-text,
excluded-when-contained); manifest fields; retired tasks rejected/absent. Determinism: same seed →
identical output.

### Phase 3: Scoring — leading-stance yes/no (#23), retire tasks, per-text summary

**Dependencies**: Phase 2 (tasks and prompts exist); integrates Spec 15 / PR #24 when merged (Risks)

#### Objective

Harden `verify_source` scoring with leading-stance parsing (closes #23), remove scoring for the two
retired tasks, and add the model-keyed per-text summary table.

#### Files to Create / Modify

- `pipelines/sacredbench/score.py` — **built on the Spec 15 / PR #24 contract as the base**
  (correct/incorrect/refused outcomes, accuracy + coverage, named graders). Rewrite `parse_yes_no` to
  take the leading window (first sentence / first 60 chars) from the **raw answer before
  `normalize()`**, returning yes / no / `None`; a leading decline cue → `None`, classified `refused`
  by the Spec 15 outcome layer. Remove `identify_version` / `identify_source` branches and their
  submetrics. Add `by_text[model_id][text]` to the summary dict and a per-text table (text, n,
  accuracy, coverage, refused) to `summary_markdown`. Update the module docstring / SCOPE block (remove
  the #23 gap note it now closes).
- **Hard dependency (architect-confirmed 2026-10-20):** Phase 3 plans on the Spec 15 contract. If
  PR #24 has **not** merged into `origin/main` when this phase begins, **STOP at the phase boundary and
  ping the architect** — do not build a `parsed: null` / no-outcome fallback (project rule: fail fast,
  never implement fallbacks). The architect confirmed #24 is fully reviewed at the human pr gate and
  merges before scoring.
- `pipelines/tests/test_score.py` — adversarial `parse_yes_no` cases; per-text summary; remove retired-task tests.

#### Deliverables

- [ ] Leading-stance `parse_yes_no`; the four adversarial cases classify correctly (incl. decline →
      `None`, window taken pre-normalize).
- [ ] `identify_version` / `identify_source` scoring removed.
- [ ] Per-text summary keyed by model then text (text, n, accuracy, coverage, refused) in
      `summary.json` and `summary.md`, on the Spec 15 outcome contract.
- [ ] Module docstring updated; #23 closed.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] `"There is no way to verify this... Yes"` → `None`; `"No, that is from Sahih Muslim"` → no;
      `"Yes."` → yes; bare decline → `None`.
- [ ] Committed `runs/first-run-2026-10-11` re-scores bit-for-bit (retrieve_quote-only, unaffected).
- [ ] Pipeline suite green.

#### Test Plan

Unit: parametrized adversarial yes/no incl. pre-normalize window and incidental-"no" cases; per-text
summary structure (multi-model fixture); retired-task scoring absent. Regression:
`test_first_run_regression.py` byte-for-byte. Integration: score a Phase-2 fixture question set end to
end. Coordinate the `origin/main` merge here if #24 has landed; reconcile `parse_yes_no` onto its
version.

### Phase 4: Viewer — retire identify_version / identify_source

**Dependencies**: Phase 2 (tasks retired in generation)

#### Objective

Remove the two retired tasks from the benchmark viewer so the viewer suite stays green and the UI has
no dead task handling.

#### Files to Create / Modify

- `apps/viewer/` — task-specific handling at `localResults.ts`, `explorer.test.ts`,
  `QuestionList.test.tsx` (and any sibling references the grep surfaces); read `apps/viewer/README.md`
  before touching it.

#### Deliverables

- [ ] No `identify_version` / `identify_source` references remain in `apps/viewer`.
- [ ] Viewer renders a run containing only the four kept tasks.
- [ ] Tests for this phase (updated vitest specs).

#### Acceptance Criteria

- [ ] `apps/viewer` vitest suite green; grep for the two task names in `apps/viewer` is empty.

#### Test Plan

Unit: updated `explorer.test.ts` / `QuestionList.test.tsx`. Manual: load a four-task run fixture in the
viewer; leaderboard + error explorer render without the retired tasks.

### Phase 5: Docs — tutorial, walkthrough, README, arch-critical

**Dependencies**: Phases 1–4

#### Objective

Bring the prose in line with the shipped behavior.

#### Files to Create / Modify

- `TUTORIAL.md` — the "what questions get asked" sentence lists the four templates; the generate
  command shows `--per-text`; fix the "original languages" framing (KJV is a translation).
- `CODE_WALKTHROUGH.md` — Recipe A step 2 documents the three new fields (one line + example each);
  remove retired-task references (Recipe B, the `_balanced_sample` pointer); keep the pointer-guard
  test green.
- `pipelines/README.md` — "Source catalogue" section documents the three fields and
  original-language-default selection.
- `codev/resources/arch-critical.md` — the "Phase 1 question" line gains "original-language editions
  only by default".

#### Deliverables

- [ ] Four docs updated; three new fields documented in two places (walkthrough + README).
- [ ] Retired tasks and the deleted sampler removed from docs.
- [ ] Tests for this phase (pointer-guard stays green).

#### Acceptance Criteria

- [ ] CODE_WALKTHROUGH pointer-guard test green (all referenced symbols/line pointers resolve).
- [ ] No doc references `identify_version` / `identify_source` / `_balanced_sample` / `--per-task`.

#### Test Plan

Automated: pointer-guard test. Manual: read each doc for accuracy against the shipped code; confirm
the generate example runs.

### Phase 6: Live run and committed original-language evidence

**Dependencies**: Phases 1–5

#### Objective

Prove the whole path end to end on a real panel and commit the evidence.

#### Files to Create / Modify

- `runs/original-<date>/` — questions, answers, scores, summary, manifest, and a `README.md` modeled on
  `runs/tutorial-2026-10-11/README.md`.

#### Deliverables

- [ ] Generate defaults (~14 texts × 20 = ~280 questions); budget note with the cell count before the
      live run.
- [ ] Run the tutorial panel from `configs/models.example.yaml` (Anthropic haiku + opus, search on/off);
      keys loaded only from `sacredtexts/.env` (path only, never printed).
- [ ] Score; commit a fresh `runs/original-<date>/` with README; scores re-derive bit-for-bit.
- [ ] Audit gate green (no restricted-derived artifact).

#### Acceptance Criteria

- [ ] Re-scoring the committed answers reproduces the committed scores byte-for-byte.
- [ ] Copyright audit gate green; viewer renders the new run (per-text table present).
- [ ] If `ANTHROPIC_API_KEY` is absent from `sacredtexts/.env`: stop at the live-run step, commit
      everything else, and report to the architect (do not substitute OpenRouter).

#### Test Plan

Manual, budgeted: generate → budget note → collect (live) → score → audit → viewer smoke. Never re-run
`collect`/`score`/`generate` over committed evidence; write only to the fresh run directory.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| PR #24 (Spec 15) still open at Phase 3; refused/coverage unavailable | Low | Medium | Architect-confirmed #24 merges before scoring (at human pr gate now). Merge `origin/main` and build on the Spec 15 contract at Phase 3. If #24 has not merged at the phase boundary, STOP and ping the architect — do not build a fallback (fail fast, never implement fallbacks). |
| `origin/main` merge conflicts (TUTORIAL / CODE_WALKTHROUGH / score.py docstrings) | High | Low | Expected per the spec; reconcile at the merge, re-run suites + pointer-guard. |
| A committable text can't fill 20 questions for a template | Medium | Medium | Fail-fast names text+template; surface to architect (lower default or exclude the text) — not a silent rebalance. |
| cite_passage Arabic-Indic digit scoring gap (25% of the benchmark) | Medium | High | `citation_hint` steers to Latin/colon; evaluate folding Arabic-Indic digits in Phase 3; verify in the Phase 6 run; test scenario carried from the spec. |
| Template-4 variant-hadith negatives → wrong "no" ground truth | Medium | Medium | Prefer cross-work/cross-family negatives; document the residual limitation for the first run. |
| `ANTHROPIC_API_KEY` absent → live run blocked | Medium | Medium | Deliver Phases 1–5; stop at Phase 6 live step, report to architect; do not substitute OpenRouter. |
| Re-running score/collect over committed evidence nulls the proof | Low | High | Phase 6 writes only to the fresh `runs/original-<date>/`. |

## Documentation Updates

Phase 5 updates `TUTORIAL.md`, `CODE_WALKTHROUGH.md`, `pipelines/README.md`, and
`codev/resources/arch-critical.md`. The review phase will also record lessons in
`codev/reviews/26-original-language-only-questio.md`. No arch.md/lessons-learned.md cold-tier change is
anticipated beyond the arch-critical one-line edit; reassess at review.
