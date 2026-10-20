# Spec 26 — Rebuttal to iter-1 plan review (codex + claude, both REQUEST_CHANGES)

Both reviews were high-signal and several findings were verified against the test suite (claude) or the
flag semantics (codex). **All are accepted** — they were real gaps or genuine errors in the plan. The
plan was revised in `[Spec 26] Plan + spec: final #26 field table + merged Spec 15 + plan-review fixes`.

**Context that post-dates the reviews:** while the reviews ran, the architect (1) posted the **final**
#26 metadata field table and (2) confirmed **PR #24 (Spec 15) merged** (`origin/main` @ 1324755).
I merged `origin/main` and rewrote the metadata parts of the plan/spec to the final schema. So some
review points about the *old* metadata (3 fields, `ask_as`, `citation_hint`) are now moot in their
specifics but their *structural* lessons (the channel, validation) were kept. The final schema:
two fields — `requested_as: [names]` (seeded uniform choice → `question.source.requested_as`) and
`canonical_language: str` (inclusion = `language == canonical_language`); `citation_hint` dropped
(template 3 shows the citation form by example from a different seeded entry); per-text default **28**
(7/template); remove the two `KJV (LDS 2013)` targets (21 targets); starting values on #27.

## claude — blocking

### C1 — Pointer-guard breakage leaves the suite red across phases (verified) — ACCEPTED
`test_code_walkthrough.py` pointer-guards `def _balanced_sample(`, `TASKS = (`, `_SUBMETRICS = {`;
deleting/changing them in Phase 2–3 while the doc fix was Phase 5 would leave the suite red across
Phases 2–4, breaking per-phase independence. **Change:** the pointer-guard-coupled doc edits now ride
**in the same commit** that changes the symbol — `_balanced_sample`/`TASKS` in Phase 2,
`_SUBMETRICS` in Phase 3. Phase 5 is prose/recipe polish only. The Executive Summary states this rule.

### C2 — `test_first_run_regression.py` breakage + lost generation-invariance (verified) — ACCEPTED
The guard calls `run_generate(docs, per_task=…, quotas=…)`; removing those params `TypeError`s, and the
100-question `retrieve_quote`-only first-run set is not expressible under `--per-text`. **Change:** a
**named decision** in Phase 2's file list — **keep the re-score half** (score committed answers →
committed scores, byte-for-byte; unaffected), **retire the generation-invariance half** (regenerate →
same digest) with rationale (the generator interface changed by design), and re-establish a
generation-invariance anchor on the fresh Phase-6 run (digest-pinned there). The test is now in Phase 2's
file list.

### C3 — Metadata channel can't deliver a name to the renderer (verified) — ACCEPTED (this was the
most important fix)
`license` reaches generation only as a path *filter*; `load_documents()` discards the path→doc link and
`_build` sees only a `Document`. A path-keyed `license`-style channel structurally cannot feed
`requested_as` to the prompt renderer. **Change:** Phase 1 now delivers a fail-closed
`text_metadata(sources) -> dict[(work, version, language), TextMeta]`, keyed on the tuple converters
stamp onto `doc.work/version/language` and that Phase 2 groups texts on; passed into `generate()`; a doc
whose tuple is absent raises `CatalogueError`. This also fixed codex's `_TARGET_STR_FIELDS` error (the
new string field must be *added* to that tuple; the list field needs its own validator).

### C4 — `verify_source` identity uncovered (both reviewers) — ACCEPTED
Current code records the *passage's* source, has only `true_work`, interpolates a raw `neg_work`, and
selects negatives at `work` granularity — the opposite of the spec, and it would make Phase 3's
`by_text` mis-attribute every negative. **Change:** Phase 2 now explicitly flips this — `source` =
asked edition, prompt uses the asked text's seeded `requested_as` name, `expected` gains `true_version`,
negatives selected at `(work, version, language)` granularity; deliverables + tests added; Phase 3's
`by_text` key is a stable `(work, version, language)`-derived string so negatives aggregate under
`question.source`.

### C5 — "cross-work/cross-family" mitigation is a no-op (verified) — ACCEPTED
The nine hadith collections are nine distinct `work` values, so cross-*work* pairing already happens and
is exactly what produces variant-narration false "no"s. **Change:** Phase 2 defines a **family exclusion
by `document_type`** (never pair two hadith collections), with fail-fast on an insufficient cross-family
pool. Risk row + spec updated; cross-work wording removed.

## claude — smaller points (all accepted)

- **`--tasks` split denominator** → `N // len(active)` (not `N // 4`), remainder over active in canonical
  order; tested for 1/2/4-task subsets. (Also codex.)
- **TUTORIAL reproduce-run claim** → Phase 5 repoints the `--per-task 100 … reproduces tutorial-2026-10-11`
  command + digest claim to the fresh Phase-6 run (keeps `tutorial-2026-10-11` as a historical artifact).
- **Phase 6 budget** → now 14 × 28 = 392 questions ≈ 1,568 live cells; Phase 6 runs a **cheap smoke
  first** and posts the estimate for **explicit architect sign-off before the full panel**.
- **Phase 6 viewer-table acceptance was vacuous** → reworded to "per-text table present in
  `summary.md`/`summary.json`"; Phase 4 viewer scope is retirement only (it does not render `by_text`;
  `localResults.ts` ignores unknown keys). Noted explicitly in Phase 4.
- **`--per-text` 15–30 validation** → not a hard Typer clamp (that would break the Phase-6 smoke); a
  `--per-text >= len(active)` fail-fast floor, with 15–30 documented as the recommended range. (Also
  codex.)
- **Arabic-Indic digit go/no-go** → kept as a Phase-3 evaluation + Phase-6 verification; `\d` matches
  `٧` but NFKD doesn't fold it and `_NUM_CITE`'s `[A-Za-z]` prefix fails on Arabic — the by-example
  exemplar (final schema) is the steer, digit-folding the alternative.

## codex — blocking (all accepted; overlap noted)

- **verify_source negatives / source metadata** = C4. ✓
- **`--tasks` quota denominator** = claude's smaller point. ✓
- **15–30 range validation** = claude's. Resolved as a `len(active)` floor + documented range (not a
  hard clamp), to keep the smoke and single-task runs viable. ✓
- **`_TARGET_STR_FIELDS` doesn't cover the new string fields** — correct and now explicit in Phase 1
  (add `canonical_language` to `_TARGET_STR_FIELDS`; `requested_as` gets a list validator). ✓
- **Stable `by_text` key + collision + negative-aggregation tests** — Phase 3 now defines a stable
  `(work, version, language)`-derived key with a collision test and a negative-aggregates-under-asked
  test. ✓
- **Flag interaction matrix** (TLG needs `--include-restricted`; NABRE needs **both**) — Phase 2 states
  the predicate `(included_by_language OR include_translations) AND (not restricted OR
  include_restricted)` with a 4-combination matrix test. ✓

## Net
All plan-review points accepted; no disagreements. The two largest structural fixes — the
`(work, version, language)`-keyed `text_metadata` channel (C3) and the pointer-guard/doc-coupling
restructure (C1) — materially de-risk implementation. The field-schema finalization and Spec 15 merge
that landed mid-review were folded in, removing the earlier pending/fallback language entirely.
