# Plan iteration 1 — rebuttal

Both reviewers returned **REQUEST_CHANGES / HIGH** and converged. claude read the
real seed code and corpora and found concrete load-bearing facts; codex found the
spec-mechanics gaps. I accepted essentially all of it — the findings are about
implementability against the real data and testability, not taste. The plan grew
from 7 to 8 phases (Phase 2 split per claude's "heaviest phase" note).

## Accepted and fixed

**1. `source.yaml` can't express the grouped layout** (codex #1, claude #1) —
BLOCKING. The tree is tradition-dir-per-folder with ~300 `(work,version,language)`
targets. → Phase 1 redesigned: `source.yaml` is a **`targets` manifest**
(`{payload glob, converter, work, version, language, document_type, tradition[],
license}`), one per tradition dir, globbed from `texts/raw/**/source.yaml`; plus a
stated **common converter interface** `convert_target(paths, target) ->
list[Document]` (the seed's two converters are adapted to it in Phase 2).

**2. `.gitignore` blocks the committed files** (codex #2, claude #5). `runs/`,
`texts/standardized/`, `texts/raw/Greek Orthodox/`, `configs/models.yaml` are
ignored. → Phase 1 adds negation rules (mirroring the existing
`codev/state/*_thread.md` precedent) so every `source.yaml` commits — including
under Greek Orthodox — while payloads/standardized stay ignored; Phase 8 adds the
evidence-path negation. Run config follows the existing `configs/models.example.yaml`
committed + `configs/models.yaml` ignored convention.

**3. Talmud HTML markup + daf offset + empty sections** (claude #2). Verified:
`sectionNames:['Daf','Line']`, sections 0–1 empty (start at 2a), `<strong>`/`<b>`
in text. → Phase 3 strips markup **in the converter** (standardized text = EXACT
clean text), applies the 2a offset, skips empties; the internal `CC-BY-NC` is
recorded in `license_detail`.

**4. Non-Latin normalization + unstated run scope** (claude #3). Quran/hadith
Arabic-only, Talmud-he Aramaic. → Phase 8's first run is **English-only**
`retrieve_quote` (defensible narrowing, loop-closure over breadth); Phase 6 keeps
`normalize()` Latin-centric for v1 and defers Arabic/Hebrew normalization to
follow-on, stated explicitly.

**5. Duplicate `(work,version,language)`** — LDS KJV == Protestant KJV
byte-identical (claude #4). → Phase 4 merges colliding targets with the
**tradition union** + a dedup key (citation+text); Phase 5 extends the overlap
exclusion to `identify_version` (shared-wording items excluded, not scored as
noise); counts in Phases 5–6 are no longer distorted.

**6. No `collect` coverage; resume underspecified** (codex #4, #6, claude #6). →
Phase 5 binds a **question-set digest** through `generate`→`collect`→`score`
(resume refused on mismatch) and adds `test_collect.py`: dead-key cell stays
pending → non-zero exit → fixed re-run fills exactly the missing cells; plus a
digest-mismatch refusal — behind a **fake provider**, keeping the live smoke for
the real path.

**7. Tradition balancing missing** (codex #3). → Phase 5 adds configurable
per-task quotas, negative ratio, a tradition-balancing selection, and fail-fast
insufficient-pool behavior, with tests.

**8. Copyright mitigation was only a statement** (codex #7). → Phase 8 adds
`audit.py`, a committed automated check wired into the test gate that fails if any
committed standardized/evidence artifact maps to a `restricted` entry or contains
restricted text; tested with injected restricted text.

**9. Phase 7/8 providers + one-command demo** (codex #5). → Phase 8 panel is **≥3
models / ≥2 providers** (was "≥2 providers"); the one-command committed-corpus demo
is the `TUTORIAL.md` path, run from a fresh clone.

**10. Exporter round-trip semantics** (codex #8, claude #4). → Phase 4 states the
canonical ordering, the dedup key, and that the round-trip is **semantic
reconstruction** of (source metadata + ordered entries), not original-file
reproduction.

**11. `generate`'s restricted gate undefined** (claude #8). → Phase 1 states the
standardized-path convention (`texts/standardized/<source-id>/` mirrors raw), so
`generate` recovers a document's catalogue entry (and `license`) by path — the
interchange `Document` format stays unchanged.

**12. No pricing for usage/cost** (claude #7). → Phase 8 reports **token totals**
from recorded `usage`; a cost is computed only if per-model price is supplied in
the run config — no invented prices.

**13. Smaller notes** (claude). → Phase 2 **split** (2 = English bible_flat/
lds_nested the run needs; 3 = Quran/hadith/Talmud) to decouple loop closure from
the hardest converters; `score_file._overall` now accumulates **raw counts** (not
the lossy `round(accuracy*n)`); Phase 7's dependency noted as softer (buildable
against a fixture in parallel).

## Disagreements

None of substance. One scoping choice rather than a disagreement: the first
benchmark run is deliberately **English-only `retrieve_quote`**, which bounds
Phase 6's normalization scope and honors the human's loop-closure-over-breadth
direction; Arabic/Hebrew scoring normalization and the other five tasks at scale
are follow-on, not dropped.
