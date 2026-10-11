# Phase 6 implementation — review dispositions (iter 4)

**codex COMMENT / HIGH** (meets scoring, anti-hedge, raw-count, tradition, and
missing-cell requirements with strong regression coverage). **claude REQUEST_CHANGES
/ HIGH** — one remaining extractor hole: the para branch collapsed hedges and had
no test coverage. Accepted. 133 tests pass.

## Accepted and fixed

**1. `_PARA_CITE` collapsed encyclical hedges (claude, blocking).** The greedy
prefix could swallow an earlier `para. N` as prefix words, so
`"Rerum Novarum, para. 5 or Rerum Novarum, para. 6"` was one candidate and scored
1. Applied claude's verified fix — a `(?![Pp]ara)` guard on each prefix word, so
every `para. N` is its own candidate. Material: all 201 encyclicals / ~10.9k
entries cite as `{title}, para. {n}`.

**2. Zero para-shape tests (claude, blocking root cause).** The para branch was
entirely uncovered (deleting it broke no test), which is why the hole survived two
hedge-hunting rounds. Added both-direction para regression tests: a single correct
`Rerum Novarum, para. 5` → 1; two para hedges → 0.

**3. README (claude non-blocking).** Documented the per-task contract, the tradition
breakdown, and the new `--summary-md` / `--questions`+`--config` roster flags in the
score step, since Phases 7–8 consume them.

## Non-blocking — disposition

- **`identify_source` work-field hedge passes (claude, new direction).**
  `work_found` uses containment, so `"The Bible or the Quran, John 1:1."` scores
  `correct=1` (the citation is a single correct candidate; only the WORK is hedged).
  ACCEPTED as a low-priority limitation: the citation field is already anti-hedged
  (the usual gaming vector), `work_found` is reported separately so the hedge is
  auditable, and robust work-name candidate extraction is not tractable the way
  citation shapes are. The first run is `retrieve_quote` and does not report
  identify_source. Recorded, not overlooked.

## Disagreements

None.
