# Review: Original-language-only question set (Spec 26)

## Summary

Reshaped the sacredbench question generator to **original-language editions only** (a text is
in the pool iff `language == canonical_language`), **four working-group templates**
(`retrieve_quote` / `complete_unit` / `cite_passage` / `verify_source`) at a **per-text quota**
(default 28), added two catalogue metadata fields (`requested_as`, `canonical_language`), retired
two tasks (`identify_version` / `identify_source`), closed the #23 PAPER GATE by hardening
`verify_source` to leading-stance Yes/No, added a per-text summary, updated the viewer and docs,
and committed a fresh live run (`runs/original-2026-10-21/`). Six plan phases, one PR. Net: the
benchmark now measures original-language scriptural recall across 17 texts × 476 questions, with a
committed three-model reference run.

## Spec Compliance

- [x] **AC1 — catalogue metadata.** Every `source.yaml` target carries `requested_as` (≥1) and
  `canonical_language`; loader fail-fasts naming file + target index; the two `KJV (LDS 2013
  edition)` targets removed (21 targets). (Phase 1)
- [x] **AC2 — original-language selection + per-text split.** `generate` defaults select the 17
  in-pool non-restricted texts and emit 28/text split 7-per-template (476 questions); deterministic
  remainder allocation; no `--include-translations`; excluded texts recorded in the manifest with a
  reason. (Phase 2)
- [x] **AC3 — `<edition>` from `requested_as`, no duplicated edition name.** Prompts render a seeded
  `requested_as` choice (recorded in `question.source.requested_as`), never the raw `version`;
  `cite_passage` shows the citation form by example; `_display_citation` strips the work prefix so
  the 9 hadith collections / D&C render the edition once. (Phase 2)
- [x] **AC4 — retired tasks absent.** `identify_version` / `identify_source` gone from `TASKS`,
  `_build`, `score.py`, the viewer, and the docs. (Phases 3–5)
- [x] **AC5 — leading-stance `parse_yes_no`; #23 closed.** All four adversarial cases classify
  correctly (negation-evasion → refused; `"No, that is from Sahih Muslim"` → no; `"Yes."` → yes;
  stanceless decline → refused). (Phase 3)
- [x] **AC6 — `verify_source` negatives.** False premise = a real passage from a different in-scope
  text (truth "no"), hadith collections grouped as one family, same-language preferred with
  cross-language fallback recorded, containment exclusion kept, deterministic negative share
  (0.5). (Phase 2)
- [x] **AC7 — manifest.** Records `per_text`, `selected_texts`, and `excluded_texts` with reasons;
  digest machinery unchanged. (Phase 2)
- [x] **AC8 — per-text summary.** `summary.md`/`summary.json` carry a per-text table (model → text:
  n, accuracy, coverage, refused) on the Spec 15 outcome contract. (Phase 3)
- [x] **AC9 — committed run; scores re-derive bit-for-bit.** `runs/original-2026-10-21/` committed
  with a README; re-scoring the committed answers reproduces `scores.jsonl` byte-for-byte (pinned by
  `test_original_run_regression.py`). (Phase 6)
- [x] **AC10 — suites + audit green.** Pipelines 364 passed, viewer 158 passed, copyright audit
  origin-clean. (Phases 1–6)

## Deviations from Plan

- **Phase 6 panel (sanctioned).** The plan specified an Anthropic `haiku`+`opus` × search-on/off
  panel (≈1,904 cells) and instructed *"if `ANTHROPIC_API_KEY` is absent, stop and do not substitute
  OpenRouter."* The key was absent. The builder blocked, reported to the architect, and **Waleed
  explicitly directed** (2026-10-21) a switch to **OpenRouter** with three models
  (`anthropic/claude-haiku-5-5`, `anthropic/claude-opus-5-5`, `openai/gpt-oss-20b`), **search-off
  only** (web_search is Anthropic-only; `config.py` fail-fasts it on a non-anthropic provider), under
  a hard **≤$40** budget gate (smoke → extrapolate → proceed). This is a human-authorized deviation,
  not a silent substitution; the loss of the search-on/off contrast is documented in the run README.
