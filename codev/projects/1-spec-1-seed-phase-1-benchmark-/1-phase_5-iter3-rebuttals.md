# Phase 5 implementation — review dispositions (iter 3)

**codex REQUEST_CHANGES / HIGH** (two determinism/contract items), **claude APPROVE
/ HIGH** (generation contract, exclusions, quotas, and digest-bound resume all
verified on the real corpora; determinism reproduced byte-for-byte; 121 tests).
Accepted both of codex's. No disputes.

## Accepted and fixed

**1. CLI auto-zeroing masked the insufficient-pool failure (codex #1).** Converting
`negatives_share` 0.5 → 0 for a single-work corpus meant a default `verify_source`
run silently produced all positives instead of the plan-required fail. Removed the
override: the CLI now only prints a NOTE, and `generate()` fails fast
(`GenerateError`, caught → exit 2) when `verify_source` negatives are requested on a
single-work corpus. A single-work run opts out explicitly with `--negatives-share 0`
or `--tasks` excluding `verify_source`. Verified: single-work Bible + default →
clear error; `--tasks retrieve_quote` → succeeds.

**2. Dedup/hashing were input-order-dependent for colliding shards (codex #2).**
Two identical shards with different traditions kept whichever came first, so
`source.tradition`, the digest, and `corpus_hash` depended on input order.
`generate()` now sorts documents by a **total key** (`work, version, language,
tradition, document_type`) before building the pool, so the dedup representative is
canonical; `corpus_hash` sorts by the same total key (no ties). Test: reversing the
colliding shards yields identical questions, digest, and corpus hash.

121 tests pass; real end-to-end unchanged (multi-work negatives; single-work
retrieve_quote).

## Note

- The canonical-representative dedup keeps the smallest-tradition shard rather than
  unioning traditions; a full tradition-union merge is what `export.assemble` does
  in the interchange tier, and generate reads shards. Not reachable on the real
  catalogue (distinct versions, no colliding content); the deterministic
  representative satisfies the "counts not distorted / reproducible" requirement.

## Disagreements

None.
