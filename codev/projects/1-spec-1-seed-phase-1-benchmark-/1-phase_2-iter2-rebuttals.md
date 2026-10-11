# Phase 2 implementation — review dispositions (iter 2)

**codex APPROVE / HIGH**, **claude REQUEST_CHANGES / HIGH**. codex confirmed all
iter-1 fixes landed and tested. claude re-verified them too, then found a genuine
deeper defect in my iter-1 encyclicals fix — and the data proves claude right. I
accepted it in full (no disputes).

## Accepted and fixed

**My iter-1 encyclicals "fix" was wrong (claude, blocking).** I had replaced the
colliding `paragraph` field with a positional index, arguing "50/201 files have
duplicate *non-null* numbers, so no number-preserving rule is collision-free."
That inference was wrong. claude showed the collisions are entirely **body-vs-footnote**:
each file is body prose followed by a footnote block whose numbering **restarts**
(a declared number ≤ the running body max). I verified this against the data —
`aeterni-patris` body peaks at 34, then a footnote block starts at 5. Splitting at
the restart yields unique body numbers in **201/201** docs. My positional fix had
two real consequences, both inflating the headline hallucination metric the FAccT
paper reports:

1. Citations diverged from the true declared number wherever unnumbered front
   matter preceded the body (e.g. `Ad Petri Cathedram`: 2 null paragraphs, then
   declared #2 — positional called it `para. 3`), so `retrieve_quote`/`cite_passage`
   ground truth was non-canonical in 141/201 docs.
2. 662 bibliographic footnotes (6.1%) were emitted as `unit_type="paragraph"`
   prose.

This is the same class of defect as the iter-1 heading-as-verse bug, and exactly
the project's "derive the format from the real data, not a summary statistic"
lesson. Fix: `convert_encyclicals` now detects the footnote block at the numbering
restart and **skips it**; body paragraphs are cited by their **declared** number
(`{title}, para. {n}`, unique across the body); null-numbered body paragraphs
(front matter) get an explicitly non-canonical `{title}, unnumbered para. {k}`
citation so Phase 5 `generate` can exclude them from citation-dependent tasks.

Verified against the real data: 201 docs / **10263** body entries (was 10925 with
footnotes); `Ad Petri Cathedram, para. 2` now carries declared-#2 text ("For these
reflections of Ours…"), the front matter is `unnumbered para. 1/2`, and the
`aeterni-patris` footnote ("De Trinitate … PL 42 …") is absent. All validate-passing,
all citations unique.

**Test gap closed (claude).** The old `test_convert_encyclicals_real` asserted only
uniqueness, which positional indexing satisfied by construction. Added
`test_convert_encyclicals_citations_bind_to_declared_numbers`: asserts the declared
number binding on `Ad Petri Cathedram` (the positional-offset case), the
non-canonical front-matter marker, and footnote exclusion on `Aeterni Patris`. The
synthetic `test_convert_encyclicals` now also exercises the null→`unnumbered`
path.

## Noted / deferred

- **`cli.convert` `len(docs) == len(paths)` stem heuristic** (claude minor, "not
  urgent"; deferral reason accepted by claude). Returning `(stem, doc)` from
  converters is the clean fix; deferred to Phase 3, where converter signatures are
  already in flux (Arabic/Talmud). The `index.json` filter is latent-only (glob is
  `encyclicals/en/*.json`).
- **Phase 5 note**: `generate` must treat `unnumbered para.` citations as
  non-canonical (exclude from `cite_passage`/citation-keyed `retrieve_quote`).

## Disagreements

None. (codex APPROVE carried no change requests.)
