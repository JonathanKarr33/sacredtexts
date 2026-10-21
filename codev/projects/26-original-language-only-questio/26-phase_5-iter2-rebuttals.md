# Spec 26 Phase 5 — Rebuttal to iter-2 consult (codex + claude, both REQUEST_CHANGES)

Both reviewers converged on two things; both fixed in `[Spec 26][Phase: implement] docs: correct
drifted CODE_WALKTHROUGH pointers; KJV framing; soften run claim` (suite 362, pointer-guard green).

## 1. CODE_WALKTHROUGH.md drifted `file:line` pointers (both) — ACCEPTED
My iter-1 rebuttal over-claimed the pointers were fixed; in fact ~22 pointers into
`catalogue.py` / `generate.py` / `score.py` had drifted as those files grew across this PR, and the
range-only guard (correctly) can't catch a pointer that lands inside the wrong function. I did the
mechanical pass the reviewers asked for: recomputed each symbol's current line and corrected every
pointer, e.g.

- catalogue.py: `LICENSES` 46→59, `Target` 102→125, `load_source` 155→185, `standardized_dir`
  122→152, `select_targets` 259→381
- generate.py: `TASKS` 48→71, `Question` 80→86, `_qid` 118→124, `_build_texts` 153→178, `generate`
  205→241, `_append_verify_source` 316→354, `question_set_digest` 380→420, `build_manifest` 402→442
- score.py: `strip_script_marks` 105→101, `_SUBMETRICS` 128→125, `normalize` 133→128, `token_f1`
  144→139, `_single_citation_correct` 207→257, `score_answer` 225→275, `_with_outcome` 288→319,
  `score_file` 344→383, panel snapshot 430→629, `summary_markdown` 606→676

I then **verified every corrected pointer lands on its claimed symbol** (printed each target line).
Pointers into untouched files (schema.py, convert.py, audit.py, graders.py, config.py, collect.py,
explorer.ts) were spot-checked and are still correct, so they were left as-is.

## 2. KJV / "original-language" framing in the run README (codex) — ACCEPTED
`runs/tutorial-2026-10-11/README.md` called its corpus "original-language corpora only" in the intro
and copyright section, but the run includes the KJV — an English translation kept in the pool by the
canonical-language policy (the corrected `TUTORIAL.md` now says this). Dropped the "original-language"
qualifier in both places; the public-domain / open copyright claim (the point of that section) is
unchanged.

## 3. TUTORIAL "the Spec-26 run is committed under runs/" is false now (claude) — ACCEPTED
Softened to "lives under `runs/` … once it is generated (the `original-…` run)", since the run is
created in Phase 6 and the spec explicitly allows a no-key path where it is deferred. Phase 6 wires
the concrete path/link.

## Noted, no change
The residual `identify_source` mentions in `runs/tutorial-2026-10-11/README.md:82` (a historical
results write-up) and `lessons-learned.md:38` (a historical lesson) are out of scope per the spec's
own task enumeration; both reviewers agree.

## Net
The over-claimed pointer fix is now genuinely done and verified symbol-by-symbol; the KJV framing is
accurate in the run README; the forward-looking run reference is conditional until Phase 6 commits it.
Full pipeline suite 362 passed.