- **Phase 1 / Phase 5 force-advance.** Both reached the iteration-3 safety ceiling with claude
  APPROVE but codex still REQUEST_CHANGES on stale-doc nits; porch force-advanced with the last
  rebuttal as disposition. The outstanding codex points were doc-pointer tidies, addressed in the
  rebuttals and re-verified.
- **Metadata channel (within Phase 1).** The planned `(work, version, language)`-keyed metadata
  could not resolve encyclicals (the converter re-stamps `work`), so it became a **path-based**
  `metadata_for_standardized_path` mirroring the license gate — a plan refinement folded into the
  spec/plan mid-phase, not a scope change.

## Consultation Feedback

Per-phase, 2-way (`codex` + `claude`; gemini excluded — it cannot see the worktree, per
`.codev/config.json`). Full point-by-point dispositions live in the committed
`codev/projects/26-*/26-phase_N-iterM-rebuttals.md` files.

### Specify Phase (Round 1)
#### Codex / Claude — both REQUEST_CHANGES
- 19 points, 0 baked-decision objections. → **Addressed**: all folded into the spec (corpus census
  17 texts/476 questions, path-based metadata channel described, `--include-translations` dropped as
  YAGNI, exclusions recorded in manifest).

### Plan Phase (Round 1)
#### Codex / Claude — both REQUEST_CHANGES
- → **Addressed**: plan re-scoped to match the final #26 field table and the path-based metadata
  channel; PR #24 (Spec 15) dependency noted and later merged before Phase 1.

### Phase 1 — Catalogue metadata (Rounds 1–3)
#### Codex — REQUEST_CHANGES → COMMENT → REQUEST_CHANGES (force-advanced); Claude — …→ APPROVE
- Encyclical metadata resolution → **Addressed** (path-based channel + cross-source conflict
  detection). Remaining codex points were stale-doc/test tidies → **Addressed** in the iter-2/3
  rebuttals; claude APPROVE at iter-3.

### Phase 2 — Generation (Rounds 1–3)
#### Codex — REQUEST_CHANGES → REQUEST_CHANGES → APPROVE; Claude — REQUEST_CHANGES → APPROVE
- `excluded_texts` listed 201 encyclical docs → **Addressed** (aggregate by `target_key`).
- `cite_passage` quota `quota+1` edge → **Addressed** (`max(quota, 2)`).
- Generation perf (113s) → **Addressed** (precompute entry norms → 20s).
- `verify_source` negative family/same-language model, byte-exact prompt tests, containment
  structural tests → **Addressed** (codex test-strength requests folded in).

### Phase 3 — Scoring / #23 (Rounds 1–2)
#### Codex / Claude — REQUEST_CHANGES → both APPROVE
- Divergent refusal definitions (codex: "there is no way…Yes" → refused; claude: committed verdict
  with trailing decline → graded) → **Addressed** by `refused ⟺ parsed is None`, which satisfies
  both. Label-strip (`Answer:`/`Verdict:`/`Response:`) and an unambiguous NUL-joined `by_text` key
  also folded in.

### Phase 4 — Viewer (Round 1)
#### Codex — APPROVE; Claude — COMMENT
- Retire `identify_version`/`identify_source` from the viewer. → **Addressed**; claude COMMENT
  (test-coverage suggestion) folded into the four-task test.

### Phase 5 — Docs (Rounds 1–3)
#### Codex — REQUEST_CHANGES ×3 (force-advanced); Claude — …→ APPROVE
- Cold-tier `arch.md` "#23 deferred" contradicted arch-critical → **Addressed**.
- ~22 drifted `CODE_WALKTHROUGH` `file:line` pointers → **Addressed** (recomputed + verified each
  lands on its symbol). KJV "original-language" framing → **Addressed**. Remaining codex nits were
  doc-wording → **Rebutted/Addressed** in iter-3; claude APPROVE.

