### Iteration 1 Reviews
- codex: REQUEST_CHANGES — Export assembly works for the tested LDS split, but the required non-vacuous round-trip and deterministic canonical ordering are not implemented.
- claude: REQUEST_CHANGES — `assemble` is correct and well-tested on real data, but `roundtrip_equal` is provably tautological — it replaces the plan's required inverse-grouping check and reports "round-trip ok" unconditionally, so the phase's headline guarantee is unverified.

### Builder Response to Iteration 1
# Phase 4 implementation — review rebuttal (iter 1)

Both reviewers **REQUEST_CHANGES / HIGH** and converged on the headline defect:
my `roundtrip_equal` was tautological. claude proved it empirically (it returns
`True` even for a deliberately lossy `assemble`). I accepted all findings; `assemble`
itself was verified correct on the real LDS OT+NT merge by both. No disputes.

## Accepted and fixed

**1. The round-trip check was vacuous (both, blocking).** `roundtrip_equal` =
`assemble(assemble(docs)) == assemble(docs)`, which cannot return `False` (after
the first pass every group is single-shard, so the second is identity). The plan
required "inverse grouping for the round-trip check" / "assemble-then-regroup
reproduces metadata + ordered entries", and the CLI's `round-trip ok` would be
committed as Phase 8 evidence for spec criterion #4 — misleading. Replaced with
`roundtrip_ok(docs)`: regroup by key, and for each input shard assert metadata
agree, `tradition ⊆ union`, and **every shard entry appears in its assembled
document at a strictly increasing position** (catches loss *and* reordering), with
a global no-invention check. The CLI now fails (exit 2) when it returns `False`
(no longer dead code). A **mutation test** monkeypatches a lossy and a reordering
`assemble` and asserts `roundtrip_ok` returns `False` — the guard that keeps it
honest.

**2. `assemble` abandoned the citation-uniqueness invariant (claude).** The
converters enforce `_require_unique_citations`; across shards, two entries with the
same citation but different text both survived the `(citation, text)` dedup,
yielding a duplicate citation (ambiguous ground truth). Now `assemble` raises
`ExportError` on a duplicate citation in the assembled document. Not reachable on
today's data (encyclical `(title, pope, date)` triples are unique and LDS OT/NT
citations are disjoint — both reviewers verified), but fail-fast now.

**3. Output order was input-dependent for multi-key inputs (claude #2).** `assemble`
now returns the documents sorted by `(work, version, language)`, so the result is
deterministic regardless of input order. The test was renamed/strengthened to use
distinct keys (the old one only exercised a single key).

**4. `interchange_filename` collisions were unguarded (both).** Added
`check_filename_collisions`, called by the CLI before writing, raising `ExportError`
if two distinct `(work, version, language)` slugify to the same filename (e.g.
`"A B"` vs `"A-B"`). Not reachable across the real 211 encyclicals (verified), but
fail-fast rather than a silent overwrite.

**5. Ordering honesty (both, comment).** The docstring no longer claims a general
"native unit order": shards are ordered **deterministically by first citation**
(lexicographic), which places OT before NT for the Bible and preserves each shard's
native order; single-shard works keep native order exactly. `source_url` is
documented as best-effort (first shard), since one interchange document cannot
carry a per-shard URL — so the round-trip does not (and cannot) require preserving
every shard's `source_url` across a merge.

**6. `export` documented (claude #3).** Added an `export` step to `pipelines/README.md`
and the module map.

Re-verified end-to-end after the fixes: 8 shards → 7 interchange documents, LDS
KJV OT+NT merged (31102 entries), round-trip ok; 95 tests pass.

## Disagreements

None.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
