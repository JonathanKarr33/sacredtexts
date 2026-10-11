# Phase 2 implementation — review rebuttal (iter 1)

Both reviewers returned **REQUEST_CHANGES / HIGH** and converged, each verifying
against the real committed corpora. The findings are genuine data-correctness and
benchmark-validity defects — I accepted all of them. claude also re-confirmed (and
I preserved) the LDS-KJV version-label decision: the plan's "byte-identical"
premise is false (2168 text differences, 117 citation keys unique per side), so
`KJV (LDS 2013 edition)` is correct and must not be merged back.

## Accepted and fixed

**1. `lds_nested` emitted editorial chapter headings as scripture verses
(claude #1).** BLOCKING validity defect. The Book of Mormon has chapter-level
`heading` keys (15 of them, e.g. `Mosiah 9:heading`) whose values are 2013-edition
editorial summaries; my 3-level branch stripped only the *book*-level heading and
emitted these as `unit_type="verse"`. The test locked the wrong count
(6619 = 6604 + 15). Verified against the data: skipping the chapter-level
`heading` key yields the canonical **6604**, and `heading` is the only non-digit
verse key. Fixed: the 3-level branch now skips `heading`; the test asserts 6604
and that no citation ends in `heading`.

**2. `encyclicals` produced duplicate, ambiguous citations (claude #2, codex #3).**
BLOCKING. 3023 real paragraphs have `paragraph: null`, and the positional fallback
`str(i)` collided with explicit numbers. I checked the data directly: **50 of 201
files even have duplicate *non-null* paragraph numbers**, so no number-preserving
rule is collision-free. Fixed: cite by **stable 1-based position in the document**
(`para. {i}`), which is unique by construction, and verified 201 docs / 10925
entries convert with zero duplicate-citation errors. The spec's deliverable
"confirm `encyclicals` against the committed shape" is now met by a real-data test
(count, unit_type, per-document citation uniqueness, validate-passing).

**3. D&C citations omitted the work (claude #3).** The 2-level branch emitted a
bare `1:1`, not self-identifying, and `generate` uses the citation verbatim as
ground truth. Fixed: the 2-level citation now prefixes the work →
`Doctrine and Covenants 1:1`.

**4. Converters raised `AttributeError` instead of a file-naming `ConvertError`
(codex #1, claude minor).** `convert_encyclicals`/`convert_nabre` called `.get()`
on values not yet checked to be objects. Fixed: `isinstance(data, dict)` guards at
the top of each per-file loop, plus per-paragraph / per-chapter / per-verse object
guards, all raising `ConvertError` naming the file. Tests feed a top-level list /
scalar and assert the file is named.

**5. `_lds_entries` silently dropped any non-dict top-level value (codex #2).** It
skipped *every* scalar, not just metadata, so a malformed book could vanish while
conversion "succeeded." Fixed: skip only the known `{last_modified, version}`
(verified to be the only scalar top-level keys across all five files); any other
non-object top-level key now raises `ConvertError`. Test covers an unexpected
scalar book.

**6. Shared citation-uniqueness post-condition (claude's suggestion).** Added
`_require_unique_citations(entries, where)` and call it in all four converters, so
a duplicate citation fails fast naming the file+citation — it caught #2 and guards
Phase 3 (the Talmud daf-offset hazard). Test covers a forced duplicate.

Real-data verification after the fixes: KJV/ASV = 31102, WEB = 31098; BoM = 6604
(no `:heading`); D&C = 3654 (`Doctrine and Covenants 1:1`); Pearl = 635 (metadata
skipped); LDS OT 23145 + NT 7957; encyclicals 201 docs / 10925 entries — all
`validate`-passing, all citations unique per document. 69 tests pass.

## Noted / deferred (with reasons)

- **`cli.convert` filename heuristic `len(docs) == len(paths)` (claude minor,
  "not urgent").** Correct for all four current converters. Having converters
  return `(stem, doc)` would remove the heuristic cleanly; deferred to a later
  phase to avoid churning the converter signatures again mid-phase. Noted in the
  thread for Phase 3.

## Disagreements

None.
