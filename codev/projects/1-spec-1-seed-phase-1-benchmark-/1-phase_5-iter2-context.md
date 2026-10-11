### Iteration 1 Reviews
- codex: REQUEST_CHANGES — Phase 5 adds the main generation and resume mechanisms, but digest enforcement and generation-policy guarantees remain incomplete.
- claude: REQUEST_CHANGES — Generation contract and the digest-bound resume guard are well implemented and all 108 tests pass, but the `quotas` deliverable is unreachable from the CLI (and untested), and the identify_version ambiguity test only catches its regression ~35% of the time.

### Builder Response to Iteration 1
# Phase 5 implementation — review rebuttal (iter 1)

Both reviewers **REQUEST_CHANGES / HIGH** and converged. claude verified the
digest chain and version-gating are the right shape and run; both found real gaps
in digest coverage, the negative-ratio guarantee, and the (unreachable) quota CLI
surface. I accepted all the blocking items and the actionable non-blocking ones.
No disputes.

## Accepted and fixed

**1. Digest/corpus hash under-covered content (codex #2).** `question_set_digest`
hashed only ids (which omit `unit_type`/`tradition`/`document_type`), and
`corpus_hash` omitted metadata and `unit_type`. Both now hash the full canonical
content — `question_set_digest` over each question's complete JSON, `corpus_hash`
over `document_type`/`tradition`/`unit_type` too. Mutation test: changing a
`unit_type` (which the id does not encode) now changes both hashes.

**2. Digest fails open on rows without it (codex #1, claude #7).** `collect` now
refuses to resume if any existing row lacks the current digest (not just on a
mismatch), and `score` refuses any file with a missing or mixed digest. Tests:
legacy digest-less answers refused by collect; score rejects missing and mixed.
(Updated `test_score_file` to stamp the digest, since nothing legitimate omits it
now.)

**3. Negative ratio not guaranteed (codex #3, claude #3).** Items lacking an
eligible wrong work used to silently become positives. `generate` now partitions
the sampled `verify_source` items into negative-eligible ones and **fails fast**
(`GenerateError`) if fewer than `negatives_share × quota` are eligible; the
realized negative count is recorded in the manifest (`verify_source_negatives`).
Test: two works that each contain the other's text → no eligible negatives → fail.

**4. `quotas` unreachable from the CLI (both, blocking).** Added `--tasks`
(comma-separated subset) and repeatable `--quota task=N`, threaded into both
`generate()` and `build_manifest`. Phase 8's shape is now
`generate … --tasks retrieve_quote --per-task 100` → exactly 100 retrieve_quote
(verified). Tests: library-level `quotas`/`tasks` behavior, a CLI happy-path
(`--tasks`/`--quota`), and a bad-`--quota` parse error.

**5. Balancing on `tradition[0]` (codex #5, claude #6).** Documented as the
**primary (first-listed)** tradition (today's corpora are single-element; Phase 6's
per-listed-tradition aggregation is a separate axis). Also made `_balanced_sample`
**input-order-independent** (sort each tradition's sub-pool by content before the
seeded shuffle, in sorted tradition order) — a determinism bug the review's
multi-tradition angle surfaced. Test: multi-element tradition lists, same ids
regardless of input order, balanced within 1.

**6. identify_version ambiguity test was probabilistic (claude #2).** Rebuilt with
dominant shared text (12 shared vs 2 version-unique) and an **exact-set** assertion
— deterministic with correct code, ~99.6% mutation-catching. Added `assert
negatives` to the verify_source overlap test so it can't go vacuous.

**7. identify_version empty-by-ambiguity aborted the whole run (claude #4).** Now
skipped like the version-gate (task not applicable), instead of failing every task.

**8. Duplicate ids across colliding shards (claude #5).** `generate` now dedups by
id (keep first) after the deterministic sort, so a cell is never double-collected
or double-scored. Test with two shards sharing `(work, version, language, citation,
text)` under different traditions.

**9. Cleanups (claude #8, #9).** `except (ProviderError, Exception)` → `except
Exception`; README documents the manifest, digest, and resume refusal.

120 tests pass; real end-to-end verified (3-version Bible → all tasks incl.
identify_version, deterministic digest; `--tasks retrieve_quote --per-task 100`
→ 100 questions).

## Disagreements

None.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
