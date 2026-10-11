# Phase 4 implementation — review dispositions (iter 2)

**codex REQUEST_CHANGES / HIGH** (two hardening points), **claude APPROVE / HIGH**
(the vacuous round-trip is genuinely fixed and verified non-vacuous; export
assembles the full 221-shard real corpus with no collisions). I accepted codex's
two. No disputes.

## Accepted and fixed

**1. Shard ordering was input-dependent on a first-citation tie (codex #1).**
`sorted(shards, key=first citation)` left caller order to break ties, so two
shards sharing a first citation (`[1:1, 1:2]` and `[1:1, 1:3]`) assembled
differently when reversed. Now the sort key is the shard's **full citation
sequence** (`[e.citation for e in d.entries]`), a total, input-independent order.
Added a same-first-citation permutation test asserting `assemble([a,b]) ==
assemble([b,a])`. (Not reachable on real data — the only multi-shard group, LDS
OT+NT, has distinct first citations — but now guaranteed.)

**2. `roundtrip_ok` under-checked fields (codex #2).** It compared entries only by
`(citation, text)` (an altered `unit_type` passed) and accepted any tradition
**superset** (invented traditions passed). Now it compares entries on all of
`(citation, text, unit_type)` and requires the assembled `tradition` to equal the
**exact union** of the shards' traditions. Added mutation tests: an assembler that
alters `unit_type`, and one that invents a tradition, each make `roundtrip_ok`
return `False` (alongside the existing lossy/reordering mutators).

96 tests pass; the real end-to-end export is unchanged (7 interchange docs, LDS
OT+NT merged, round-trip ok).

## Note

- The full-citation-sequence sort key materializes each shard's citation list, but
  real groups have at most two shards (LDS OT+NT) and the comparison short-circuits
  at the first differing citation, so there is no meaningful cost.

## Disagreements

None. (claude APPROVE carried no change requests — its earlier comments on native
ordering and `source_url` were addressed in iter-1's docstring.)
