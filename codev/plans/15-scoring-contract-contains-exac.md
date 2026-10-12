# Plan: Scoring contract — contains-exact discriminator

**Specification**: [codev/specs/15-scoring-contract-contains-exac.md](../specs/15-scoring-contract-contains-exac.md)

## Executive Summary

Implements the spec's **Approach 1**: a deterministic, word-bounded `contains_reference` submetric for the
two text-retrieval tasks (`retrieve_quote`, `complete_unit`), adopted into the headline as
`correct = normalized OR contains_reference`. Approach 2 (encoding-variance folding) is rejected; Approach 3
(LLM judge on the 25 not-contained near-miss cells) is deferred / out of scope.

**Implementation is tiny.** `_bounded_equal(answer, expected)` (`score.py:176`) *already is* word-bounded
containment of the normalized expected inside the normalized answer (despite its name). The whole scorer
change is `contains_reference = int(bool(normalize(target)) and _bounded_equal(answer, target))` — the
`bool(normalize(target))` guard is required because `re.escape("")` would otherwise match everywhere. Reuse
`_bounded_equal`; do **not** re-write the `(?<!\w)…(?!\w)` regex.

**Two phases, single rebaseline, one atomic commit for the contract.** Changing the per-answer `metrics`
dict makes the committed `scores.jsonl` no longer reproduce, so every guard that reads committed run
evidence goes red until the evidence is regenerated. Splitting code from evidence leaves a red tree;
splitting diagnostic-from-headline forces two rebaselines (spec + reviewers forbade). So **Phase 1** lands
the scorer change, the one-shot rebaseline of both committed runs, and **all nine** affected guards
(4 pipeline + 5 viewer) in one green commit, with pre-registered deltas (tutorial `+20`, first-run `+1`).
**Phase 2** syncs the prose docs. The headline-vs-diagnostic confirmation is the human's call at the PR gate
(spec Open Questions); a revert is a bounded second rebaseline, pre-analysed.

**Deltas (independently verified by both reviewers):** tutorial 20 flips (haiku-search 40 %→52 %, opus-search
66 %→74 %, no-tools 0) — composed of **13 Qur'an + 7 Talmud** (haiku-search's 12 all Qur'an; opus-search's 8
= 7 Talmud + 1 Qur'an), **not "all Qur'an"**; first-run 1 flip (claude-haiku 24 %→25 %, tradition "The Church
of Jesus Christ of Latter-Day Saints").

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
headline, regenerate both committed runs' evidence, and green every guard that reads that evidence — one
atomic commit that corrects the search sign-inversion. The recovered gains surface in the accuracy number
`summary.md` and the viewer leaderboard already render, so no new display surface is added.

#### Files to Create / Modify

**Scorer (`pipelines/sacredbench/score.py`):**
- In `score_answer()` for `retrieve_quote`/`complete_unit`: `contains_reference = int(bool(normalize(target))
  and _bounded_equal(answer, target))`; `correct = int(norm or contains_reference)`. **Insert `contains_reference`
  before `correct`** in the returned dict (append-only diff).
- Add `"contains_reference"` to `_SUBMETRICS` for `retrieve_quote` and `complete_unit`, **appended after
  `token_f1`** (append-only diff).
- In `score_file()`: seed the per-cell accumulator with `"contains_reference": 0` **and** add an explicit
  `acc["contains_reference"] += metrics.get("contains_reference", 0)` line (the existing code updates
  `exact`/`normalized`/`token_f1` explicitly; `acc[sm]` is only *read* during summary construction — do
  not assume a generic `acc[sm] +=` path exists).
- Update the **module docstring** (`:1-40`) retrieve_quote/complete_unit headline rule and the "nothing
  else" framing to describe `normalized OR contains_reference`; fix `_bounded_equal`'s docstring to note it
  is reused as `contains_reference`.
- **Do not touch** `normalize()`, `strip_script_marks()`, or the four non-text-retrieval branches
  (`verify_source`, `identify_version`, `cite_passage`, `identify_source`).

**Pipeline unit tests (`pipelines/tests/test_score.py`):**
- Update **only** the `retrieve_quote` whole-dict assertion (`:46`) to include `contains_reference`. **Do
  NOT touch `:231`** — that is `identify_version` and must stay byte-for-byte unchanged (the spec's
  provenance-untouched criterion).
- Add cases: wrapped-exact (`﴿…﴾` / trailing English note) → `contains_reference=1, normalized=0,
  correct=1`; strict match → both 1; not-contained near-miss → 0, `correct=0`; fragment/boundary (`Jude 1:3`
  ∉ `Jude 1:30`); empty-normalising expected → 0; each of the four non-text-retrieval task dicts has no
  `contains_reference` key; accumulator carries the key without `KeyError`.

