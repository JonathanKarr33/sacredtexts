# Spec 26 Phase 1 — Rebuttal to iter-3 consult (codex REQUEST_CHANGES / claude APPROVE)

Claude **APPROVE** (no blocking issues); codex **REQUEST_CHANGES** on stale governing-doc text that
still contradicted the shipped path-based channel. The code and tests were confirmed sound by both.
All points accepted and applied in `[Spec 26] Spec/plan: describe the path-based metadata channel`.

## codex — stale spec/plan text (ACCEPTED, fixed)
Three locations still described the superseded `(work, version, language)`-keyed `text_metadata`
channel (a leftover from the *plan-review* resolution that the *per-phase* consult then overturned):
- **spec Desired State "metadata channel" bullet** — rewritten: `metadata_for_standardized_path`
  recovers the two fields by path (like `license`), robust to converters (`encyclicals`) that re-stamp
  `work`/`version`; generation fail-closes on `None`; `text_metadata()` is the nominal cross-source
  conflict view.
- **spec Test Scenario "Metadata channel"** — rewritten to assert the path resolver (incl. the
  re-stamped-doc case) and the `text_metadata` conflict raise.
- **plan Executive Summary point 1** — rewritten: metadata reaches generation **by path**; removed the
  stale "a path-keyed channel structurally cannot feed a name" claim (the per-phase consult showed the
  opposite — path-based is exactly what works, and what the implementation does).

I verified with a grep that no "tuple-keyed map as channel" / "cannot feed a name" wording remains in
either document.

## claude — three non-blocking notes (ACCEPTED)
- **(a) First-run test symptom mis-stated.** The generation-invariance guard breaks as a **question-set
  digest mismatch on clean rebuild** (regenerating from the committed `inputs` yields a different set
  because Phase 1 removed the LDS-KJV targets *and* this phase reshapes the generator), **not** a
  `filter_standardized_paths` fail-close. Corrected the plan rationale so Phase 2 (and Phase 6) chase the
  right symptom; kept the re-score half.
- **(b) Uncatalogued LDS-KJV raw payloads outside `license_for_raw_path`.** Harmless (public domain) and
  a **deliberate** choice: the architect directed leaving the payloads on disk with an in-file comment
  (issue #26 keeps payloads on disk); `license_for_raw_path` is test-only and `audit.py` keys off
  `restricted` sources, so nothing is affected. Recorded as intentional.
- **(c) Nit: `canonical_language: no` YAML-parses as boolean.** True (`no`/`yes`/`true`/`false` are YAML
  booleans). No committed value hits it, and the existing non-empty-string validator already rejects a
  non-string with a clear "must be a non-empty string" message; the author's fix is to quote the value.
  Left as a documented nit rather than special-casing YAML boolean coercion for a language code the
  corpus does not use.

## Net
No code defect in iter-3 — the implementation from iter-1/iter-2 stands and is APPROVED by claude. The
change is governing-doc accuracy (spec + plan now match the path-based implementation) plus the
corrected first-run retirement rationale. Full pipeline suite 336 passed; catalogue gate green.
