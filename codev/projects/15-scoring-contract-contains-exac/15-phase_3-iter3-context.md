### Iteration 1 Reviews
- codex: REQUEST_CHANGES — Phase 3’s core rebaseline is sound, but Markdown reporting and provenance-task refusal classification do not fully meet the contract.
- claude: REQUEST_CHANGES — Rebaseline and refusal calibration are rigorous and independently verified clean, but the outcome layer lets a decline cue override a correct verdict on three provenance tasks — a one-line, zero-rebaseline fix plus a test.

### Builder Response to Iteration 1
# Phase 3 impl consult (iter1) — disposition

Both lanes **REQUEST_CHANGES (HIGH)**, strongly convergent on one real bug. Claude independently
verified the second rebaseline byte-clean (all 800 `scores.jsonl` rows `added={'outcome'}` only; phase-1
SHA oracle unchanged) and the refused set non-circular (token_f1 signature: 265/266 refused cells below
0.3; `LEADING_WINDOW` not load-bearing — ±1 cell across windows {30, 45, 60, 80, 120, ∞}). Folded both
findings; **no third rebaseline** (both fixes are no-ops on the committed `retrieve_quote` evidence).

## MUST-FIX (both lanes) — provenance refusal override

`_with_outcome` ran `classify_refusal` unconditionally, and for the provenance tasks
(`cite_passage`/`identify_source`/`identify_version`) `classify_refusal` has no containment half, so a
**hedged-but-correct** provenance answer ("I can't verify, but it is from Jude, Jude 1:3") was flipped to
`outcome="refused"` with `correct` forced 1→0. This violates the spec's "Provenance untouched — they keep
correct/incorrect; they gain only `refused`" (success criterion + Test Scenario) and the matcher's own
"decline-prefixed but delivers is an answer" rule.

**Fix** (`score.py`, `_with_outcome`): gate refusal on the headline being wrong —
`if not metrics["correct"] and classify_refusal(...)`. Provably a no-op on both committed runs: it can
only drop cells with `correct == 1` from the refused set, and text-retrieval refused cells already have
`correct == 0` (the matcher's not-contained half). Verified `scores.jsonl` + `summary.json` byte-identical
after the fix (only `generated_at` moved). Added hedged-but-correct unit tests for
`cite_passage`/`identify_source`/`verify_source` (and the still-refused decline-without-delivery case).

## FIX (codex) — summary.md three-outcome breakdown

Spec (§ success criteria) requires correct/incorrect/refused counts + accuracy + coverage + refused_rate
in **both** `summary.json` AND `summary.md`; `summary.md` showed only accuracy/coverage/n. Added the
`c/i/r` counts to every scored cell and the overall column, plus a legend documenting
`refused_rate = refused/n`. Regenerated both `summary.md` (scores/summary.json unchanged bar the timestamp).

## Nit (claude) — applied

`@lru_cache(maxsize=1)` on `_normalized_cues()` (called per answer; cues are a fixed constant).

## Deferred (documented, not changed this phase)

- **phase 5 README**: tutorial `haiku-search/retrieve_quote-e2d74279aaf0` is the only refused cell above
  token_f1 0.5 (0.68) — a from-memory attempt refused under the frozen rule; excluding it buys
  haiku-search ~1pt (80% vs 78.8%). Document beside the 1/21 hedge caveat so the refusal exclusion is not
  overstated as clean.
- **phase 4**: `localResults.ts:388 formatCell` renders a null-accuracy (all-refused) cell as bare
  "n/a", dropping `n`; fix with the coverage-column work.


### Iteration 2 Reviews
- codex: REQUEST_CHANGES — Phase 3 is substantially complete, but `verify_source` can still misclassify explicit refusals as answered—and even correct.
- claude: COMMENT — Both iteration-1 must-fixes are genuinely fixed and independently verified; the rebaseline is clean (oracle unchanged, byte guards pass unmodified, zero false-positive refusals, window non-load-bearing) — one new low-impact calibration gap should be fixed or documented before the PR.

### Builder Response to Iteration 2
# Phase 3 impl consult (iter2) — disposition

codex **REQUEST_CHANGES (HIGH)** — two issues, both fixed. claude **COMMENT** — iteration-1 fixes
verified genuinely fixed and rebaseline re-verified clean; one calibration gap, fixed (not just
documented). All fixes verified: pipeline + viewer lanes green (340 pipeline tests, 1 skip); the
phase-1 projection oracle and the 1/20 flip set are **unchanged**.

## codex #1 (FIXED) — verify_source refusal defeated by a mere Yes/No mention

`parse_yes_no` returned the FIRST `yes`/`no` token, so "I can't verify whether the answer is yes or
no" was read as a committed "yes" — not refused, and falsely scored correct when the expected answer
was "yes".

**Fix** (`score.py`): `parse_yes_no` now requires a **single unambiguous** token — an answer
mentioning both (or neither) parses to `None`. So the ambiguous decline scores `correct=0`, and
`_with_outcome`'s `not correct` gate then lets `classify_refusal` mark it `refused` end-to-end.
Regression tests added: `parse_yes_no` single-commitment cases, and
`score_answer("verify_source", "I can't verify whether the answer is yes or no.")` → `refused`. No
committed evidence uses `verify_source` (both runs are `retrieve_quote`-only), so zero rebaseline
impact; existing `parse_yes_no` / verify tests still pass (their cases are single-token).

## codex #2 (FIXED) — fully-missing cells lacked the three-outcome schema

Zero-answer (expected-but-unanswered) cells emitted only `{n, accuracy, expected_n, missing}`.

**Fix** (`score.py`): a missing cell now goes through `_outcome_cell` with a zero accumulator, so it
carries the same shape — `correct/incorrect/refused = 0`, `accuracy/coverage/refused_rate = None` —
and `missing` stays distinct from `refused`. No committed-evidence impact (both runs are complete;
no `n=0` cells), verified by diff; `test_missing_cells_with_roster` extended to assert the new keys.

## claude (FIXED, not just documented) — two missed "I can neither … nor" declines

`llama-3.1-8b / retrieve_quote-22fab64cec81` and `-74d14c70efb0` ("I can neither provide … nor …")
are unambiguous declines the first hand survey missed (scored `incorrect`). Rather than document the
gap, I added the `"i can neither"` cue and **re-pinned** the refused set within the still-open phase-3
rebaseline (not a third rebaseline): first-run refused 139→141 (llama 18→20), SHA re-pinned; tutorial
unchanged. Impact is confined to the bottom-ranked model (accuracy 0.0122→0.0125, coverage
0.82→0.80); the two cells flip `incorrect→refused` and **nothing else moves** — per-cell
exact/normalized/token_f1 byte-identical, oracle + flip set unchanged (verified by diff).

## claude nits (applied)

- `leading_decline` now scans only the leading window (+ a cue-length margin) instead of the whole
  answer — same result, bounded work.
- Documented in `classify_refusal` why the containment half is load-bearing (it is redundant under
  the default graders but the only guard under `--evaluator strict`, where a contained-but-not-
  normalized answer scores `correct=0`).

## claude — remaining phase-5 / phase-4 notes (unchanged from iter1, still deferred)

- phase-5 README: tutorial `haiku-search/retrieve_quote-e2d74279aaf0` (the only refused cell above
  token_f1 0.5) documented beside the 1/21 hedge caveat.
- phase-4: `localResults.ts formatCell` null-accuracy cell drops `n`; fix with the coverage column.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
