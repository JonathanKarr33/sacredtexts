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
