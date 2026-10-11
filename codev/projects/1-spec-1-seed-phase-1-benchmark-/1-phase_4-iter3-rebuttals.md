# Phase 4 implementation — review dispositions (iter 3)

**codex REQUEST_CHANGES / HIGH** (two residual determinism/invention edge cases),
**claude APPROVE / HIGH** (round-trip non-vacuous, verified by four mutation tests;
the real 221-shard corpus assembles into 220 interchange documents correctly). I
accepted codex's two. Both are unreachable on the real data (the only multi-shard
group, LDS OT+NT, has disjoint citations and one tradition) but are real
guarantees and cheap to close. No disputes.

## Accepted and fixed

**1. Shard order was not total for identical citation sequences (codex #1).** Two
shards with the same citations but different `tradition`/`source_url` kept caller
order, so the tradition-union order and the selected `source_url` were
input-dependent. The sort key is now `([citations], tradition, source_url)` — a
total order. Permutation test added with identical-citation / different-tradition
shards.

**2. The no-invention check was count-only (codex #2).** With duplicate input
entries the deduped count is below the raw total, so an assembler could drop a real
entry and invent one while staying within the count budget. `roundtrip_ok` now
compares the assembled entry **set** (all of `(citation, text, unit_type)`) and the
key set against the exact deduplicated shard set — catching loss *and* invention
regardless of duplicates. Mutation test added: an invented entry within the
duplicate-shard count budget makes `roundtrip_ok` return `False`.

98 tests pass; the real end-to-end export is unchanged (7 interchange docs from the
English corpus, round-trip ok).

## Disagreements

None.
