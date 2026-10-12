# air-19 thread — Rework TUTORIAL.md and CODE_WALKTHROUGH.md

## Task (Issue #19, AIR strict)
Restructure both docs: TUTORIAL.md → single linear track; CODE_WALKTHROUGH.md →
codebase-layout-first + two numbered recipes. Mid-flight maintainer requirement
(architect:main, 2026-10-12): both docs must read for non-engineers — plain-language
sentence before every command, define/avoid jargon, assume only copy-paste terminal
ability. Reuse #10's accurate technical content; just restructure.

## What I did
- **TUTORIAL.md**: collapsed the old Track A/B/C into ONE path (clone → convert →
  validate → generate → audit → set up models → collect → score → view). Every stage
  gets a one-sentence plain-language intro, then the command. The paid `collect` is
  marked 💲 and the "no key? stop and view the shipped run" case is a short inline note,
  not a track. Safety warnings (never re-run over committed runs; keep keys in env) kept
  as short inline notes. Single track writes to `runs/my-run/` throughout; dropped the
  `RUN=` shell variable (non-engineer friendliness).
- **CODE_WALKTHROUGH.md**: opens with a directory-tree layout (pipelines/sacredbench
  modules, texts/, runs/, apps/viewer, configs/, codev/) each with a one-line "what/when
  you'd open it". Then two recipes as numbered step lists: "Add a new text" (raw → target
  → converter → register → convert+validate → audit) and "Add a new evaluation task"
  (TASKS → _build → score_answer → normalize/_SUBMETRICS → flows-free/must-not-touch →
  invariants). Background (interchange, determinism, evidence invariants) compressed into
  short `>` notes under the relevant step.
- All `file:line` pointers re-verified against the current source; explorerTasks moved to
  :47. Added one new pointer `test_code_walkthrough.py:72`.
- **.codev/checks/test.sh**: wired `CODE_WALKTHROUGH.md` into the pipelines lane so its
  pointer-guard test runs when the doc changes doc-only (previously root doc changes
  mapped to no lane → guard silently skipped in the gate). Verified routing.

## Verification
- `pytest pipelines/tests/test_code_walkthrough.py` → 71 passed (pointers resolve,
  symbols exist, ≥20 pointers, TUTORIAL.md + pipelines/README.md referenced).
- Gate compares origin/main...HEAD, so it only fires after commit — confirmed post-commit.

## Scope
Docs + 3-line dispatcher wiring. Well under 300 LOC, no architectural decisions. Stayed
in AIR.