**Rebaseline — committed evidence (both runs):**
- `runs/first-run-2026-10-11/{scores.jsonl,summary.json,summary.md}` and
  `runs/tutorial-2026-10-11/{scores.jsonl,summary.json,summary.md}` regenerated via the **procedure below**.

**Pipeline regression guards (confirm green against regenerated evidence):**
- `pipelines/tests/test_first_run_regression.py`, `pipelines/tests/test_tutorial_run.py` (byte-for-byte
  re-score; green once committed `scores.jsonl` is regenerated — check `FIRST_RUN_KEY`/standings keys
  unchanged).

**Viewer vitest guards (same atomic commit — editing `apps/viewer/` is what makes `.codev/checks/test.sh`
run vitest at all; `runs/` alone maps to the pipelines lane only):**
- Run `pnpm -C apps/viewer test` and update **every** fixture (and comment) that pins a pre-rebaseline
  number. Verified pin sites:
  - `apps/viewer/src/local/tutorialRun.test.ts` — row-order assert `:115` → `["opus-search","opus",
    "haiku-search","haiku"]` (`:117` is the non-increasing check; comments `:112-114`, `:142` also carry
    40/47/66); `:118-119` `0.66`→`0.74`, `0.4`→`0.47`; `:148` `correct 40`→`52`.
  - `apps/viewer/src/routes/ExplorerPage.test.tsx` — five "24" sites (`:147` title, `:152` comment, `:154`,
    `:163` title, `:168`) → `25`.
  - `apps/viewer/src/routes/LeaderboardPage.test.tsx` — pin `:215` (`:214` is the comment) `"72% (n=25)"` → `76%`.
  - `apps/viewer/src/routes/StandingsPage.test.tsx` — `:134` `"24% (n=100)"` first-run → `25%`.
  - `realRun.test.ts` reads committed runs but has **no numeric pins** → stays green (claude-verified); re-run to confirm.
  Viewer *source* needs no change — `ScoreMetrics` keys are optional and `QuestionList.tsx:85-87` renders
  three fixed metrics, so the extra JSON key is inert.

#### The rebaseline procedure (explicit — the CLI cannot do first-run)

Never re-run `collect`/`generate`; never hand-edit `scores.jsonl`; never rebuild panels from a YAML config.

- **`scores.jsonl` (both runs):** call `score_file(answers_path, out_path)` (no roster/panel) — this is the
  byte-for-byte path the run guards assert. Commit the regenerated file.
- **`summary.{json,md}` — tutorial:** fingerprints are present (`anthropic|claude-haiku-5-5||`), so a roster
  is reconstructable. Regenerate by calling `score_file()` programmatically with `expected` /
  `expected_tradition` rebuilt from committed `questions.jsonl` × the four model ids, `panel` taken
  **verbatim from the committed `summary.json` panel block** (prices `None`), and `expected_digest =
  gen.question_set_digest(qs)` from the committed `questions.jsonl`. Record the exact script in the review
  (the reconstructed config is ephemeral / gitignored).
- **`summary.{json,md}` — first-run:** first-run answers carry **no `panel_fingerprint`**, so `score
  --config` fail-fasts (`cli.py:325-331`) and a keyless score nulls `panel`/`expected_n`/`missing` (the
  `lessons-critical` scar). Regenerate the same programmatic way — `panel` verbatim from the committed
  first-run `summary.json`, roster + digest from committed `questions.jsonl`. **Must not** stamp `[no-tools]`
  (would change the standings key, collide with the tutorial `haiku` row, and stale `test_tutorial_run.py:20
  FIRST_RUN_KEY`).
- **Writer params (must match the CLI exactly, else a whitespace diff makes the honest diff unauditable):**
  write `summary.json` with `json.dump(summary, f, indent=1)` + a trailing `"\n"`, and `summary.md` via
  `summary_markdown(summary)` → `write_text(...)` — per `cli.py` (`json.dump(..., indent=1)` confirmed
  against the committed files).

#### Pre-registered honest diff (what may change, and nothing else)

- `scores.jsonl` (both): every `retrieve_quote` row gains a `contains_reference` key; `correct` flips 0→1 on
  **exactly** the 21 pre-registered `(model_id, question_id)` cells (20 tutorial + 1 first-run); no other row changes.
