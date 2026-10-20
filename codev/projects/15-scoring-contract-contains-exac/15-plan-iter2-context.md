### Iteration 1 Reviews
- codex: REQUEST_CHANGES — The core approach is sound, but the plan omits contradictory documentation and lacks an executable, artifact-safe rebaseline procedure.
- claude: REQUEST_CHANGES — Approach and deltas verified correct, but the plan misses five breaking viewer vitest guards its own test dispatcher won't run, hand-waves a first-run summary regeneration that the CLI fail-fasts on, and instructs a test edit that would violate the spec.

### Builder Response to Iteration 1
# Spec 15 — Rebuttal to iteration-1 plan review (codex + claude)

Both reviewers returned **REQUEST_CHANGES (HIGH)** and both **verified the pre-registered deltas as correct**
(tutorial +20, first-run +1). The feedback exposed real landing-blockers in the rebaseline mechanics and the
guard surface; I independently re-verified the load-bearing claims against the code. **All points accepted
and folded into the revised plan** — no substantive disagreement.

## Guard surface: nine affected guards, not four; and my test lane wouldn't catch five of them (claude #1) — ACCEPTED

Verified: `.codev/checks/test.sh` maps `runs/` → the **pipelines** lane only, so a commit touching
`pipelines/` + `runs/` runs pytest and **never fires vitest** — while five viewer suites read the committed
runs as fixtures and would break on `main`. Confirmed those suites reference the committed run dirs
(`tutorialRun.test.ts`, `ExplorerPage.test.tsx`, `LeaderboardPage.test.tsx`, plus `StandingsPage.test.tsx`
/ `realRun.test.ts`). **Change:** Phase 1 now edits `apps/viewer/` in the same atomic commit (which makes
the dispatcher run vitest), enumerates the known-breaking assertions with their new values, and instructs
running the full viewer suite. The "no viewer change → minimal conflict with aspir-11" claim is **retracted**;
I sent the architect a merge-coordination update naming the viewer test files.

## First-run summary cannot be regenerated via the CLI (codex #1, claude #2/#3) — ACCEPTED

Verified: first-run `answers.jsonl` rows carry **no `panel_fingerprint`** (tutorial's do), so `score
--config` fail-fasts (`cli.py:325-331`), and a keyless score nulls `panel`/`expected_n`/`missing` (the
`lessons-critical` scar); `configs/models.yaml` is gitignored. **Change:** the plan now carries an explicit
**rebaseline procedure** — regenerate `scores.jsonl` via `score_file(answers, out)` (the byte-guarded path),
and regenerate `summary.{json,md}` by calling `score_file()` programmatically with `panel` taken **verbatim
from the committed `summary.json`** (prices `None`) and the roster rebuilt from committed `questions.jsonl`.
Never YAML config, never re-collect. It explicitly forbids the `[no-tools]` stamp (would change the standings
key, collide with the tutorial `haiku` row, and stale `test_tutorial_run.py:20 FIRST_RUN_KEY`), with a guard
asserting the standings keys are unchanged. The rebaseline script is recorded in the review (the
reconstructed roster is ephemeral/gitignored).

## "Only accuracy + generated_at differ" is wrong (codex #2, claude #2) — ACCEPTED

Correct — `summary.json` also gains the `contains_reference` submetric, and first-run additionally surfaces
`api_model` (score.py:429) where it had none. **Change:** replaced that line with a **pre-registered honest
diff** section stating exactly what may change per file (new `contains_reference` key; flipped-cell
accuracies; `generated_at`; first-run `api_model`) and that everything else — panel identity, usage, costs,
standings keys — is unchanged.

## test_score.py:231 must NOT gain contains_reference (claude #3) — ACCEPTED

Verified: `:46` is the `retrieve_quote` whole-dict (must gain the key); `:231` is `identify_version`
(`assert ok == {"exact":1,"normalized":1,"correct":1}`) and must stay unchanged. My draft inherited the
spec's error. **Change:** the plan now scopes the edit to the retrieve_quote dict **only** and adds a unit
case asserting all four non-text-retrieval dicts are unchanged.

## "five other task branches" → four (codex #5) — ACCEPTED

There are four non-text-retrieval tasks (`verify_source`, `identify_version`, `cite_passage`,
`identify_source`). Corrected throughout.

## Accumulator: `acc[sm] += …` path doesn't exist (codex #4) — ACCEPTED

Verified: `score_file` updates `exact`/`normalized`/`token_f1` explicitly; `acc[sm]` is only *read* at
summary construction. **Change:** the plan says to add an **explicit** `acc["contains_reference"] += …`
line plus the accumulator seed (matching existing style; no speculative generic-loop refactor).

## Mandatory independent delta validation — guards are circular (codex #6, claude #5) — ACCEPTED

Both flagged that rebaselining makes the byte-for-byte guards circular, so Latin-invariance / "nothing else
moved" loses its witness. **Change:** promoted the evidence check from "may live in a test or review" to a
**mandatory pinned validation test** — assert the flipped `correct` set is exactly the 21 known
`(model_id, question_id)` pairs, or pin the per-cell summary values (haiku-search 0.52, haiku 0.47,
opus-search 0.74, opus 0.66; first-run claude-haiku 0.25 + LDS cell 0.76).

## Implementation shortcut: reuse `_bounded_equal` (claude) — ACCEPTED

Verified `_bounded_equal()` already is word-bounded normalized containment. **Change:** the plan now
specifies `contains_reference = int(bool(normalize(target)) and _bounded_equal(answer, target))` and tells
the builder to reuse it (fixing its misleading docstring) rather than duplicate the regex. Keep-it-simple win.

## Docs incomplete (codex #3, claude #4, claude smaller points) — ACCEPTED

**Change:** docs scope expanded to: `CODE_WALKTHROUGH.md` §4/§5 + `_SUBMETRICS`/accumulator note + the
`:300-304` never-re-score bullet (amend to the sanctioned-exception shape); `score.py` **module docstring**
(the "nothing else" headline framing — now in Phase 1, same file as code); `runs/tutorial-…/README.md`; and
`runs/first-run-…/README.md` — correcting both the stale `24%` **and** the factually wrong "17 understated
answers" claim (only 1 of 18 high-F1 misses is contained; the rest are genuine paraphrase differences — good
PR-gate evidence that containment is not over-rescuing).

## Overstated risk acknowledged (claude #4)

Claude noted `test_code_walkthrough.py` only checks in-range pointers, so my "anchors break" risk is
harmless. Kept as a low/low line; no change needed.

---

**Net:** every REQUEST_CHANGES point accepted; plan revised in iteration 2 with an executable,
artifact-safe rebaseline procedure, the full nine-guard surface (incl. the five viewer suites the
dispatcher would otherwise skip), a mandatory non-circular delta validation, the correct task count and
test-line scope, and complete doc coverage. Deltas were verified correct by both reviewers, so the
approach is unchanged.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
