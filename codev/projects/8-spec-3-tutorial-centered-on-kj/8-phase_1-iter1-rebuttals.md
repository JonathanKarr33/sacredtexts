# Phase 1 (Fair Arabic/Hebrew normalisation) — Iteration 1 rebuttals

Both reviewers returned **REQUEST_CHANGES / HIGH** and converged on the same blocking issue
(Codex's single point is a subset of Claude's). Claude also verified the implementation
corpus-wide (QUL 6236/6236 symmetric, zero word-splitting, Latin invariant over 224k entries,
165 tests green). Every point accepted.

## Blocking (both reviewers): the Arabic mark set is QUL-derived only

**Codex:** strips only U+064B–U+0655 while the spec requires U+064B–U+065F; U+0656–U+065F
become spaces and split words.
**Claude:** same root cause, wider — the *answer* side is uncontrolled (the whole point of the
search-on arm), and marks outside QUL (U+0617–U+061A, U+0656–U+065F, Arabic Extended-A
U+08F0–U+08F2) still split words mid-token; with `correct = normalized` (whole-string
equality) one stray mark zeroes an item and silently depresses the paid search-on arm.

**ACCEPTED — fix applied (Claude's recommended shape).** `strip_script_marks` now deletes any
`category == "Mn"` codepoint within the Arabic/Hebrew blocks (U+0590–U+08FF, U+FB1D–U+FB4F),
*plus* the explicit non-Mn editorial set still needed there (tatweel U+0640 Lm, the U+06D6–U+06ED
annotation block incl. the rub-el-hizb/sajdah So symbols and small waw/yeh Lm). This is a strict,
script-scoped superset of the previous behaviour, so Latin combining marks (U+0300–U+036F, outside
the blocks) remain untouched and Latin output stays byte-for-byte unchanged. Added a
per-codepoint parametrised test over U+0617–U+061A, U+0656–U+065F, and U+08F0–U+08F2 asserting
each folds without splitting. `audit._norm` inherits the fix via the shared helper.

## Non-blocking (Claude) — all applied

1. **Test helper `_MARK` diverged** (deleted the maqaf vs. the impl's maqaf→space; over-spanned
   into Arabic-Indic digits U+0660–U+0669; passed only because no fixture carries a maqaf).
   Replaced with an *independent* stdlib stripper (`NFKD` + drop category-Mn, maqaf→space) so the
   vocalised-vs-plain comparison does not reuse the code under test, and added a word-count
   assertion that genuinely catches mark→space splitting.
2. **Stale module docstring** — updated the `normalized`-metric description to state that
   Arabic/Hebrew mark + annotation stripping and alef/maqaf folding are part of the contract.
3. **Re-score regression compared sorted lines but claimed byte-for-byte** — changed to a direct
   byte-for-byte compare (score_file preserves input order), strictly stronger; still passes.

## Noted, intentionally out of scope (Claude, Phase 3 heads-up)

Orthographic-variant mismatches — a model spelling `الرحمان` (explicit alef) vs. `الرحمٰن`
(dagger alef), alef-maksura/ya, ta-marbuta/ha — are letter-choice differences, not combining
marks, and both reviewers scoped them out of Phase 1. Left unhandled deliberately (folding them
risks changing meaning); recorded so the Phase 3 numbers are read as orthographic variance, not a
normalisation bug.

## Net

One blocking issue, fixed with the reviewer-endorsed one-line superset. 176 tests pass
(the extended-mark and regeneration tests now run). The scoring contract (`_SUBMETRICS`, the
`retrieve_quote` headline) and Latin behaviour are unchanged.
