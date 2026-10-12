# air-10 — CODE_WALKTHROUGH.md (Issue #10, AIR strict)

## Goal
Repo-root `CODE_WALKTHROUGH.md`: a guided tour of the code for someone *augmenting*
sacredtexts (not a run tutorial — links TUTORIAL.md). Two focal paths:
(a) adding a text + converter, (b) adding a new form of evaluation.

## What I built
- `CODE_WALKTHROUGH.md` (repo root) — walks both paths with verified `file:line`
  pointers into the real code, cross-links TUTORIAL.md / pipelines/README.md /
  texts/README.md / apps/viewer/README.md / codev/resources/arch.md instead of
  duplicating them. Worked examples: Talmud-he target (Spec 8), NABRE list-of-books
  cautionary tale, contains-exact follow-up caveat.
- `pipelines/tests/test_code_walkthrough.py` — guards the doc's core promise:
  every `path:line` pointer resolves + line in range (parametrized, ~68 cases),
  and a curated list of relied-on symbols still exist. Committing it under
  pipelines/tests/ also makes the PR touch the `pipelines` lane so the dispatcher
  actually runs it (a root-only doc touch triggers no lane).

## Decisions
- Docs change, but NOT "config-only → no test": a file:line doc has a real rot
  failure mode, so the link/symbol test is genuine + deterministic.
- Pointers use full repo-relative paths or unique bare basenames (convert.py, …)
  so the test can resolve them unambiguously; non-pointer example paths and
  `<placeholder>`s are deliberately not asserted (avoids gitignored
  texts/standardized/, configs/models.yaml noise).

## Verification
- `uv --project pipelines run pytest pipelines` → 289 passed, 1 skipped (the
  expected "first-run evidence absent" skip). New test file: 93 passed.
- LOC well under AIR's ~300.

## Status
Implement complete, tests green. Next: `porch done 10`, then open PR with review
in the PR body (AIR: no spec/plan/review files).
