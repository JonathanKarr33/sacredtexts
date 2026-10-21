# Spec 26 Phase 2 — Rebuttal to iter-2 consult (codex REQUEST_CHANGES / claude APPROVE)

Claude **APPROVE** after independently verifying the real corpus (476 questions / 17 texts, 2 excluded
rows, 48/51 same-language negatives, perf 113s→20.4s, byte-exact prompts, a load-bearing containment
test). Codex **REQUEST_CHANGES** on test strength + one stale docstring. All points accepted and fixed
in `[Spec 26][Phase: implement] test/docs: byte-exact prompts, cite_passage boundary, structural
containment; verify_source citation coherence` (suite 348).

## codex — ACCEPTED

### `cite_passage` fail-fast test didn't pin `max(quota, 2)`
The old test (3 entries vs quota 12) would pass even if `max(quota, 2)` were reverted to `quota`.
Replaced with two boundary tests: **exact-quota success** (2 entries, quota 2 — each target's exemplar
is the sibling) and **single-entry failure** (1 entry, quota 1 → no distinct exemplar → fail-fast).

### No byte-exact test of the four prompt strings
Added `test_prompt_strings_are_byte_exact`: a controlled two-entry text with a single `requested_as`
name pins the exact rendered string for `retrieve_quote`, `complete_unit`, `cite_passage`, and
`verify_source` — so a wording/punctuation change that would move the question-set digest now fails.

### `generate.py` module docstring still said family = "never same `document_type`"
Corrected to the architect-approved rule: the nine hadith collections are one family
(`document_type == hadith_collection`), otherwise family is `work`; same-language preference and the
cross-language fallback are now described too.

## claude — non-blocking, addressed

### verify_source negative `source.citation` incoherent
A negative's `source.citation` held the passage's citation from its *true* source under the asked
edition's `work` (e.g. `Sunan Abi Dawud` + `17:79`). Fixed before Phase 6 bakes the digest:
`source.citation` is now `""` for verify_source (the prompt shows a passage, not a citation), and the
passage's provenance — `true_work` / `true_version` / `true_language` / **`true_citation`** — lives in
`expected`. New `test_verify_source_source_citation_empty_and_true_citation_recorded`.

### Containment test caught a deleted filter only on the pinned seed
Added `test_verify_source_fails_fast_when_all_cross_family_passages_contained`: a structural,
seed-free proof — when *every* different-family passage is also in the asked edition, there is no
eligible negative and generation fails fast. Remove the `ne in asked.all_norm` filter and this test
wrongly succeeds, so it is strictly load-bearing.

### Negative candidates weighted by entry count, not uniform over texts
Accepted as a Phase-6 README limitation (recorded in the builder thread): a text with more entries
contributes more candidate negatives. Noted alongside the near-verbatim-shared-passage residual and
the Talmud-Aramaic cross-language negatives, all to be documented in `runs/original-<date>/README.md`.

## Net
No behavioral defect in iter-2; the implementation claude approved stands. The changes are test
strength (byte-exact prompts, the `cite_passage` boundary, a structural containment guard), one
docstring correction, and the verify_source citation-coherence fix that improves the committed
evidence before Phase 6. Full pipeline suite 348 passed.