- `summary.json` (both): `retrieve_quote` cells gain a `contains_reference` submetric; `accuracy` /
  `by_tradition` / `_overall` move only for the flipped cells. Tutorial already has `generated_at` → it
  changes. **first-run gains TWO new keys** — `generated_at` (score.py:435; committed first-run summary keys
  are `[models, by_tradition, usage, panel]`, no `generated_at` today) **and** `api_model` (score.py:429).
  Both are guard-safe (only tutorial/synthetic tests assert `generated_at`). Panel
  provider/model/endpoint/served_by, usage, and costs unchanged; no standings key changes.
- `summary.md` (both): regenerated via `summary_markdown()`; its accuracy cells move for the flipped cells
  **and the leaderboard row order changes** (tutorial: `opus-search` rises above `opus`, `haiku-search` above
  `haiku`). Pre-registered, not a surprise.

#### Deliverables

- [ ] `contains_reference` via `_bounded_equal` + empty-expected guard; `correct = normalized OR contains_reference` for the two text-retrieval tasks only.
- [ ] `_SUBMETRICS` **and** the `score_file` accumulator both carry `contains_reference` (explicit update + seed; no `KeyError`).
- [ ] The four non-text-retrieval task branches and `test_score.py:231` byte-for-byte unchanged.
- [ ] Both runs rebaselined once via the documented procedure; the pre-registered honest diff holds; no `[no-tools]` / standings-key drift.
- [ ] A **mandatory** pinned validation test `pipelines/tests/test_contains_reference_rebaseline.py` (durable-oracle hash + exact 21-pair flip set; see Test Plan) — the byte guards are circular after rebaseline and no longer witness "nothing else moved".
- [ ] **The nine affected guards green** — 4 pipeline: (1) `test_first_run_regression.py`, (2) `test_tutorial_run.py`, (3) `test_score.py` (retrieve_quote dict `:46`), (4) the new `test_contains_reference_rebaseline.py`; 5 viewer: (5) `tutorialRun.test.ts`, (6) `ExplorerPage.test.tsx`, (7) `LeaderboardPage.test.tsx`, (8) `StandingsPage.test.tsx`, (9) `realRun.test.ts` (reads runs; no numeric pins — confirm green).
- [ ] Tests for this phase (the `test_score.py` cases + the new rebaseline-validation test).

#### Acceptance Criteria

- [ ] `.codev/checks/test.sh` green for **both** lanes (pipelines pytest + apps/viewer vitest — the commit touches both trees).
- [ ] Recomputed deltas equal exactly tutorial +20 / first-run +1; haiku-search 40 %→52 %, opus-search 66 %→74 %, no-tools unmoved; claude-haiku 24 %→25 % (LDS tradition cell 72 %→76 %).
- [ ] Latin-invariance: no Latin answer's `exact`/`normalized`/`token_f1` changes; the pinned validation witnesses the exact flip set.
- [ ] Copyright audit gate passes on rebaselined artifacts.
- [ ] Commit message / review pre-registers the +20 / +1 deltas and records the rebaseline script.

#### Test Plan

