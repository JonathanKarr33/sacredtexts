# Spec 26 Phase 5 — Rebuttal to iter-3 consult (codex REQUEST_CHANGES / claude APPROVE)

claude **APPROVE** — it re-verified every corrected `file:line` pointer lands on its symbol and the
untouched-file pointers still resolve. codex **REQUEST_CHANGES** on two remaining README corpus
inaccuracies; both fixed in `[Spec 26][Phase: implement] docs: README shard-merge example +
canonical_language English-Bible exception`.

## codex — ACCEPTED
- **README export shard-merge example cited the removed LDS-KJV OT+NT** (Phase 1 deleted those two
  targets). Replaced with the real current multi-shard case — the dozens of per-tractate Talmud Bavli
  Aramaic files merging into one `(work, version, language)` document.
- **README `canonical_language` bullet omitted the English-Bible exception.** It defined
  `canonical_language` strictly as the language of composition and implied all translations are
  excluded, but KJV/ASV/WEB are translations carrying `canonical_language: en` and stay in (working-group
  policy, #27 Q1). Reworded to "the language the benchmark treats as the text's own (usually
  composition)" with the explicit English-Bible exception, mirroring the corrected `TUTORIAL.md`.

## claude — nits, one applied
- **Applied:** `CODE_WALKTHROUGH.md` `test_first_run_regression.py:32` → `:30` (the test def line; the
  file shrank when the generation-invariance half was retired in Phase 2).
- **Left (dispositioned twice):** the `identify_source` mentions in `runs/tutorial-2026-10-11/README.md:82`
  and `lessons-learned.md:38` are historical results/lessons prose, out of scope per the spec's own
  enumeration.

## Phase-6 handoff (recorded in the builder thread)
Three doc items must be finished once `runs/original-<date>/` exists (they cannot be now): (1) the
TUTORIAL reference-run/digest repoint; (2) `CODE_WALKTHROUGH.md:53` "two dated folders" → three; (3)
the run README (panel, byte-for-byte re-score, audit-clean, per-text table, the parsed-is-None
diagnostic, and the documented negative-sampling limitations).

## Net
Both README inaccuracies corrected; the pointer pass is verified by both reviewers; the one cheap
pointer nit is applied; the remaining doc finalization is a genuine Phase-6 dependency on the
not-yet-generated run. Pointer-guard green; full suite 362.
