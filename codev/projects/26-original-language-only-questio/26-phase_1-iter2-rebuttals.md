# Spec 26 Phase 1 — Rebuttal to iter-2 consult (codex COMMENT / claude REQUEST_CHANGES)

Both reviewers **confirmed the two iter-1 blocking fixes are correct** (path-based
`metadata_for_standardized_path` for the encyclicals re-stamp; `text_metadata()` cross-source
conflict detection). The iter-2 asks were stale documentation and test-strength, not code defects. All
actionable points accepted and applied in `[Spec 26][Phase: implement] docs/tests: point metadata docs
at the path channel; pin pool membership`.

## Accepted and fixed

- **catalogue.py module docstring still described the old `text_metadata` channel** (both reviewers).
  Rewritten: the two fields reach generation via `metadata_for_standardized_path` (by path, like
  `license`, because a tuple key can't resolve re-stamping converters); `text_metadata` is now described
  as the separate nominal conflict-detecting view. The standardized-path-convention paragraph now covers
  metadata recovery as well as license.
- **Plan Phase 1 objective / deliverable / acceptance / test-plan still asserted `text_metadata()` is
  fail-closed on an unmapped tuple** (both). Rewritten to the shipped design: `metadata_for_standardized_path`
  is the path-based, `None`-returning channel; `text_metadata()` raises only on a cross-source conflict.
- **`text_metadata()` has no production caller yet, so its guard is inert** (claude). Noted in the plan
  as a Phase-2 obligation: generation calls `text_metadata(sources)` once at the start (its sole
  production caller) and asserts per-group path-resolved agreement, so the guard fires on the real
  catalogue. Also added a line to the real-catalogue test that invokes `text_metadata(sources)` now, so
  the guard is exercised against the committed data in Phase 1.
- **`test_real_catalogue_default_pool_is_seventeen` pinned the count, not the membership** (claude).
  Now asserts the exact 17-member set of `text_key`s — "the one test standing between a typo and a
  silently different benchmark." A `canonical_language` typo (e.g. `ara`) that drops a text now fails
  loudly, which also mitigates the no-vocabulary-check soft spot.
- **`requested_as` elements not stripped** (claude). Now stripped on store, so a padded `"  KJV "` can't
  render into a prompt verbatim or skew Phase 2's seeded uniform choice.

## Accepted as noted, no code change

- **Equal-depth-disagreement raise in `metadata_for_standardized_path` is unreachable via
  `discover_catalogue`** (claude): correct — distinct sources yield distinct `source_id`s → distinct
  `standardized_dir`s, so two different dirs can't contain the same path. Kept as defence-in-depth (it
  fires for hand-built `Source` objects); not claimed as coverage.
- **No vocabulary allowlist for `canonical_language`** (claude, explicitly not a change request): there
  is no canonical language-code list in the codebase to validate against, and the exact-membership pool
  test now catches the real-data failure mode. Left as-is.
- **Lost real-data `convert_target`+`assemble` multi-shard coverage** (claude): the removed
  `test_real_lds_kjv_ot_nt_merge` was the only real multi-target-merge anchor; the merge/roundtrip
  *logic* stays covered by the synthetic export tests (verified non-vacuous). Re-adding a real anchor on
  the Talmud Aramaic target (many docs, one tuple) is a reasonable future improvement but is out of
  Phase 1's scope — flagged for the review phase.

## Net
No code defects were found in iter-2; the implementation shipped in iter-1 stands. The changes here are
documentation accuracy (catalogue docstring + plan) and two cheap test-strength improvements (exact
pool membership, invoking the conflict guard on real data), plus the Phase-2 obligation to give
`text_metadata()` a production caller. Full pipeline suite 336 passed.
