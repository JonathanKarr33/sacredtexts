# Phase 6 implementation — review dispositions (iter 3)

**Both REQUEST_CHANGES / HIGH**, converged. claude caught that my iter-2 `_NUM_CITE`
addition *regressed* correct single citations into false hedges, and that the
all-lowercase hedge it raised in iter 2 was still live (and that I dropped that
comment without a recorded disposition — fair; I disposition every item below).
Accepted all. 132 tests pass.

## Accepted and fixed

**1. iter-2 `_NUM_CITE` regressed correct answers + lowercase hole (claude #1/#2,
codex #2).** Applying all three span extractors to every task meant an incidental
`(ASV 1901)` or `Chapter 1` counted as a second candidate, so a correct single
citation scored 0; and the case-sensitive prefix let all-lowercase hedges collapse
to one candidate and pass. Applied claude's verified fix: the extractor is chosen
by the **ground-truth citation's shape** (`:` → colon, `para` → para, else
number-only), and the prefix is **case-insensitive**. Now `Jude 1:3 (ASV 1901)` and
`… Chapter 1` → 1 (correct), `it could be john 1:1 or genesis 1:1` → 0,
`perhaps sahih al-bukhari 1, or sahih muslim 2` → 0. All three cases added as
regression tests; every prior case still passes.

**2. Missing/failed cells absent from the tradition breakdown (codex #1).** iter-2's
roster was `(model, task)` only, so a fully-failed `model × tradition × task` cell
vanished from `by_tradition`. Added a tradition-aware roster
(`expected_tradition`), built by the CLI from questions × panel × listed
traditions; the tradition table now reports `expected_n`/`missing` and shows a
fully-failed tradition cell (`miss N`). Test added; CLI smoke confirms it.

## Non-blocking (claude) — explicit dispositions

- **Fully-missing renders `0%`** → FIXED: `n==0` cells carry `accuracy: null` and
  render `n/a` (markdown + JSON), not a 0% score.
- **`identify_version` label strictness (`"ASV"` vs `"ASV (1901)"`)** → ACCEPTED
  LIMITATION. The contract (spec table: exact/normalized on the label) is
  implemented faithfully; the short-vs-full-label gap is prompt/catalogue-side. The
  first run is English `retrieve_quote` and does not report identify_version, so
  this is deferred — any identify_version number must be read with the
  exact-label requirement in mind. (Recorded, not overlooked.)
- **`.get(...).get(...).get("tradition", []) or []` degrades silently** → KEPT
  intentionally: a row without `source.tradition` (e.g. a hand-built/legacy row)
  simply contributes no tradition breakdown rather than failing the whole score
  run; the scoring fields themselves (`question.expected`) are still fail-fast
  via `score_answer`.

## Disagreements

None.
