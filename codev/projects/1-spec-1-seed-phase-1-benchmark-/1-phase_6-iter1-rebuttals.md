# Phase 6 implementation — review rebuttal (iter 1)

Both reviewers **REQUEST_CHANGES / HIGH** and converged: the tradition aggregation
and raw-count overall are right (claude verified the list-valued rule and the
sum-above-overall assertion), but the per-task contract — the point of the phase —
wasn't fully met. Accepted all blocking items. No disputes.

## Accepted and fixed

**1. Anti-hedge was numeric-only + containment (both, blocking).** `_citation_candidates`
keyed on the numeric token only, and correctness used raw containment, so
`"could be John 1:1, Genesis 1:1, or Micah 1:1"` scored 1 (claude verified) and
`"Jude 1:30"` matched `Jude 1:3` by substring (codex). Fixed to the spec's literal
rule — "the single extracted citation equals ground truth": candidates are now
**full spans** (leading work/book words + the numeric/para token), so a cross-book
hedge is >1 candidate → 0; and correctness is **boundary-aware equality**
(`(?<!\w)…(?!\w)`), not containment, so `Jude 1:30` ≠ `Jude 1:3`. Tests cover the
cross-book hedge, the disjunction, and the near-miss.

**2. `identify_version` used containment, not the table's label metrics (both,
blocking).** `"KJV or WEB"` and `"not the KJV; it is the ASV"` both scored 1 on a
task Phase 5 made live for the Bible. Now graded on the **label** per the spec
table: `exact` (raw equality) and `normalized` (normalized equality), with
`correct = normalized`, so an evasive or multi-label answer scores 0. The summary
now reports each task's declared sub-metrics (identify_version shows exact /
normalized).

**3. Missing/failed cells (both).** Documented the boundary in `score_file`:
scoring sees only successful rows; a model missing some cells shows its real `n`
and renders `—` for absent tasks (test added — two models each missing the other's
task → `—`), while a model whose cells ALL failed is surfaced by `collect`'s
non-zero exit and failure list, never silently reported complete. (A full panel
roster isn't available to `score`, which reads only `answers.jsonl`.)

## Non-blocking (claude comments) — addressed

- **Auditability**: `cite_passage`/`identify_source` metrics now include
  `n_candidates` (the extracted-candidate count), so the anti-hedge veto is
  inspectable (and useful to Phase 7's viewer).
- **Phase 8 evidence**: `score --summary-md <path>` now writes the markdown summary
  (incl. the tradition breakdown) to a file, so Phase 8 commits it without a
  copy-paste.
- **Known limitation (noted)**: boundary-aware equality requires the canonical
  citation form, so `"Paragraph 5 of Rerum Novarum"` scores 0 for expected
  `"Rerum Novarum, para. 5"` (word order), and number-only citations (hadith) are
  not span-extracted — consistent with the stated English-first, Arabic-follow-on
  scope.

127 tests pass; real smoke confirmed (hedge → 0, single → 1; tradition table).

## Disagreements

None.
