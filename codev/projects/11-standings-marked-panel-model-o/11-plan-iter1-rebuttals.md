# Plan iter-1 rebuttals — Project 11

**codex: APPROVE (HIGH, no issues).** **claude: COMMENT (HIGH)** — approach/phasing/spec-coverage
sound and the green-gate + 7-row claims verified against the code; six concrete corrections. I
accepted all six; none required re-sequencing.

## 1. Migration command uses `--answers`; `answers` is positional
**Accepted.** Verified in `cli.py score`: `answers: Path = typer.Argument(...)`, the rest are
`typer.Option`. Fixed the Phase-2 Test Plan command to pass `answers` positionally with the rest
as options, and added a note.

## 2. Phase 1's test path can't exercise `cli.py` as described
**Accepted — the sharpest finding.** `test_phase2_tools.py:238–259` hand-builds the panel dict and
calls `score_file`, so it only covers **score.py**; the `cli.py` panel build is inline behind the
fingerprint cross-check and needs *fingerprinted* answers to reach. If I only edit the dict,
`cli.py`'s new emission ships untested until the Phase-2 migration first runs it. Fixed: Phase 1
now has **two** test paths — (a) the `score_file`-level dict test for score.py, and (b) a
CLI-level test following `test_score_config_drift_from_answers_refused` (~106–137): monkeypatch
`collect_mod.complete`, `collect` fingerprinted answers, `CliRunner().invoke(app, ["score", …])`,
assert the written panel. Updated the file list, deliverables, and test plan.

## 3. JSON/MD-skew mitigation not in any deliverable
**Accepted.** The risk claimed `test_tutorial_run.py` pins the `summary.md` `tools` column, but
today that file only secret-scans the md. Added an explicit Phase-2 deliverable + test-plan line:
assert the migrated `summary.md` panel table has a `tools` column (`web_search` on `-search` rows,
empty/`—` otherwise). Updated the risk-table mitigation to point at this concrete assertion.

## 4. Typecheck is outside the gate
**Accepted.** Confirmed `.codev/checks/test.sh` runs `pnpm -C apps/viewer test` (= `vitest run`)
for the viewer lane; `check-types` (`tsc --noEmit`) is a separate `package.json` script the gate
never calls. Since Phase 2 adds `PanelEntry.tools` / `StandingRow.tools`, I added
`pnpm -C apps/viewer check-types` to Phase 2 acceptance so type breakage can't ship silently.

## 5. Falsified code/UI text belongs in Phase 2, not the Phase 3 doc sweep
**Accepted.** Moved into Phase 2's file list: the `StandingRow.key` doc comment + `aggregate()`
docstring in `aggregate.ts`; the header comment (~9–10) and the **user-visible** "keyed on the
panel's provider + model" blurb (~97) in `StandingsPage.tsx`; and `runs/tutorial-2026-10-11/
README.md:17`. Confirmed the blurb text by reading the file. This keeps the Phase-2 commit
self-consistent (no run dir whose `summary.json` carries `tools` while its README still describes
the marker). Phase 3's objective and Documentation-Updates section now reflect the split.

## 6. Phase 3's grep gate is ambiguous / self-failing
**Accepted.** Replaced the broad `grep -rn` with a **scoped** grep over the four authoritative docs
only (`arch-critical.md`, `arch.md`, `CODE_WALKTHROUGH.md`, `TUTORIAL.md`), naming the sole
permitted hit (`TUTORIAL.md:144`, a valid `tools: [web_search]` *config* reference) and the
deliberately-excluded legitimate survivors (`configs/models.example.yaml`; Spec 8's historical
`plans/8-*`/`projects/8-*`/`reviews/8-*`/`state/aspir-8_thread.md`). Also noted
`CODE_WALKTHROUGH.md`'s pointer-line-range test (`_REQUIRED_SYMBOLS`) so the walkthrough edit keeps
the gate green.

## Net
No disagreements. codex found nothing; claude's six corrections were all accurate code-level
catches and are folded in. Phasing is unchanged — claude agreed the "migration + viewer key +
committed-run tests land together" decomposition is the cheapest that keeps the gate green.