- **Unit** (`test_score.py`): the wrapped-exact / strict / not-contained / boundary / empty / four-tasks-unchanged / accumulator cases, using real tutorial wrapper strings.
- **Regression** (both run byte guards): re-score committed answers → regenerated `scores.jsonl` byte-for-byte.
- **Mandatory pinned validation** — a NEW test file `pipelines/tests/test_contains_reference_rebaseline.py`:
  - **Durable oracle:** pin a SHA-256 of the canonical, order-independent `(model_id, question_id) →
    (exact, normalized, token_f1)` projection, computed **once from the pre-change committed `scores.jsonl`
    before regeneration** (capture via `git show HEAD:…` at authoring time; the hash is the frozen oracle —
    this PR doesn't touch those three fields, so the regenerated projection must hash identically). The test
    re-projects the regenerated committed `scores.jsonl` and asserts the hash matches → proves
    `exact`/`normalized`/`token_f1` unmoved on all 800 rows without needing a live "pre" file.
  - **Exact flip set:** assert the `correct`-flip set equals **exactly** the 21 hard-coded `(model_id,
    question_id)` pairs (not an aggregate — compensating changes preserve totals).
  - **Self-contained invariant** (secondary): for every `retrieve_quote` row `correct == normalized` except
    the 21, and `contains_reference ⊇ normalized`.
  - Pin per-cell summary values too (haiku-search `0.52`, haiku `0.47`, opus-search `0.74`, opus `0.66`;
    first-run claude-haiku `_overall 0.25` + LDS cell `0.76`).
  This is the durable witness once the byte-for-byte run guards are rebaselined and circular.
- **Viewer** (`pnpm -C apps/viewer test`): all suites green against the rebaselined fixtures.
- **Manual**: open both regenerated `summary.md` and confirm the headline reflects the recovered cells.

### Phase 2: Documentation sync for the new contract

**Dependencies**: Phase 1

#### Objective

Bring every prose doc that describes the old frozen contract, the finding, or the never-re-score rule into
line with the implemented contract, so no doc contradicts the code or the rebaselined evidence.

#### Files to Create / Modify

- `CODE_WALKTHROUGH.md` — `_SUBMETRICS` list includes `contains_reference`; fix the misleading "add a line
  to `_SUBMETRICS`" note to require the accumulator update too; update §5 from "a follow-up should…" to
  "implemented as `contains_reference`, adopted into the headline"; amend **both** contradicted bullets: the
  "**never** re-run generate/collect/score over the committed runs" bullet (~`:300-304`) **and** `:305-308`
  ("`test_first_run_regression.py` is the proof that a scoring change did not disturb committed numbers … a
  new task should *add* evidence, not perturb the old") — describe the sanctioned re-score-in-place exception
  this PR used. **Re-derive every `score.py:N` pointer**: the real set is `:1`×2, `:60`, `:87`, `:108`×2,
  `:115`, `:126`, `:183`, `:201`×2, `:235`, `:266`, `:452` (no `:176` pointer exists) — Phase 1 shifts the
  module docstring, `_SUBMETRICS`, `score_answer`, and `score_file`, and `test_code_walkthrough.py` only
  checks in-range, so stale pointers fail silently.
- `TUTORIAL.md` — `:94-103` presents the old headline (opus 66 % / haiku-search 40 %) and calls the strict
  headline "misleading"; `:29` frames containment as an *external* "headline-vs-contains-exact analysis".
  Update both to the implemented, adopted contract and the rebaselined figures.
- `runs/tutorial-2026-10-11/README.md` — the **headline table** (`:33-38`) and its "looks flat-to-down for
  web search" framing (`:30-31`) change most: overall becomes opus 66 / opus-search 74 / haiku 47 /
  haiku-search 52, with tradition cells moving (opus-search Judaism 3 %→24 %, Sunni Islam 97 %→100 %;
  haiku-search Sunni Islam 36 %→73 %). The contains-exact table (`:44-110`) and "scored 0 yet contains it"
  caveat now describe a **scored** signal. **Do NOT change the "8 of 34" / "24 of 33" contains counts** —
  those are *containment* totals (opus-search Judaism contains = 1 pre-existing headline + 7 flips = 8),
  correct as written; the earlier "8→7" idea conflated flips with containment and is dropped.
- `runs/first-run-2026-10-11/README.md` — fix the stale `24%`→`25%` **and** the factually wrong "17 answers
  reproduce the verse but add a citation prefix … a relaxed quote-contained metric is a Spec-2 refinement":
  only **1** of the ~17 (≥0.9) / ~23 (≥0.8) high-F1 misses is actually contained; the rest are genuine
  paraphrase differences ("prince"→"captain", etc.). Correct number and cause — good PR-gate evidence that
  containment is not over-rescuing.
- `codev/resources/lessons-learned.md` (`:28-41`) + `codev/resources/lessons-critical.md` /
  `codev/resources/arch-critical.md` scoring lines — these currently say "report the contains-exact numbers
  in the run README; **don't reshape the headline contract** to chase them" and mark the `contains_reference`
  submetric "**deferred** because [it] reshapes `scores.jsonl`". Both are **directly contradicted** by this
  PR. Update them **in this PR, consistent with the PR-gate decision**: under adoption, rewrite to "implemented
  as `contains_reference`, adopted into the headline via a deliberate one-shot rebaseline"; also add the
  "never re-run score over committed evidence" **sanctioned-exception** caveat (in-place re-score that *adds*
  a column, panel/usage preserved verbatim). The whole doc + contract + artifact set moves **together** —
  all-adopted or (if the human reverts at the gate) all-reverted — so the merged tree is never
  self-contradictory. (No deferral to a post-PR MAINTAIN run; a merged commit must be internally consistent.)
- *(score.py module docstring is updated in Phase 1, same file as the code change.)*

#### Deliverables

- [ ] `CODE_WALKTHROUGH.md` §5, the `_SUBMETRICS`/accumulator note, the never-re-score bullet, and **all `score.py:N` pointers** updated and consistent with `score.py` + the rebaselined evidence.
- [ ] `TUTORIAL.md` reflects the adopted contract and rebaselined figures (no "misleading headline" framing).
- [ ] Both run READMEs reflect the new contract, correct figures (tutorial Talmud = 7; first-run +1), and (first-run) the corrected cause.
- [ ] `lessons-learned.md:28-41` + `lessons-critical.md` + `arch-critical.md` scoring lines updated **in this PR**, consistent with the PR-gate decision (the "don't reshape the headline contract" / "deferred" language is rewritten under adoption, or the whole set reverts together) + the re-score-in-place sanctioned-exception caveat — no post-PR MAINTAIN deferral.
- [ ] `test_code_walkthrough.py` still green (its `_SUBMETRICS = {` / line anchors still resolve).

#### Acceptance Criteria

- [ ] `.codev/checks/test.sh` green (notably `test_code_walkthrough.py`).
- [ ] A reader of any touched doc gets the current contract, not the pre-change finding or a contradicted rule.

#### Test Plan

- **Regression**: `test_code_walkthrough.py` passes.
- **Manual**: read all four docs for contradictions with `score.py` and the rebaselined summaries.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Viewer vitest guards break on `main` while the builder's gate stays green (dispatcher runs `runs/` as pipelines lane only) | High if unaddressed | High | Phase 1 edits `apps/viewer/` in the same commit (forces vitest to run) and updates every fixture pinning changed numbers; run the full viewer suite, not just the enumerated five. |
| first-run summary cannot be regenerated via the CLI (no `panel_fingerprint`); keyless score nulls panel | High | High | Explicit procedure: `score_file()` with panel verbatim from committed `summary.json` + roster from committed `questions.jsonl`; never `--config`, never re-collect. |
| Rebaselining first-run via YAML stamps `[no-tools]` → standings-key collision with tutorial `haiku` + stale `FIRST_RUN_KEY` | Medium | High | Procedure forbids YAML panel rebuild; a guard asserts the standings keys / `FIRST_RUN_KEY` are unchanged. |
| Byte-for-byte guards are circular after rebaseline → no witness that only the 21 cells moved | High | High | Mandatory pinned validation test (exact flip set / per-cell values). |
| Adding `contains_reference` to `test_score.py:231` (identify_version) violates the spec | Medium | High | Plan explicitly scopes the change to the retrieve_quote dict only; a unit case asserts the four other dicts unchanged. |
| `_SUBMETRICS` add without accumulator seed → `KeyError` | Medium | Medium | Deliverable updates `_SUBMETRICS` + accumulator together; run guards + units catch it. |
| Merge race with `aspir-11` (now overlaps viewer test files too, not just score.py/cli.py/guards) | Medium | Medium | Flag the viewer test files to the architect for coordination; narrow additive diff; second merger rebases. |
| `aspir-11` changes the emitted **panel shape** (`panel.model`→raw id, adds `panel.tools`, drops `api_model`) and migrates **tutorial** `summary.json` to it (not first-run) | Medium | Medium | Scores.jsonl + the `contains_reference`/accuracy deltas are panel-shape-independent, so the contract/validation stand. The tutorial `summary.json` **panel block** is merge-order-dependent: if `aspir-11` lands first, rebase my tutorial rebaseline onto its `score.py` so `score_file` emits the new shape (and update viewer standings fixtures to key on `panel.tools`); if I land first, `aspir-11` rebases onto my `contains_reference`. **first-run is untouched by `aspir-11`** — its panel stays the verbatim committed copy (architect-confirmed), so my first-run `api_model` pre-registration holds regardless of order. |
| Human reverts headline to diagnostic-only at PR | Low | Medium | Pre-analysed bounded second rebaseline (accuracy returns, `contains_reference` stays a column); documented in review. |

## Documentation Updates

- `CODE_WALKTHROUGH.md` (§5, `_SUBMETRICS`/accumulator note, the `:300-308` never-re-score/"add evidence not perturb" bullets, all `score.py:N` pointers) — Phase 2.
- `TUTORIAL.md` (`:29`, `:94-103`) — Phase 2.
- `runs/tutorial-2026-10-11/README.md` (headline table `:33-38` + framing, contains-exact table), `runs/first-run-2026-10-11/README.md` (stale 24%, "17 answers" cause) — Phase 2.
- `pipelines/sacredbench/score.py` module docstring — Phase 1 (same file as code).
- Spec 15 review records the pre-registered deltas, the rebaseline script, the judge-pilot deferral, and the headline-contract decision routed to the PR gate.
- `codev/resources/lessons-learned.md` (`:28-41`), `lessons-critical.md`, `arch-critical.md` scoring lines — Phase 2, updated **in this PR** to match the PR-gate decision (whole set moves together; no post-PR MAINTAIN deferral).
