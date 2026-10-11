# Phase 2 implementation — review dispositions (iter 3)

**codex APPROVE / HIGH**, **claude REQUEST_CHANGES / HIGH**. claude found a real
regression in my iter-2 footnote-restart heuristic and I accepted it in full. The
fix is a design change (lossless conversion) rather than a patch to the heuristic,
for reasons claude's own analysis supports.

## Accepted — and the fix

**My iter-2 footnote-restart heuristic silently truncated 4 encyclicals mid-body
(claude, blocking).** The latched rule (`num <= running_max → in_footnotes`, to
EOF) fired on the *first* non-monotonic number. In 4 documents that anomaly is
in-body — a typo'd paragraph number (`mediator-dei` idx 105 declares 100;
`ecclesiam-suam` idx 99 declares 3) or a numbered section heading
(`redemptoris-mater`, `dominum-et-vivificantem`) — so ~347 genuine body paragraphs
were dropped silently (over half of Mediator Dei and Ecclesiam Suam). claude
showed a purely numeric single-signal rule cannot separate footnotes from body
(its tightened variant still truncated `ecclesiam-suam`).

**Fix: conversion is now LOSSLESS.** Every non-empty paragraph is kept. A
paragraph is cited by its declared number (`para. {n}`); an unnumbered one by a
non-canonical `unnumbered para. {k}`; a *repeated* declared number (footnote
restart, in-body typo, or numbered heading) is disambiguated with a `(dup N)`
suffix instead of being dropped. Citations stay unique (verified by
`_require_unique_citations`), nothing is silently discarded, and the declared
number is preserved for the canonical (first) occurrence.

Why lossless rather than a better footnote classifier:

1. **It fixes claude's three blocking concerns directly** — no silent loss, no
   untested truncation, and the standardized corpus is complete, which claude's
   own point #3 requires (Phase 5's "negative text also occurs in the attributed
   work" exclusion is evaluated against the corpus; missing text breaks it).
2. **Robustly classifying footnotes is a generation concern, not a conversion
   one.** claude established that no reliable numeric rule exists and that
   text-shape signals would need per-document calibration across 201 files.
   Conversion should faithfully represent the source; *which* units become
   benchmark questions (excluding footnotes and `unnumbered para.` front matter)
   is Phase 5's generation policy, where a text-shape heuristic can be applied
   without risking data loss. Noted for Phase 5.

Verified against the real data: 201 docs / **10925** entries (no truncation);
`Ad Petri Cathedram, para. 2` carries declared-#2 text; `Mediator Dei, para. 210`
and `Ecclesiam Suam, para. 119` are retained; the in-body duplicate
`Mediator Dei, para. 100` is kept as `… (dup 2)`. All validate-passing; all
citations unique. The real-data test now asserts the no-truncation cases and the
`(dup N)` disambiguation (the earlier test's aggregate properties were satisfied
*by* the truncation — the same trap as iter-1/iter-2, now closed with
document-specific assertions).

**Minor (claude): `num` int guard.** Added — a non-int `paragraph` now raises a
file-naming `ConvertError` instead of `TypeError`.

## Noted for Phase 5

- `generate` must exclude bibliographic footnotes and `unnumbered para.` front
  matter from citation-dependent tasks (and ideally all tasks). The footnote block
  is identifiable at generation by the declared-number restart plus text shape
  (short bibliographic strings); `(dup N)` and `unnumbered para.` citations mark
  the non-canonical units explicitly.

## Noted / deferred

- `cli.convert` `len(docs) == len(paths)` stem heuristic (claude minor, deferral
  accepted again) — the `(stem, doc)` refactor lands with the Phase 3 converter
  signatures.

## Disagreements

None. (codex APPROVE carried no change requests.)
