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
