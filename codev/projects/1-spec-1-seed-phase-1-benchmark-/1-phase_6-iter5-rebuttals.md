# Phase 6 implementation — review dispositions (iter 5)

**codex COMMENT / HIGH** (satisfies the scoring contract, anti-hedge, raw-count,
tradition, and missing-cell requirements). **claude REQUEST_CHANGES / HIGH** — one
verified false-negative in the inverse direction. (Note: porch advanced phase_6 →
phase_7 after the iter-4 fix since the global tests pass; these iter-5 fixes land as
a post-advance improvement on the same branch and are covered by the pr-gate review.)

## Accepted and fixed

**1. A repeated correct citation was misread as a hedge (claude, blocking).**
Candidate counting used a set of full spans incl. their lead-in words, so the same
citation stated twice ("It is Jude 1:3. Jude 1:3 warns…") yielded two spans → 0 —
a systematic false-negative that UNDERSTATES accuracy on cite_passage/identify_source
(overstating the hallucination problem the paper reports). Applied claude's verified
fix: spans asserting the EXPECTED citation collapse to one candidate; only distinct
OTHER citations add to the count. Both-direction regression tests for all three
shapes (repeat-correct → 1; repeat + different → 0); 16/16 of claude's cases hold.

**2. Stale module docstring (claude + codex).** `score.py`'s header still described
the replaced containment semantics; rewritten to the single-candidate / label-equality
contract.

**3. `ScoreError` missing from `main()`'s handler (claude + codex).** Added, so
score's fail-fast guards (missing/mixed digest, no rows) surface as `error: …` /
exit 2 like every sibling error, not a raw traceback.

## Non-blocking — disposition

- **`parse_yes_no` mid-sentence negation (claude).** Considered claude's leading-token
  hardening; it is functionally a no-op (a leading token is already the first match,
  and the adversarial "no doubt … yes" still falls back to search → "no" either way),
  so I did NOT add it — no point shipping dead complexity. The prompt asks for a bare
  Yes/No; this remains a narrow, chance-level mis-parse (recorded, not overlooked).
- `identify_source` work-field hedge, `tradition` soft-degrade, identify_version
  short-label — claude explicitly agreed with the prior dispositions; unchanged.

## Disagreements

Only the parse_yes_no micro-item (declined with reason above); all blocking/semantic
findings accepted.
