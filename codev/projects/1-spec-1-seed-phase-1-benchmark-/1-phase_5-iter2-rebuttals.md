# Phase 5 implementation — review dispositions (iter 2)

**codex REQUEST_CHANGES / HIGH**, **claude COMMENT / HIGH** (every iter-1 blocker
genuinely fixed; remaining items latent/cosmetic, chief among them the post-sample
dedup under-delivering a quota). Accepted all three of codex's. No disputes.

## Accepted and fixed

**1. Negative-ratio bypass for single-work corpora (codex #1).** `generate` no
longer silently emits all positives when `len(works) < 2`; with `negatives_share
> 0` and no eligible wrong work it now **fails fast** (same path as the overlap
shortfall). To keep the single-work UX, the CLI detects a single-work corpus and
forces `negatives_share=0` with a warning (verify_source becomes all positives by
explicit choice, not by a silent loophole). Tests updated: single-work + a negative
request raises; `negatives_share=0` yields positives.

**2. Post-sample dedup could under-deliver the quota (codex #2, claude).** The pool
is now **content-deduplicated before sampling** (colliding shards sharing
`(work, version, language, citation, text)` collapse to one candidate), so a quota
is always met exactly and ids are unique by construction. The post-sample dedup is
replaced by a fail-fast uniqueness assertion. (Verified: two identical shards,
quota 10 → exactly 10 questions across seeds.)

**3. Manifest/quota-key completeness (codex #3).** `generate` now rejects unknown
`--quota` task names (`GenerateError`), and `build_manifest` records
`tasks_requested` (the subset) alongside `quotas` and the realized
`verify_source_negatives`, so the manifest fully captures the generation policy.

121 tests pass. Verified end-to-end: multi-work (Bible+LDS) → 5 negatives / all six
tasks / tasks_requested recorded; single-work Bible → auto-zero warning + positives.

## Non-blocking (claude) — already addressed or noted

- The quota-under-delivery (claude's chief item) is fixed by pre-sample dedup (#2).
- Remaining claude comments were iter-1 items already resolved; nothing else
  actionable this phase.

## Disagreements

None.
