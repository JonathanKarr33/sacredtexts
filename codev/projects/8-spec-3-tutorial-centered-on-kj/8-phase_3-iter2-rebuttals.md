# Phase 3 — Iteration 2 rebuttals

**Codex: REQUEST_CHANGES / HIGH** (one precise README-wording issue). **Claude: output
truncated** — its consult transcript cut off mid-analysis before a final verdict block, but its
narration reached the *same* finding as codex ("All 9 are the same āyah in a different Uthmani
encoding"; "Iteration 1 used a different denominator — 'regressions', not 'misses'"). I treat
both as the same single issue and **accept it**. All other Phase-3 criteria were re-confirmed
green by both (reproducible digest, 400 complete cells, four distinct unpriced secret-free panel
identities, 226 web-search requests, three scripts, attribution + fair-use note, clean origin
audit, 195 tests).

## Blocking (codex + claude): the "exactly one orthographic miss" sentence mixed denominators — ACCEPTED, fixed (doc-only)

My iteration-1 fix wrote: *"Exactly one search-on Qur'an miss is a genuine text/orthographic
difference; the rest are wrappers."* That took claude's iteration-1 figure — which was scoped to
the narrow **off-correct→on-wrong regression subset** (11 questions: 10 wrappers + 1 genuine
difference) — and wrongly applied it to **all** of haiku-search's Qur'an headline misses. Codex
flagged the denominator switch exactly; claude's transcript independently reached it.

I recomputed the aggregate from the committed artifacts (repo `normalize`):

- **haiku-search Qur'an: 21 headline misses = 12 wrappers** (contain the exact reference) **+ 9
  orthographic/encoding variants.** The 9 are the correct āyah in a different Uthmani encoding
  that `normalize` does not fold to exact equality (5 are pure Arabic, `token_f1` 0.69–0.95;
  the other 4 also carry English prose) — **none are wrong scripture.**
- The orthographic near-miss is **not** a web-search artifact: all **14** of haiku-*off*'s own
  Qur'an misses are the same non-exact encoding variants, with **zero** wrappers. So search-off
  actually has *more* encoding-variant misses than search-on; web search's distinctive effect is
  the wrapper, confirming the central finding.

**Fix (doc-only — no re-collect / re-score / code change / spend):** rewrote the Qur'an bullet to
report the aggregate split (12 wrappers + 9 encoding variants), to state the encoding variants are
not fabrications, to note search-off shows the same variants, and to **explicitly scope** the
"exactly one" figure to the 11-question regression subset. The contains-exact table, the
20-wrapped-cells asymmetry, and the Talmud 8/34-vs-0/34 lift — which both reviewers recomputed and
confirmed — are unchanged.

## Also from claude (completed verdict): two further points — both accepted

Claude's full iter-2 verdict landed REQUEST_CHANGES/HIGH, converging with codex on the
denominator issue above, plus:

- **Line 53 overstatement — fixed.** "The mechanism is not orthography and not fabrication" was
  accurate for the 20 wrapped cells but read as a blanket claim; the 9 non-containing Qur'an
  misses *are* encoding variants. Scoped the sentence to "for these 20 cells … (they contain the
  exact reference by definition)".
- **Record the web-retrieved encoding-variance gap as future work — done.** Noted in the builder
  thread carry-forward for the ASPIR review doc (`codev/reviews/8-*.md`): a search-enabled model
  can return the correct āyah in a different Uthmani Unicode encoding (U+06E1 vs U+0652, Arabic
  Extended-A tanwin U+08F0–08F2, U+0657, yeh/alef-maksura) that `normalize` does not fold to
  exact equality (`token_f1` up to 0.95). A future refinement could fold these or add a
  pipeline-level `contains_reference` submetric — deliberately **not** done here (spec req 4: it
  would reshape `scores.jsonl` and break the byte-for-byte re-score regressions).

**Count note:** claude's verdict says "22 misses = 13 wrappers + 9"; codex and my own recompute
both get **21 = 12 wrappers + 9** (haiku-search Qur'an `correct` = 12 of 33 → 21 misses). I used
the verified 12/21 figures, which are recomputable from the committed `answers.jsonl` +
`scores.jsonl`.

## Net

One genuine, precise wording defect in a committed public deliverable, fixed to match the
aggregate data with the regression-subset figure properly scoped. No scoring-contract change
(`_SUBMETRICS` / headline untouched, spec req 4), no spend. 195 tests still pass.