### Phase 6 — Live run (Rounds 1–2)
#### Codex / Claude — REQUEST_CHANGES → both APPROVE
- Generation-invariance anchor promised in Phase 2 did not exist, and a docstring claimed it did →
  **Addressed** (`test_original_run_regression.py`: re-score + digest-pin `ca5b5d5372f81603`).
- False headline claims (KJV 100% "all three models"; opus "93–100%") → **Addressed** (KJV 100% for
  the two frontier models, gpt-oss-20b 16%; opus 86–100%).
- TUTORIAL four-contestant framing vs the 3-model run; README audit path count → **Addressed**.
- `verify_source` refused = 0/357 → **N/A** (known evidence gap, see Follow-up; unit-tested in
  `test_score.py`).

## Lessons Learned

### What Went Well
- `refused ⟺ parsed is None` resolved two reviewers' *opposed* refusal definitions with one rule —
  a sign the underlying contract was the real fix, not a compromise.
- The budgeted live smoke (per lessons-critical) caught `gpt-oss-20b`'s empty-response behaviour
  before the full panel, and the credit-delta method gave a real dollar gate without per-token prices.
- Re-score and regeneration are both byte-for-byte deterministic; the new regression guard pins both.

### Challenges Encountered
- **Encyclical metadata** couldn't key on `(work, version, language)` (converter re-stamps `work`);
  resolved by a path-based channel mirroring the license gate.
- **`gpt-oss-20b` empty responses**: ~28 cells empty on the first pass, all but one recovered on
  retry; one Talmud-Aramaic `cite_passage` cell stayed empty across ~15 attempts and is a documented
  missing cell (not a refusal). Coverage 1427/1428.
- **Cost extrapolation was ~2× low** ($6.4 smoke projection vs $12.9 actual) — `gpt-oss-20b`'s long
  reasoning output plus retry passes break a linear per-cell estimate.

### What Would Be Done Differently
- Budget a reasoning-heavy open model with headroom over a linear smoke extrapolation, and cap its
  retries explicitly rather than re-running `collect` repeatedly.

### Methodology Improvements
- The per-phase 2-way consult surfaced real defects every phase (the false headline claims and the
  missing regression anchor in Phase 6 especially); the force-advance ceiling worked as intended but
  left codex doc-nits that a 4th iteration would have closed.

## Architecture Updates

- **No further hot-tier change needed.** `codev/resources/arch-critical.md` was updated in Phase 5
  (original-language default, four templates / 28-per-text, Spec 15 scoring + `verify_source`
  leading-stance hardening, #23 closed) and remains accurate. The OpenRouter search-off run is
  run-specific evidence (documented in the run README), not a system-shape fact.

## Lessons Learned Updates

- Routed: **cold** (`lessons-learned.md`, Live runs & providers) — `gpt-oss-20b` via OpenRouter emits
  persistent empty responses on some cells; treat as *missing* (pending, not refused); `collect` is
  resumable; a smoke cost-extrapolation is ~2× low for reasoning-heavy models + retries, so gate with
  headroom and measure against the credit balance.
- No hot-tier (`lessons-critical.md`) change — the cap is respected; this is provider-operational
  detail, not a cross-cutting behavior change.

## Flaky Tests

No flaky tests encountered.

## Follow-up Items

- **`verify_source` live refusal path unexercised.** 0/357 cells triggered the #23 leading-stance
  refusal (negation-evasion); the path is unit-tested (`test_score.py`) but no live answer hit it.
  A future run with a more evasive model (or a crafted prompt) would exercise it end-to-end.
- **Arabic-Indic digit citation scoring** (carried from the spec risk table): verify whether
  `cite_passage` citations with Arabic-Indic digits score correctly across the Arabic corpus.
- **Search-on/off contrast** is absent from the committed run (OpenRouter, search-off). If an
  `ANTHROPIC_API_KEY` becomes available, a follow-up run can restore the tool-use arms.
