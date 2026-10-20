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

### Phase 1: Catalogue metadata — per-target naming / inclusion / citation fields

**Dependencies**: None.
**⚠️ HOLD-GATE (architect, 2026-10-20):** the exact field schema is **being revised by Waleed** and is
**PENDING the final field table on issue #26**. Do **not** begin this phase's implementation (or edit
any `source.yaml`) until that table lands. If porch hands this phase before the table arrives, STOP at
the phase boundary and ping the architect — do not guess the schema.

**Direction so far (not final):** `ask_as: str` → **`requested_as: [names people actually use]`** (e.g.
`["King James Version", "KJV", "KJV Bible"]`); `original_language: bool` → likely **`canonical_language`**
(the text's own language(s)), with inclusion **derived** as `language ∈ canonical_language` (so no
separate boolean); `citation_hint` likely unchanged. The field **names/arity may change**; what does
**not** change is everything below the schema line — the validation pattern, the metadata *channel*,
and the inclusion *predicate shape*.

#### Objective

Make the new per-target metadata a validated, fail-fast part of the catalogue contract and available to
generation through a `(work, version, language)`-keyed map, so every later phase can rely on it.
Delivers: every committed `source.yaml` carries the final fields; a missing or ill-typed field fails
loading with the file and target named.

#### Files to Create / Modify

- `pipelines/sacredbench/catalogue.py`:
  - add each final field to `_TARGET_REQUIRED`; add a type validator per field (bool/str/list as the
    final schema dictates). **Note:** string fields must be added to `_TARGET_STR_FIELDS` explicitly —
    the current tuple does **not** contain the new fields, so the non-empty-string loop does not cover
    them for free (a list-valued `requested_as` needs its own non-empty-list validator instead);
  - add the fields to the `Target` dataclass and the `Target(...)` constructor;
  - **the metadata channel is a `(work, version, language)`-keyed map, not a path filter** — this holds
    regardless of the field names. `license` reaches generation only as a *path filter*
    (`filter_standardized_paths` → `load_documents` discards the path→doc association), and `_build`
    sees only a `Document` (no catalogue facts). So add a fail-closed
    `text_metadata(sources) -> dict[(work, version, language), TextMeta]` keyed on the same tuple
    converters stamp onto `doc.work/version/language` and that Phase 2 groups "texts" on; a doc whose
    tuple is absent raises `CatalogueError`. The slug-agreement check extends to the new fields.
  - update the module docstring + annotated example YAML.
- `texts/raw/*/source.yaml` (6 files, 23 targets) — add the final fields to every target per the #26
  field table (which will also fix the census mapping — e.g. `canonical_language` per text).
- `pipelines/tests/test_catalogue.py` — new/extended tests.

#### Deliverables

- [ ] Each final field required + type-validated; `Target` exposes them; string/list fields get the
      right validator (not assumed covered by `_TARGET_STR_FIELDS`).
- [ ] `text_metadata()` returns a `(work, version, language)`-keyed map, fail-closed on an unmapped
      tuple; slug-agreement covers the new fields.
- [ ] All 23 targets in the 6 `source.yaml` files carry the final fields per the #26 table.
- [ ] Docstring + example YAML document the fields.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Loading a target missing any required field fails, naming file + `targets[i]`; an ill-typed field
      is rejected.
- [ ] A slug shared by two targets that disagree on a new field fails (slug-agreement).
- [ ] `text_metadata()` raises `CatalogueError` for a `(work, version, language)` not in the catalogue.
- [ ] Pipeline suite green; the real `source.yaml` trackable/payload-ignored test still passes.

#### Test Plan

Unit: field-presence fail-fast (parametrized), type/empty rejection per field, slug-agreement on a
disagreeing fixture, `text_metadata()` fail-closed on an unmapped tuple and correct keying on a
shared-tuple fixture. Regression: existing catalogue tests stay green. Manual: the catalogue gate loads
all real sources.

### Phase 2: Original-language selection, per-text quota, four-template generation

**Dependencies**: Phase 1

#### Objective

Replace the per-task/tradition-balanced generator with original-language-only selection, a per-text
quota over exactly four templates, and natural-language prompts using `ask_as` / `display_citation` /
`citation_hint`. Delivers the new question set.

