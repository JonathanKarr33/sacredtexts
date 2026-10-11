# Phase 6 implementation — review dispositions (iter 2)

**codex REQUEST_CHANGES / HIGH** (two items), **claude COMMENT / HIGH** (all three
iter-1 blockers genuinely fixed; per-task contract + list-valued tradition
aggregation correct and well tested; remaining notes are follow-ups on tasks
outside Phase 8's run). Accepted both of codex's. No disputes.

## Accepted and fixed

**1. Hadith-shape citation hedges weren't caught (codex #1).** Hadith citations
have no colon (`Sahih al-Bukhari 1`), so the span extractor found zero candidates
and `"Sahih al-Bukhari 1 or Sahih Muslim 2"` passed via boundary equality. Added a
**number-only citation span** (`_NUM_CITE`: ≥1 capitalized leading word + a terminal
number, guarded so it never double-counts a `chapter:verse`). Now that hedge is two
candidates → 0, while a single `Sahih al-Bukhari 1` stays 1. Test added. (Arabic
*text* normalization remains the stated follow-on; the citation scoring contract now
covers every generated shape.)

**2. Missing/failed cells now representable (codex #2).** `score_file` accepts an
optional `expected` roster — `{(model_id, task): count}` — and the `score` CLI
builds it from `--questions` + `--config` (the panel × question set). With it, each
cell reports `expected_n` and `missing`, a partially-answered model shows its
shortfall, and a model whose cells **all** failed still appears (`n=0`, everything
missing) rather than vanishing; the markdown renders `miss N`. Without the roster,
behavior is unchanged (scores what's present). Test covers partial- and
fully-missing cells.

129 tests pass.

## Non-blocking (claude) — status

claude's remaining notes were measurement-validity follow-ups on tasks the first
run doesn't exercise (English `retrieve_quote`): citation word-order sensitivity
(`"Paragraph 5 of Rerum Novarum"` vs the canonical form) and Arabic text
normalization — both already recorded as stated follow-on scope. `n_candidates`
(auditability) and `score --summary-md` (Phase 8 evidence) landed in iter 1.

## Disagreements

None.
