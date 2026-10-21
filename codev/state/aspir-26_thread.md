# aspir-26 thread — Spec 26: original-language-only question set

## Specify phase (started 2026-10-20)

Strict ASPIR builder. Issue #26 is highly prescriptive (reads like baked decisions):
reshape the question set to original-language-only, 15–30 q/text (default 20), exactly
four templates, add `original_language`/`ask_as`/`citation_hint` to source.yaml. Folds #23
(leading-stance yes/no parsing) and retires `identify_version`/`identify_source`.

### Key findings so far
- **PR #24 (Spec 15) is OPEN, not merged.** #26's scoring containment headline (templates
  1–2) depends on it, and #23's hardening natural-home is #15's evaluator framework.
  Issue explicitly says: build on `main`, merge `origin/main` when #24 lands; conflicts
  expected in TUTORIAL.md / CODE_WALKTHROUGH.md / score.py docstrings. → Settled, not a
  contradiction. Flag as dependency/risk in spec.
- **Target enumeration** (from texts/raw/*/source.yaml) confirms issue math:
  - Original-language + non-restricted (default selection) = **14 texts**: Qur'an Uthmani
    + 9 hadith (Sunni, all Arabic) + Talmud Bavli Aramaic (he) + Book of Mormon + D&C +
    Pearl of Great Price (LDS 2013, English-composed).
  - original_language:true but restricted → TLG Greek (grc), local-only via
    --include-restricted.
  - Translations (original_language:false): Talmud English, KJV/ASV/WEB, Papal Encyclicals
    (Vatican English — composed in Latin), NABRE (restricted), KJV LDS editions.
  - 14 × 20 = 280 questions × 4 panel cells. Matches issue.

### Next
- Explorer agent gathering catalogue.py/generate.py/score.py/tests/docs facts.
- Then draft spec, signal SPEC_DRAFTED (porch runs 3-way consult).

### Spec drafted + committed (iter 1)
- Wrote spec `codev/specs/26-original-language-only-questio.md`. Baked decisions (Waleed's 3
  + four verbatim templates + 3 metadata fields + retire identify_version/identify_source +
  fold #23) encoded in Constraints. Recommended per-text even-split with fail-fast (Approach 1).
- Committed `[Spec 26] Initial specification draft` (no Co-Authored-By; Waleed CLAUDE.md
  overrides the attribution reminder).
- `porch done 26` → checks green → porch handed 2-way consult (codex + claude; gemini excluded,
  can't see worktree). Both running in background. Await completion → incorporate → porch next.

### Spec review complete → advanced to PLAN
- codex + claude both REQUEST_CHANGES (19 points total, 0 baked-decision objections). All
  accepted — clarifications/defect fixes. Key: (B1) retrieve_quote duplicated edition name for
  10/14 texts (hadith/D&C citations are work-prefixed) → display_citation strip rule; (B2)
  refused/coverage depend on unmerged PR #24 → split responsibility + degraded fallback; plus
  per-text split determinism, metadata-via-license-channel, model-keyed per-text summary,
  cite_passage Arabic digit gap, template-4 variant-hadith negatives.
- Rebuttal written + committed. `porch done 26` → ADVANCED TO plan.
- **Open cross-project item for architect:** PR #24 (Spec 15) sequencing. Expected: #24 merges
  before Spec 26 scoring; builder merges origin/main + integrates. Degraded fallback documented
  if it doesn't. Flagging to architect.

### Architect decision on #24 (2026-10-20) + PLAN drafted
- Architect main: PR #24 fully reviewed, at human pr gate, merges before scoring. DROP the
  degraded fallback (project rule: fail fast, never implement fallbacks). If #24 not merged at
  scoring phase → STOP + ping; no parsed:null path. Plan on Spec 15 contract as base.
- Amended spec + plan to match (removed degraded mode; Phase 3 builds on Spec 15 contract;
  stop-and-ping hard dependency). Committed both.
- Plan = 6 phases: (1) catalogue metadata, (2) generation reshape, (3) scoring/#23 on Spec 15,
  (4) viewer retirement, (5) docs, (6) committed live run. `porch done` → checks green → plan
  2-way consult (codex+claude) running in background. Await → rebuttal → advance to implement.

### PLAN consult + architect finalization + merge (2026-10-20)
- Plan 2-way consult: codex + claude both REQUEST_CHANGES, all accepted. claude's deepest
  (verified vs test suite): pointer-guard red across phases → coupled doc edits ride with the
  code commit; first-run-regression signature break → keep re-score, retire gen-invariance;
  metadata channel can't feed a name → (work,version,language)-keyed text_metadata map;
  verify_source identity flip; family-exclusion negatives (cross-work is a no-op for 9 hadith).
  codex: _TARGET_STR_FIELDS error, flag matrix, --tasks denominator, by_text key, range.
- MID-REVIEW: architect posted FINAL #26 field table + confirmed PR #24 MERGED (@1324755).
  Merged origin/main (clean — brought graders.py/outcomes.py/score.py outcome layer +
  rebaseline oracle). Rewrote plan+spec to final schema: 2 fields (requested_as:[names],
  canonical_language), equality inclusion, citation_hint DROPPED → template 3 by-example,
  default 28 (7/template, 392 questions), seeded requested_as recorded in source, remove 2 LDS
  KJV targets (21 total), starting values from #27.
- Rebuttal written. Next: porch done → advance to IMPLEMENT. Phase 1 = catalogue metadata
  (requested_as/canonical_language + text_metadata map); build on merged main.

### IMPLEMENT Phase 1 COMPLETE (catalogue metadata) — 2026-10-20
- Architect decision: #27 verbatim → English Bibles IN (canonical=en), 9 hadith, encyclicals
  out, drop 2 LDS-KJV targets. Pool = 17 texts, 476 questions, ~1904 cells. Spec/plan census +
  counts + budget updated (separate commit).
- catalogue.py: requested_as + canonical_language (required, validated); Target.text_key;
  TextMeta + text_metadata((w,v,l)->TextMeta) fail-closed map (the real channel — license is a
  path filter, can't feed a name to the renderer); slug-agreement extended; docstring/example.
- 6 source.yaml updated with #27 values; 2 LDS-KJV targets removed (21 targets; pool=17 verified
  via a real-corpus test).
- Tests: catalogue 40 green incl. new validation/text_metadata/slug-agreement/pool=17; fixed
  test_schema_convert _target helper; removed obsolete real-LDS-KJV export test (merge/roundtrip
  still covered synthetically). Full pipeline suite 335 passed; gate green.
- Commit 519f387 (amended to drop an accidental Co-Authored-By trailer — Waleed CLAUDE.md forbids).
- FOLLOW-UP for architect: the two LDS-KJV payload JSONs (old/new-testament-reference-KJV-
  ben-crowder.json) are still committed but now orphaned (no target). Left in place; asked whether
  to delete.
- Next: Phase 2 (generation reshape). Will run /compact-style context awareness; porch next.

### Phase 1 per-phase consult + re-iter (2026-10-20)
- codex + claude both REQUEST_CHANGES, converged: (1) (w,v,l)-keyed metadata channel can't
  resolve encyclicals (convert_encyclicals re-stamps work=title) — breaks even DEFAULT run
  (equality rule reads canonical_language before excluding); (2) text_metadata() silent
  last-wins cross-source. claude: first-run gen-invariance test already broken by Phase-1
  LDS-KJV removal; Talmud en/he identical requested_as; slug msg names all 3 fields.
- FIX: metadata_for_standardized_path (path-based, mirrors license; handles re-stamp);
  text_metadata() now conflict-detecting view; slug msg narrowed. Tests added. 336 passed.
- ARCHITECT decision: DROP --include-translations entirely (YAGNI). Selection =
  language==canonical_language (+ --include-restricted gate); excluded → manifest w/ reason.
  Moots encyclicals-201-texts + Talmud en/he. Spec/plan updated (flag removed; manifest
  excluded-with-reason; path-based channel; first-run retirement rationale corrected).
- Rebuttal written. porch done re-iter next.

### Phase 1 COMPLETE (3 iterations) — porch → context refresh, then Phase 2
- iter1: both REQUEST_CHANGES → path-based metadata channel (metadata_for_standardized_path,
  handles encyclicals re-stamp) + text_metadata conflict detection. Architect dropped
  --include-translations (YAGNI) → selection = language==canonical_language only; excluded
  reported in manifest w/ reason.
- iter2: codex COMMENT / claude REQUEST_CHANGES → stale docs + test strength: catalogue
  docstring → path channel; pool test pins exact 17-member SET; requested_as stripped on store.
- iter3: codex REQUEST_CHANGES (stale spec/plan channel text) / claude APPROVE → fixed spec
  Desired State + Test Scenario + plan Exec Summary to path-based; corrected first-run test
  retirement rationale (symptom = digest mismatch on clean rebuild, not fail-close).
- STATE: catalogue.py has requested_as+canonical_language (validated), Target.text_key,
  metadata_for_standardized_path (path channel, fail-closed), text_metadata (conflict view),
  slug-agreement names differing fields. 21 targets, pool=17 (Qur'an+9hadith+TalmudAramaic+
  3LDS+3EnglishBibles). 476 questions planned. Full suite 336 passed.
- CARRY to Phase 2: generate must (a) select by language==canonical_language (+ --include-restricted
  gate, NO --include-translations), (b) resolve metadata per doc via metadata_for_standardized_path,
  (c) call text_metadata(sources) once so the conflict guard is live, (d) group by (work,version,
  language), (e) manifest records excluded targets + reason, (f) default --per-text 28 (7/template),
  (g) verify_source identity flip (source=asked, true_version, requested_as name, text-granularity
  negatives + document_type family exclusion), (h) display_citation (strip work prefix), (i)
  cite_passage by-example exemplar from a different seeded entry (needs >=2 entries), (j) retire
  identify_version/identify_source from TASKS/_build + CODE_WALKTHROUGH pointer-guard in-commit, (k)
  first-run regression: keep re-score, retire generation-invariance half.

### IMPLEMENT Phase 2 built (generation reshape) — 2026-10-21
- generate.py rewritten: TASKS=4 (retrieve_quote/complete_unit/cite_passage/verify_source);
  deleted _balanced_sample + per-task quota; identify_version/identify_source gone from
  TASKS/_build. New generate(docs, text_meta, per_text=28, ...) -> (questions, excluded).
  Per-text split over active tasks (N//len + remainder, canonical order); fail-fast if
  per_text<len(active). Selection = language==canonical_language; excluded recorded.
  <edition> = seeded rng.choice(requested_as), recorded in source.requested_as.
  display_citation strips leading work prefix (hadith/D&C). cite_passage shows by-example
  exemplar from a different seeded entry (fail-fast <2 entries). verify_source identity flip:
  source=asked edition, expected.true_work/true_version=passage's real source, negatives
  cross-family (document_type) only + exclude contained passages, fail-fast on empty pool.
  Manifest: per_text, selected_texts, excluded_texts (no per_task/quotas).
- cli.py generate: --per-text (default 28), dropped --per-task/--quota, NO --include-translations;
  resolves metadata per-path (metadata_for_standardized_path) keyed by (w,v,l); calls
  text_metadata(sources) for conflict guard; passes excluded to build_manifest.
- CODE_WALKTHROUGH: pointer-guard symbol _balanced_sample→_build_texts; fixed prose naming
  deleted _balanced_sample/_build/tradition-balancing (symbol-coupled). Recipe-A field docs
  deferred to Phase 5.
- test_first_run_regression: retired generation-invariance half (can't hold: corpus+generator
  changed → digest mismatch); kept re-score half.
- test_generate.py rewritten (26 tests); test_catalogue CLI gen test → --per-text; removed
  --quota test. Full suite 340 passed.
- CARRY to Phase 3: score.py still has dead identify_version/identify_source branches +
  _SUBMETRICS entries — retire there (update _SUBMETRICS pointer-guard in that commit).
  by_text summary aggregates on source (now has work/version/language + requested_as).
  Source gained requested_as field (additive; viewer/score read specific keys, harmless).

### Phase 2 per-phase consult iter1 + re-iter (2026-10-21)
- codex + claude both REQUEST_CHANGES (core confirmed correct: 476q, byte-exact prompts,
  display_citation, identity flip). Fixes: cite_passage max(quota,2); excluded_texts
  aggregate to catalogue TARGET (TextMeta.target_key) so 201 encyclicals→1; containment over
  ALL entries; fixed always-true containment test; perf precompute (entry_norms/all_norm).
- ARCHITECT verify_source family decision: family=hadith_collection else work; prefer
  same-language cross-family negative, cross-language fallback recorded in manifest
  (verify_source_cross_language_negatives); expected gains true_language. Residual→Phase6 README.
- Spec/plan updated to the family/same-language model + target-aggregated exclusions + chosen-name
  requested_as. Full suite 344 passed. Rebuttal written.

### Phase 2 iter2 (codex REQUEST_CHANGES test-strength / claude APPROVE)
- Fixes: module docstring family rule (was document_type → work-based); verify_source
  source.citation="" + expected.true_citation (negative's foreign citation was incoherent under
  asked work); cite_passage boundary tests (exact-quota success @2 entries, single-entry fail);
  byte-exact prompt test for all 4 templates; structural containment test (all-contained →
  fail-fast, deterministic). Full suite 348.
- PHASE 6 README TODO (claude non-blocking): negative candidates are weighted by entry count,
  not uniform over texts — document as a known limitation; also document the near-verbatim
  shared-passage residual and the Talmud-Aramaic cross-language negatives.

### Phase 2 APPROVED (codex + claude iter3) — advancing to Phase 3
- Non-blocking polish deferred: CODE_WALKTHROUGH generate.py line pointers drifted (guard
  permits; fix in Phase 5 doc pass); add a 2-task --tasks subset test (Phase 3/5 polish).
- PHASE 6 README items (accumulated): (1) verify_source source.citation is "" for ALL
  verify_source (pos+neg) — a passage not a citation is shown; (2) negatives weighted by entry
  count not uniform over texts; (3) near-verbatim non-identical shared-passage residual;
  (4) Talmud-Aramaic cross-language negatives (no he partner).

### IMPLEMENT Phase 3 built (scoring) — 2026-10-21
- parse_yes_no → LEADING-STANCE (closes #23): yes/no must be the leading token (after stripping
  wrapping quotes/punct), read from RAW answer before normalize. "There is no way to verify
  this... Yes" → None (not gamed); "No, ..." → no; "Yes." → yes. Design choice: strict leading
  token (not a window-search, which would still match the incidental "no" in "no way") — the
  only interpretation passing the adversarial case. A buried verdict after explanation → None
  (prompt says "Answer Yes or No", expects a leading verdict).
- Retired identify_version/identify_source from score_answer; _SUBMETRICS now {} (annotated);
  updated the _SUBMETRICS pointer-guard entry (test_code_walkthrough) + outcomes.py comment +
  module docstring (removed #23 PAPER-GATE SCOPE note, verify_source rule now "closes #23").
- by_text summary: per_text accumulator keyed by (model, "work | version | language", task);
  summary["by_text"][model][text][task] cells + _overall; "### By text" markdown table. A
  verify_source NEGATIVE aggregates under the ASKED edition (source), verified by test.
- Built on merged Spec 15 (graders/outcomes/_with_outcome/coverage). Rebaseline oracle + first-run
  re-score still green. Full suite 356 passed.
- PHASE 5 TODO: arch-critical.md "#23 PAPER GATE" line → "closed by Spec 26" (doc task).

### Phase 3 per-phase consult iter1 (both REQUEST_CHANGES) + re-iter
- codex: parse_yes_no window not implemented + "no way... yes" scored incorrect not refused;
  _text_label " | " ambiguous; markdown should be text/n/accuracy/coverage/refused columns.
- claude: _with_outcome ungated refusal would refuse a COMMITTED verdict ("No, I cannot verify..."
  → refused, wrong); test_outcomes:71 vacuous; leading-token narrower than spec (surface).
- RESOLUTION (satisfies both): verify_source refused ⟺ parsed is None. Committed leading verdict
  graded even with trailing decline; no leading verdict (decline / evasion / non-committal) →
  refused. classify_refusal no longer governs verify_source (docstrings updated).
- ARCHITECT leniency decision: strict leading-token + narrow pre-strip (leading markdown/quotes/
  bullets + bare 'Answer:'/'Verdict:'/'Response:' label). 'Answer: Yes' grades; 'Based on my
  search, yes' + 'There is no way... yes' → None → refused. Added label cases to tests.
- _text_key → (work,version,language) tuple; by_text key = NUL-join (unambiguous) + collision test;
  markdown now per-model text/n/accuracy/coverage/refused table. Full suite 362.
- PHASE 6 TODO (architect): run README parsed-is-None diagnostic — count + 10 sample verify_source
  rows per model (what strict leading-token refuses).

### Phase 3 APPROVED (codex + claude iter2) — advancing to Phase 4
- verify_source refused⟺parsed-None confirmed correct; by_text NUL key + collision test; vacuous
  test replaced. Full suite 362.
- Watch items (non-blocking, deferred):
  (a) Phase-6 parsed-is-None diagnostic should report prose-negation SHAPE FREQUENCIES, not just
      10 samples/model.
  (b) classify_refusal could raise on task=="verify_source" (one-line fail-fast guard) — optional
      hardening; left out to not reopen the approved phase.
  (c) _text_key→None silently drops a row (unreachable today — all questions carry work/version/
      language; untested).
  (d) **HARD PHASE-5-BEFORE-PHASE-6 REQUIREMENT**: update arch-critical.md "#23 PAPER GATE: no
      verify_source number until hardened" → "closed by Spec 26", and the stale CODE_WALKTHROUGH
      _SUBMETRICS / "answer must be a label" prose. Must land before Phase 6 reports a
      verify_source number.

### IMPLEMENT Phase 4 built (viewer retirement) — 2026-10-21
- Removed identify_version/identify_source from apps/viewer: localResults.ts (dropped the
  identify_source expectedText branch; expectedText now text/citation/answer; updated the
  submetric comment); explorer.test.ts + QuestionList.test.tsx fixtures switched from
  identify_version to kept tasks (verify_source / cite_passage). No retired-task refs remain
  (grep clean). Viewer vitest 157 passed; tsc --noEmit clean. (by_text not rendered — scope is
  retirement only, per plan; summary.md/json is the per-text source of truth.)
- Ran pnpm -C apps/viewer install (node_modules gitignored, not committed).