#### Files to Create / Modify

- `pipelines/sacredbench/generate.py`:
  - `TASKS` → the four kept names (retire `identify_version`, `identify_source` from `TASKS` and
    `_build`); delete `_balanced_sample` and the per-task `quotas`/`per_task` machinery.
  - group standardized docs into **texts by `(work, version, language)`**; take the Phase-1
    `text_metadata` map as a `generate()` parameter and look up each text's metadata by that tuple.
  - **selection predicate (flag matrix), schema-agnostic:** a text is selected iff
    `(included_by_language OR include_translations) AND (not restricted OR include_restricted)`, where
    `included_by_language` is the Phase-1 inclusion rule (final form `language ∈ canonical_language`;
    bool field if the schema stays boolean). Consequences to test as a matrix: original+non-restricted
    → default; original+restricted (TLG) → needs `--include-restricted` only; translation+non-restricted
    → needs `--include-translations`; translation+restricted (NABRE) → needs **both** flags.
  - `--per-text N` (default 20) split over the **active** task set (the four, or the `--tasks` subset):
    `N // len(active)` per task plus one extra to the first `N % len(active)` in canonical order
    (`retrieve_quote`, `complete_unit`, `cite_passage`, `verify_source`). So `--tasks retrieve_quote
    --per-text 20` emits 20/text, not 5. Validate `--per-text >= len(active)` (fail-fast so every active
    task gets ≥1); **15–30 is the documented recommended range for the committable set, not a hard CLI
    clamp** — a hard clamp would break the budgeted Phase-6 smoke (`--per-text` small, one task) and the
    tutorial demo, so it is a README/TUTORIAL note, not a Typer `min/max`.
  - render the four templates using the text's metadata from the map: a name drawn from `requested_as`
    (the primary/first entry unless the final schema says otherwise) as `{ask_as}`; `display_citation`
    (stored citation with a leading work/name prefix stripped) for `retrieve_quote`; `citation_hint`
    appended to `cite_passage`.
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

- [ ] Default selection = the 14 included, non-restricted texts (grouped by tuple); 5/template at
      `--per-text 20` over the four tasks.
- [ ] Flag matrix holds (TLG needs `--include-restricted`; NABRE needs both flags).
- [ ] `--per-text` split over the active task set; `--per-text >= len(active)` fail-fast; deterministic
      remainder.
- [ ] Prompts use a `requested_as` name (never the raw `version`); no duplicated edition name
      (`display_citation`); `cite_passage` appends `citation_hint`.
- [ ] `verify_source`: `source` = asked edition, `expected` gains `true_version`, prompt uses the asked
      text's name, negatives at text granularity with family exclusion.
- [ ] `identify_version` / `identify_source` gone from `TASKS` and `_build`; CODE_WALKTHROUGH
      pointer-guard updated in this commit; first-run regression decision applied; manifest fields added.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Rendered `retrieve_quote` over a hadith/D&C text shows the edition once; over Qur'an/Talmud/BoM
      unchanged.
- [ ] `--tasks retrieve_quote --per-text 20` → 20 questions/text; `--per-text 18` over four tasks →
      deterministic remainder; `--per-text 3` over four tasks → fail-fast.
- [ ] A `verify_source` negative aggregates under the asked text (its `source`), never the passage's
      true source; no negative is same-family as the asked text.
- [ ] Pipeline suite **and** pointer-guard test green; first-run **re-score** regression still
      byte-for-byte.
- [ ] Question-set digest machinery unchanged; manifest records the new fields.

#### Test Plan

Unit: selection flag matrix (4 combinations); grouping by tuple; per-text split over 1/2/4-task
subsets incl. non-multiple and fail-fast floor; `display_citation` no-duplication (work-prefixed vs
bare fixture); `citation_hint` appended; `verify_source` source=asked / `true_version` / name-rendered
/ text-granularity negatives / family exclusion / fail-fast on insufficient cross-family pool; manifest
fields; retired tasks absent. Determinism: same seed → identical output. Regression: pointer-guard
green; first-run re-score green.

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
