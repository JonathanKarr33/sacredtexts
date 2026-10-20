# Plan: Original-language-only question set — four templates, per-text quota, requested_as/canonical_language metadata

**Specification**: [codev/specs/26-original-language-only-questio.md](../specs/26-original-language-only-questio.md)

## Executive Summary

The spec's shape is fixed by Waleed's baked decisions; the plan sequences them along the pipeline's
data flow so each phase is a complete, independently testable unit and each later stage builds on a
green earlier one. The order follows the JSONL seams (catalogue → generate → score) plus the viewer
and docs that trail the code, ending with the committed live run that is the real proof the whole
path works (lessons-critical: "tests pass" ≠ "it works").

1. **Catalogue metadata** is first because generation and selection both read the two new fields;
   nothing downstream can be built or tested until `requested_as` / `canonical_language` load, validate,
   and reach generation through a `(work, version, language)`-keyed map (the plan-review correction: a
   path-keyed `license`-style channel structurally cannot feed a name to the prompt renderer).
2. **Generation** reshapes selection (equality inclusion) + the per-text-28 quota + the four templates
   on top of that contract.
3. **Scoring** hardens `parse_yes_no` (closes the #23 PAPER GATE) and adds the per-text summary, built
   on the **already-merged** Spec 15 outcomes contract (`origin/main` merged before Phase 1).
4. **Viewer** drops the two retired tasks (a separate app with its own vitest suite).
5. **Docs** polish (symbol-coupled doc edits already rode with the code in Phases 2–3).
6. **Live run + evidence** generates the default original-language set (392 questions), smokes, runs the
   panel after an explicit budget sign-off, and commits a fresh `runs/original-<date>/` whose scores
   re-derive bit-for-bit.

Each phase is a single atomic commit. Spec approaches adopted: per-text even split with deterministic
remainder over the active task set (spec Approach 1), `display_citation` prefix-strip (spec Approach A),
leading-stance window before `normalize()`. Pointer-guard-coupled doc edits ride with the code commit
that changes the symbol (plan-review correction) so the suite is green at every phase boundary.

## Phases (Machine Readable)

<!-- REQUIRED: porch parses this JSON to track phase progress. Keep it in sync when you add or remove phases; at least two phases. -->

```json
{
  "phases": [
    {"id": "phase_1", "title": "Catalogue metadata: requested_as / canonical_language"},
    {"id": "phase_2", "title": "Original-language selection, per-text quota, four-template generation"},
    {"id": "phase_3", "title": "Scoring: leading-stance yes/no (#23), retire tasks, per-text summary"},
    {"id": "phase_4", "title": "Viewer: retire identify_version / identify_source"},
    {"id": "phase_5", "title": "Docs: tutorial, walkthrough, README, arch-critical"},
    {"id": "phase_6", "title": "Live run and committed original-language evidence"}
  ]
}
```

## Phase Breakdown

### Phase 1: Catalogue metadata — requested_as / canonical_language

**Dependencies**: None (build on the already-merged `origin/main`, which carries the Spec 15 contract).

**Final schema (architect, #26 field table, 2026-10-20):** exactly **two** new per-target fields —
`requested_as: [names]` (a non-empty list of the names people actually use, e.g.
`["King James Version", "KJV", "KJV Bible"]`) and `canonical_language: str` (the text's own language).
**Inclusion is derived, not stored:** a text is original-language iff `language == canonical_language`
(equality). **`citation_hint` is dropped** (template 3 instead shows the citation form by example — a
Phase 2 concern). **Remove the two `KJV (LDS 2013 edition)` targets** from the LDS `source.yaml` (→ 21
targets across 6 files). Starting values for every target are the table on **issue #27**.

#### Objective

Make `requested_as` and `canonical_language` validated, fail-fast parts of the catalogue contract and
available to generation through a `(work, version, language)`-keyed map, so every later phase can rely
on them. Delivers: every committed `source.yaml` carries both fields; a missing or ill-typed field
fails loading with the file and target named.

#### Files to Create / Modify

- `pipelines/sacredbench/catalogue.py`:
  - add `requested_as` and `canonical_language` to `_TARGET_REQUIRED`; validate `canonical_language` as
    a non-empty string (add it to `_TARGET_STR_FIELDS` — the current tuple does **not** contain it) and
    `requested_as` with a dedicated **non-empty list-of-non-empty-strings** validator (the string loop
    does not cover a list);
  - add both fields to the `Target` dataclass and the `Target(...)` constructor;
  - **the metadata channel is a `(work, version, language)`-keyed map, not a path filter.** `license`
    reaches generation only as a *path filter* (`filter_standardized_paths` → `load_documents` discards
    the path→doc association), and `_build` sees only a `Document` (no catalogue facts). So add a
    fail-closed `text_metadata(sources) -> dict[(work, version, language), TextMeta]`
    (`TextMeta = {requested_as, canonical_language}`) keyed on the tuple converters stamp onto
    `doc.work/version/language` and that Phase 2 groups "texts" on; a doc whose tuple is absent raises
    `CatalogueError`. The slug-agreement check extends to both fields.
  - update the module docstring + annotated example YAML.
- `texts/raw/*/source.yaml` (6 files) — add `requested_as` + `canonical_language` to every target with
  the #27 starting values; **delete the two `KJV (LDS 2013 edition)` targets** from the LDS file.
- `pipelines/tests/test_catalogue.py` — new/extended tests.

#### Deliverables

- [ ] Both fields required + validated (`canonical_language` non-empty str via `_TARGET_STR_FIELDS`;
      `requested_as` via a non-empty-list-of-strings validator); `Target` exposes them.
- [ ] `text_metadata()` returns a `(work, version, language)`-keyed map, fail-closed on an unmapped
      tuple; slug-agreement covers both fields.
- [ ] All 21 targets in the 6 `source.yaml` files carry both fields (from #27); the two LDS KJV targets
      are removed.
- [ ] Docstring + example YAML document the two fields.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Loading a target missing either field fails, naming file + `targets[i]`; a non-list `requested_as`,
      an empty list, or an empty `canonical_language` is rejected.
- [ ] A slug shared by two targets that disagree on a field fails (slug-agreement).
- [ ] `text_metadata()` raises `CatalogueError` for a `(work, version, language)` not in the catalogue.
- [ ] Pipeline suite green; the real `source.yaml` trackable/payload-ignored test still passes.

#### Test Plan

Unit: field-presence fail-fast (both), `requested_as` non-list / empty-list / empty-element rejection,
`canonical_language` empty rejection, slug-agreement on a disagreeing fixture, `text_metadata()`
fail-closed on an unmapped tuple and correct keying on a shared-tuple fixture. Regression: existing
catalogue tests stay green. Manual: the catalogue gate loads all real sources.

### Phase 2: Original-language selection, per-text quota, four-template generation

**Dependencies**: Phase 1

#### Objective

Replace the per-task/tradition-balanced generator with original-language-only selection, a per-text
quota over exactly four templates, and natural-language prompts using a seeded `requested_as` name,
`display_citation`, and an example-based citation form. Delivers the new question set.

#### Files to Create / Modify

- `pipelines/sacredbench/generate.py`:
  - `TASKS` → the four kept names (retire `identify_version`, `identify_source` from `TASKS` and
    `_build`); delete `_balanced_sample` and the per-task `quotas`/`per_task` machinery.
  - group standardized docs into **texts by `(work, version, language)`**; take the Phase-1
    `text_metadata` map as a `generate()` parameter and look up each text's metadata by that tuple.
  - **selection predicate (flag matrix):** a text is selected iff
    `(included_by_language OR include_translations) AND (not restricted OR include_restricted)`, where
    `included_by_language` ⇔ `language == canonical_language` (equality, the #26 inclusion rule).
    Consequences to test as a matrix: original+non-restricted → default; original+restricted (TLG) →
    needs `--include-restricted` only; translation+non-restricted → needs `--include-translations`;
    translation+restricted (NABRE) → needs **both** flags.
  - `--per-text N` (**default 28** → 7 per template over the four tasks) split over the **active** task
    set (the four, or the `--tasks` subset): `N // len(active)` per task plus one extra to the first
    `N % len(active)` in canonical order (`retrieve_quote`, `complete_unit`, `cite_passage`,
    `verify_source`). So `--tasks retrieve_quote --per-text 28` emits 28/text, not 7. Validate
    `--per-text >= len(active)` (fail-fast so every active task gets ≥1); **15–30 is the documented
    recommended range for the committable set, not a hard CLI clamp** — a hard clamp would break the
    budgeted Phase-6 smoke (`--per-text` small, one task), so it is a README/TUTORIAL note, not a Typer
    `min/max`.
  - render the four templates using the text's metadata from the map:
    - `{edition}` = a **seeded uniform choice** from the text's `requested_as` list (deterministic in
      the question seed), **recorded in `question.source.requested_as`** (the chosen name; keep the full
      list available there too for the viewer/scoring). Never the raw `version` string.
    - `retrieve_quote` uses `display_citation` (stored citation with a leading work/name prefix stripped
      so the edition is named once).
    - `cite_passage` (template 3) shows the **citation form by example**: append an exemplar citation
      taken from a **different seeded entry of the same text** (so the model answers in the scored
      shape), e.g. *"…Answer with the citation only, in the same form as: {example_citation}."*
      `citation_hint` is dropped entirely. This needs ≥2 entries per text for `cite_passage` (target +
      exemplar) — enforce and fail-fast otherwise.
  - **`verify_source` identity rewrite (spec Constraints; currently the opposite):** the question
    belongs to the **asked** edition — `source` records the asked text, the prompt interpolates the
    asked text's `requested_as` name (not a raw `neg_work`), and `expected` gains `true_version`
    alongside `true_work`. Select negatives at **`(work, version, language)`** granularity (not the
    current `work`-only `works`/`work_texts`), keeping the exact-contained exclusion, and apply a
    **family exclusion** so a negative is never drawn from the **same family** as the asked text (define
    family by `document_type` — the nine hadith collections are one family — because they share
    variant-wording narrations that defeat exact-text exclusion and yield wrong "no" truth). Fail-fast
    if a text cannot source enough cross-family negatives. Keep the existing deterministic negative
    share (`int(verify_template_quota × negatives_share)`).
  - fail fast (naming text+template) when a template's share can't be filled; manifest records
    `per_text`, `include_translations`, and the selected-texts list.
- `pipelines/sacredbench/cli.py` — `generate`: drop `--per-task` / `--quota`; add `--per-text` /
  `--include-translations`; keep `--tasks` / `--negatives-share`.
- `CODE_WALKTHROUGH.md` — **in this same commit**, update the pointer-guard entries coupled to the
  symbols this phase deletes/changes (`test_code_walkthrough.py` requires `def _balanced_sample(` and
  the `TASKS = (` shape in `_REQUIRED_SYMBOLS`) so the pointer-guard test stays green from this commit
  on. Recipe prose polish not coupled to a deleted symbol stays in Phase 5.
- `pipelines/tests/test_first_run_regression.py` — **named decision:** this guard calls
  `run_generate(docs, per_task=…, quotas=…)` and re-asserts the committed first-run question-set digest;
  the signature is removed and the 100-question `retrieve_quote`-only set is **not expressible** under
  `--per-text` (no N yields 100 over 3 texts). Retire the **generation-invariance** half (regenerate →
  same digest) with rationale (the generator's interface changed by design); **keep the re-score half**
  (score committed answers → committed scores, byte-for-byte — unaffected, `retrieve_quote`-only). A new
  generation-invariance anchor is re-established on the fresh Phase-6 run (digest-pinned there).
- `pipelines/tests/test_generate.py` — rewrite retired-task + quota/balancing tests; add the new ones.

#### Deliverables

- [ ] Default selection = the 14 included (`language == canonical_language`), non-restricted texts
      (grouped by tuple); 7/template at `--per-text 28` over the four tasks.
- [ ] Flag matrix holds (TLG needs `--include-restricted`; NABRE needs both flags).
- [ ] `--per-text` split over the active task set; `--per-text >= len(active)` fail-fast; deterministic
      remainder.
- [ ] Prompts use a **seeded** `requested_as` name recorded in `question.source.requested_as` (never the
      raw `version`); no duplicated edition name (`display_citation`); `cite_passage` shows the citation
      form by example from a different seeded entry (no `citation_hint`).
- [ ] `verify_source`: `source` = asked edition, `expected` gains `true_version`, prompt uses the asked
      text's `requested_as` name, negatives at text granularity with family exclusion.
- [ ] `identify_version` / `identify_source` gone from `TASKS` and `_build`; CODE_WALKTHROUGH
      pointer-guard updated in this commit; first-run regression decision applied; manifest fields added.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Rendered `retrieve_quote` over a hadith/D&C text shows the edition once; over Qur'an/Talmud/BoM
      unchanged; `cite_passage` shows an exemplar citation from another entry of the same text.
- [ ] `--tasks retrieve_quote --per-text 28` → 28 questions/text; `--per-text 18` over four tasks →
      deterministic remainder; `--per-text 3` over four tasks → fail-fast.
- [ ] A `verify_source` negative aggregates under the asked text (its `source`), never the passage's
      true source; no negative is same-family as the asked text.
- [ ] Pipeline suite **and** pointer-guard test green; first-run **re-score** regression still
      byte-for-byte.
- [ ] Question-set digest machinery unchanged; manifest records the new fields.

#### Test Plan

Unit: selection flag matrix (4 combinations); grouping by tuple; per-text split over 1/2/4-task
subsets incl. non-multiple and fail-fast floor; seeded `requested_as` choice is deterministic and
recorded in `source.requested_as`; `display_citation` no-duplication (work-prefixed vs bare fixture);
`cite_passage` exemplar drawn from a different same-text entry (and fail-fast when <2 entries);
`verify_source` source=asked / `true_version` / name-rendered / text-granularity negatives / family
exclusion / fail-fast on insufficient cross-family pool; manifest fields; retired tasks absent.
Determinism: same seed → identical output. Regression: pointer-guard green; first-run re-score green.

### Phase 3: Scoring — leading-stance yes/no (#23), retire tasks, per-text summary

**Dependencies**: Phase 2 (tasks and prompts exist). Builds on the **already-merged** Spec 15 contract
(`origin/main` merged before Phase 1: `graders.py`, `outcomes.py`, `score.py`'s `_with_outcome`,
refused-outcome + coverage).

#### Objective

Harden `verify_source` scoring with leading-stance parsing (closes #23, the arch-critical PAPER GATE),
remove scoring for the two retired tasks, and add the model-keyed per-text summary table.

#### Files to Create / Modify

- `pipelines/sacredbench/score.py` — on the merged Spec 15 base (named graders + always-on
  correct/incorrect/**refused** outcome, `accuracy = correct/(correct+incorrect)` with `coverage =
  (correct+incorrect)/n`). Rewrite `parse_yes_no` to take the leading window (first sentence / first 60
  chars) from the **raw answer before `normalize()`**, returning yes / no / `None`; a leading decline
  cue → `None`, which the existing `_with_outcome`/refusal layer classifies as `refused`. Remove the
  `identify_version` / `identify_source` branches and their `_SUBMETRICS` entries — **update the
  `_SUBMETRICS = {` symbol in this commit** since `test_code_walkthrough.py` pointer-guards it. Add
  `by_text[model_id][text]` to the summary dict and a per-text table (text, n, accuracy, coverage,
  refused) to `summary_markdown`; the `by_text` key is a **stable, unambiguous** string derived from
  `(work, version, language)` (same tuple as Phases 1–2), so negatives aggregate under
  `question.source` (the asked edition, inverted in Phase 2). Update the module docstring / SCOPE block
  (remove the #23 gap note it now closes). **Do not re-score committed evidence**; if retiring the two
  tasks moves any committed number, that is a sanctioned oracle-witnessed rebaseline
  (`test_contains_reference_rebaseline.py`) surfaced to the architect first — but the committed runs are
  `retrieve_quote`-only, so none is expected.
- `pipelines/tests/test_score.py` — adversarial `parse_yes_no` cases; per-text summary (stable key,
  collision, negative-aggregates-under-asked-text); remove retired-task tests.

#### Deliverables

- [ ] Leading-stance `parse_yes_no`; the four adversarial cases classify correctly (incl. decline →
      `None` → `refused`, window taken pre-normalize).
- [ ] `identify_version` / `identify_source` scoring + `_SUBMETRICS` entries removed (pointer-guard
      updated in this commit).
- [ ] Per-text summary keyed by model then text (text, n, accuracy, coverage, refused) in
      `summary.json` and `summary.md`, on the Spec 15 outcome contract, with a stable `(work, version,
      language)`-derived key.
- [ ] Module docstring updated; #23 closed (PAPER GATE cleared).
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] `"There is no way to verify this... Yes"` → `None` (→ `refused`); `"No, that is from Sahih
      Muslim"` → no; `"Yes."` → yes; bare decline → `None` (→ `refused`).
- [ ] A `verify_source` negative aggregates under the asked text's key, not the passage's true source;
      no key collision across the selected texts.
- [ ] Committed `runs/first-run-2026-10-11` re-scores bit-for-bit (retrieve_quote-only, unaffected).
- [ ] Pipeline suite **and** pointer-guard test green.

#### Test Plan

Unit: parametrized adversarial yes/no incl. pre-normalize window and incidental-"no" cases; per-text
summary structure (multi-model fixture), stable-key collision test, negative-aggregates-under-asked
test; retired-task scoring absent; `_SUBMETRICS` pointer-guard green. Regression:
`test_first_run_regression.py` re-score byte-for-byte; the Spec 15 rebaseline oracle stays green.
Integration: score a Phase-2 fixture question set end to end.

### Phase 4: Viewer — retire identify_version / identify_source

**Dependencies**: Phase 2 (tasks retired in generation)

#### Objective

Remove the two retired tasks from the benchmark viewer so the viewer suite stays green and the UI has
no dead task handling. **Scope is limited to retirement** — the per-text table is a `summary.md`/
`summary.json` deliverable (Phase 3), not a viewer feature; `localResults.ts` destructures only
`models`/`by_tradition`/`usage`/`panel`, so `by_text` is simply ignored by the viewer and no rendering
is added here.

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

This phase is **prose/recipe polish only** — the pointer-guard-coupled edits (`_balanced_sample`,
`TASKS`, `_SUBMETRICS`) already landed in Phases 2–3 with the code that changed them, so the suite is
green throughout and this phase adds no symbol-coupled edits.

#### Files to Create / Modify

- `TUTORIAL.md` — the "what questions get asked" sentence lists the four templates (incl. template 3's
  by-example citation form); the generate command shows `--per-text` (default 28); fix the "original
  languages" framing (KJV is a translation). **Reproduce-the-committed-run decision:** the documented
  `--tasks retrieve_quote --per-task 100 … reproduces tutorial-2026-10-11` command is no longer
  reproducible (no `--per-text` yields that set). Repoint the tutorial's reference run + digest claim to
  the fresh Phase-6 `runs/original-<date>/` (keep `tutorial-2026-10-11` as a historical artifact), so
  the "reproduce this exact run" promise stays true under the new generator.
- `CODE_WALKTHROUGH.md` — Recipe A step 2 documents the **two** new fields (`requested_as`,
  `canonical_language`, one line + example each); remove retired-task/`_balanced_sample` prose from
  Recipe B. (The pointer-guard list itself was updated in Phases 2–3.)
- `pipelines/README.md` — "Source catalogue" section documents the two fields, the equality inclusion
  rule, and original-language-default selection.
- `codev/resources/arch-critical.md` — the "Phase 1 question" line gains "original-language editions
  only by default"; the #23 PAPER-GATE line is updated to "closed by Spec 26" once Phase 3 lands.

#### Deliverables

- [ ] Four docs updated; both new fields documented in two places (walkthrough + README).
- [ ] Retired tasks and the deleted sampler removed from doc prose; tutorial reproduce-run claim repointed.
- [ ] Tests for this phase (pointer-guard stays green).

#### Acceptance Criteria

- [ ] CODE_WALKTHROUGH pointer-guard test green (all referenced symbols/line pointers resolve).
- [ ] No doc references `identify_version` / `identify_source` / `_balanced_sample` / `--per-task` /
      `citation_hint`.

#### Test Plan

Automated: pointer-guard test. Manual: read each doc for accuracy against the shipped code; confirm the
documented generate/reproduce command actually reproduces the repointed reference run's digest.

### Phase 6: Live run and committed original-language evidence

**Dependencies**: Phases 1–5

#### Objective

Prove the whole path end to end on a real panel and commit the evidence.

#### Files to Create / Modify

- `runs/original-<date>/` — questions, answers, scores, summary, manifest, and a `README.md` modeled on
  `runs/tutorial-2026-10-11/README.md`.

#### Deliverables

- [ ] Generate defaults (**14 texts × 28 = 392 questions**).
- [ ] **Cheap live smoke first** (e.g. `--per-text` small, one task, haiku-only) to catch live-only
      failures before the full panel (lessons-critical: keep a budgeted live smoke in the loop).
- [ ] **Budget note + explicit architect sign-off gate before the full panel:** 392 questions × 4 panel
      arms (haiku + opus, each search on/off, two opus arms use `web_search`) ≈ **1,568 live cells** —
      post the estimate and wait for the architect's go before collecting the full panel (outward-facing,
      costly action).
- [ ] Run the tutorial panel from `configs/models.example.yaml`; keys loaded only from
      `sacredtexts/.env` (path only, never printed).
- [ ] Score; commit a fresh `runs/original-<date>/` with README; scores re-derive bit-for-bit.
- [ ] Audit gate green (no restricted-derived artifact).

#### Acceptance Criteria

- [ ] Re-scoring the committed answers reproduces the committed scores byte-for-byte.
- [ ] Copyright audit gate green; the **per-text table is present in `summary.md`/`summary.json`** (the
      viewer renders the run without the retired tasks; it does not render `by_text`).
- [ ] If `ANTHROPIC_API_KEY` is absent from `sacredtexts/.env`: stop at the live-run step, commit
      everything else, and report to the architect (do not substitute OpenRouter).

#### Test Plan

Manual, budgeted: generate → smoke → budget note + architect sign-off → collect (full panel, live) →
score → audit → viewer smoke. Never re-run `collect`/`score`/`generate` over committed evidence; write
only to the fresh run directory.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Spec 15 base shifts under the scoring work | Low | Medium | Spec 15 / PR #24 is **merged** (`origin/main` merged before Phase 1: `graders.py`, `outcomes.py`, `_with_outcome`). Phase 3 builds on it directly; no fallback. |
| Metadata field schema churns again | Low | Medium | #26 field table is **final** (two fields, equality inclusion, `citation_hint` dropped, default 28). Starting values on #27. If a new change arrives, STOP and ping — do not guess. |
| A committable text can't fill 28 questions for a template (incl. `cite_passage` needing ≥2 entries) | Medium | Medium | Fail-fast names text+template; surface to architect (lower default or exclude the text) — not a silent rebalance. |
| cite_passage Arabic-Indic digit scoring gap (25% of the benchmark) | Medium | High | Template 3's **by-example** citation form steers the model to the scored shape (replacing `citation_hint`); evaluate folding Arabic-Indic digits in Phase 3 (`\d` matches `٧` but NFKD doesn't fold it, and `_NUM_CITE`'s `[A-Za-z]` prefix fails on Arabic); verify in the Phase 6 run; test scenario carried from the spec. |
| verify_source negatives: variant-wording narrations shared across the 9 hadith collections → wrong "no" | Medium | Medium | Family exclusion by `document_type` (never pair two hadith collections) — a real mitigation, since cross-*work* alone is a no-op (the 9 are distinct works); fail-fast on insufficient cross-family pool. |
| `ANTHROPIC_API_KEY` absent → live run blocked | Medium | Medium | Deliver Phases 1–5; stop at Phase 6 live step, report to architect; do not substitute OpenRouter. |
| Full panel cost (~1,568 cells) run without sign-off | Low | High | Phase 6 runs a cheap smoke, posts the budget estimate, and waits for explicit architect sign-off before the full panel. |
| Re-running score/collect over committed evidence nulls the proof | Low | High | Phase 6 writes only to the fresh `runs/original-<date>/`; any deliberate contract-driven move is a sanctioned rebaseline, surfaced first. |

## Documentation Updates

Phase 5 updates `TUTORIAL.md`, `CODE_WALKTHROUGH.md`, `pipelines/README.md`, and
`codev/resources/arch-critical.md`. The review phase will also record lessons in
`codev/reviews/26-original-language-only-questio.md`. No arch.md/lessons-learned.md cold-tier change is
anticipated beyond the arch-critical one-line edit; reassess at review.
