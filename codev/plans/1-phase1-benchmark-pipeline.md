# Plan: Sacred Texts Benchmark — Phase 1 pipeline

**Specification**: [codev/specs/1-phase1-benchmark-pipeline.md](../specs/1-phase1-benchmark-pipeline.md)

## Executive Summary

The spec's recommended approach (Approach 1: two-tier `texts/` + staged JSONL
pipeline) is already seeded — PR #1 shipped `pipelines/sacredbench`
(`schema`/`convert`/`validate`/`generate`/`collect`/`score`, ~1370 LOC incl.
tests, 25 passing) and the working group's real raw corpora (7 traditions) have
landed in `texts/raw/`. This plan implements the **delta** between that seed and
the approved spec, and closes the human's headline requirement: **the full
end-to-end flow working on real data, narrow but complete** (loop-closure over
breadth).

The two consultations (codex + claude, both HIGH) verified the plan against the
real data and surfaced load-bearing facts now folded in: the committed tree is
**tradition-dir-per-folder holding many works/versions** (~300 `(work, version,
language)` targets), so the catalogue is a **`targets` list**, not one record per
source; Talmud `text` carries **HTML markup, a 2a daf offset, and empty leading
sections**; Quran/hadith are **Arabic-only** and Talmud-he Aramaic, so the first
run narrows to **English corpora**; LDS KJV duplicates Protestant KJV
**byte-for-byte**; and `runs/`, `texts/standardized/`, `texts/raw/Greek Orthodox/`,
`configs/models.yaml` are **gitignored**, so committing catalogue/evidence files
needs precise negation rules.

The delta, in dependency order: (1) a committed `source.yaml` **targets**
catalogue with a `license` field, `.gitignore` reachability, and a
standardized-path convention that lets `generate` recover a doc's license; (2–3)
converters for the committed shapes, split so the English corpora the first run
needs land before the hardest (Arabic/Talmud); (4) the interchange exporter +
meaningful round-trip; (5) deterministic, version-gated, tradition-balanced
generation with a resume-guarded, tested collection; (6) the per-task scoring
contract (single-candidate, anti-hedge) + tradition-aware analysis + English
normalization; (7) a minimal local results view; (8) the first real benchmark run
(~100 seeded English `retrieve_quote` questions, ≥3 models / ≥2 providers) with
committed copyright-audited evidence, tied together by a `TUTORIAL.md` verified on
a fresh clone.

Each phase is one atomic commit on a single branch / one PR; the PR opens during
or after Phase 8.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Source catalogue, license gating, and gitignore reachability"},
    {"id": "phase_2", "title": "Converters for the English corpora (loop-critical)"},
    {"id": "phase_3", "title": "Converters for the Arabic and Talmud corpora"},
    {"id": "phase_4", "title": "Interchange exporter and round-trip guarantee"},
    {"id": "phase_5", "title": "Deterministic, version-gated, balanced generation with resume-guarded collection"},
    {"id": "phase_6", "title": "Per-task scoring contract and tradition-aware analysis"},
    {"id": "phase_7", "title": "Minimal local results view"},
    {"id": "phase_8", "title": "First benchmark run and TUTORIAL walkthrough"}
  ]
}
```

## Phase Breakdown

### Phase 1: Source catalogue, license gating, and gitignore reachability

**Dependencies**: None

#### Objective

Make `source.yaml` the single provenance/licensing control point, expressible
against the real grouped tree, and routable by `convert`/`generate` with
`restricted` sources excluded by default. Every later phase reads the catalogue.

#### Design decisions (resolving the consult)

- **`source.yaml` is a `targets` manifest, not one flat record.** One committed
  `source.yaml` per tradition directory (discovered by globbing
  `texts/raw/**/source.yaml`), with shared provenance plus a `targets:` list; each
  target = `{payload (glob, relative to the yaml), converter, work, version,
  language, document_type, tradition[], license, license_detail?}`. This expresses
  KJV/ASV/WEB (3 targets), Sunni (Quran + 9 hadith = 10), LDS (5), Talmud (1
  target, many shard files via glob), Roman Catholic (encyclicals + restricted
  NABRE), Greek Orthodox (restricted). Converters may still derive per-document
  metadata from the data (Talmud/encyclical files carry title/version/language).
- **`license`** is the 3-value gate (`public-domain` / `open` / `restricted`);
  the real upstream license string (e.g. the Talmud files' internal `CC-BY-NC`)
  is recorded verbatim in `license_detail` and mapped to the enum deliberately.
- **Standardized-path convention**: converters write to
  `texts/standardized/<source-id>/…` mirroring `texts/raw/<source-id>`, so
  `generate` recovers a standardized document's catalogue entry (hence its
  `license`) by path — the `Document`/interchange format stays unchanged.
- **`.gitignore` reachability** (mirroring the existing `codev/state/*_thread.md`
  negation): add rules so `texts/raw/**/source.yaml` is committable — including
  under the wholesale-ignored `texts/raw/Greek Orthodox/` (change it to ignore
  payloads but re-include the dir + its `source.yaml`) — while all restricted
  **payloads** and all `texts/standardized/` stay ignored.

#### Files to Create / Modify

- Create `pipelines/sacredbench/catalogue.py` — `source.yaml` (targets) schema +
  loader + `texts/raw/**/source.yaml` discovery; fail-fast on unknown `license`,
  bad target, or missing field; license→standardized-path mapping helper.
- Create one `texts/raw/<Tradition>/source.yaml` per landed tradition (incl. the
  restricted NABRE target and a `texts/raw/Greek Orthodox/source.yaml` whose
  payload is absent).
- Modify `.gitignore` — the negation rules above.
- Modify `pipelines/sacredbench/cli.py` — `convert`/`generate` consult the
  catalogue and skip `restricted` targets unless `--include-restricted`;
  `validate` is unaffected by `license`.
- Modify `pipelines/README.md` — document the catalogue, the restricted flag, and
  the standardized-path convention.

#### Deliverables

- [ ] `catalogue.py` (targets schema + loader + discovery + path/license mapping).
- [ ] Committed `source.yaml` for all 7 landed traditions, restricted targets included.
- [ ] `.gitignore` lets every `source.yaml` commit while payloads/standardized stay ignored.
- [ ] `--include-restricted` opt-in; default excludes restricted; `validate` ignores license.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] A malformed/unknown-`license` target fails loudly naming the file+target.
- [ ] `git check-ignore` confirms each committed `source.yaml` is tracked and every
      restricted payload + `texts/standardized/` is ignored.
- [ ] Default `convert`/`generate` selects no `restricted` target; `--include-restricted` includes them.
- [ ] Build and tests pass via `.codev/checks/test.sh`.

#### Test Plan

- Unit: catalogue load (valid/invalid/unknown-license), discovery over a fixture
  tree, target selection default-exclude vs `--include-restricted`, path→license
  recovery; a `git check-ignore` assertion for the negation rules.

### Phase 2: Converters for the English corpora (loop-critical)

**Dependencies**: Phase 1

#### Objective

Convert the English corpora the first benchmark run needs — Protestant Bibles and
LDS editions — plus confirm the existing `encyclicals` converter against the
committed shape. These are the loop-critical converters; the hardest (Arabic,
Talmud) are isolated in Phase 3.

#### Design decisions

- **Common converter interface.** The seed's converters have incompatible
  signatures (`convert_nabre(paths, tradition, version, work, …)` vs
  `convert_encyclicals(paths, tradition)`). Introduce one dispatch contract —
  `convert_target(paths, target) -> list[Document]` — and adapt the existing two
  to it so the catalogue drives all converters uniformly.

#### Files to Create / Modify

- Modify `pipelines/sacredbench/convert.py` — add, registered in `CONVERTERS`:
  - `bible_flat` — Protestant KJV/ASV/WEB flat list `{book, chapter, verse,
    text}` → one scripture document per version (citations `<Book> c:v`).
  - `lds_nested` — `{book: {heading, chapter: {verse: text}}}` → one document per
    work (Book of Mormon, D&C, Pearl of Great Price, and the KJV OT/NT editions).
  - adapt `encyclicals` (already matches committed `en/*.json`) and `nabre`
    (restricted) to the common interface.

#### Deliverables

- [ ] `bible_flat`, `lds_nested` registered; `encyclicals`/`nabre` adapted to the common interface.
- [ ] `convert` over the English targets writes documents that pass `validate`;
      KJV/ASV/WEB yield three versions of "The Bible".
- [ ] Per-converter tests against the **real committed source** (fixture for restricted NABRE shape).

#### Acceptance Criteria

- [ ] Each English source converts to `validate`-passing documents with correct
      citations/unit_type/exact text; a malformed shape raises `ConvertError` naming the file.
- [ ] Build and tests pass.

#### Test Plan

- Unit per converter: real committed input → expected entry count, sample
  citations, exact text; malformed-shape failure.

### Phase 3: Converters for the Arabic and Talmud corpora

**Dependencies**: Phase 1 (interface from Phase 2)

#### Objective

Convert the remaining committed shapes, each with real-data irregularities that
must be handled explicitly (the "derive from the real data" lesson).

#### Design decisions

- **`sefaria_talmud`**: `text` is a list of `[Daf][Line]` sections; **sections 0
  and 1 are empty** (tractates start at 2a) so index→citation is offset
  (`i → (i//2)+1` with `a`/`b` from parity) and empties are skipped; **HTML
  markup (`<strong>`, `<b>`, …) is stripped in the converter** so standardized
  `text` is the EXACT clean unit text the interchange contract promises (keeping
  markup would make normalized-exact scoring unachievable for every Talmud item).
  en and he are separate `version`s; the internal `CC-BY-NC` is recorded in
  `license_detail`.
- **`quran_qul`**: dict keyed `"surah:ayah"` → `{…, text}` (unit_type `ayah`,
  citation `surah:ayah`).
- **`hadith_sunnah`**: `{metadata, chapters[], hadiths[{idInBook, chapterId,
  bookId, arabic}]}` (unit_type `hadith`, citation from collection + number).

#### Files to Create / Modify

- Modify `pipelines/sacredbench/convert.py` — add `quran_qul`, `hadith_sunnah`,
  `sefaria_talmud` (with markup-strip + daf-offset + empty-skip), registered.

#### Deliverables

- [ ] Three converters registered; Talmud markup stripped, daf offset + empties handled.
- [ ] `convert` over these targets writes `validate`-passing documents.
- [ ] Per-converter tests against the real committed sources, incl. a Talmud case
      asserting a stripped-text, correctly-offset citation and skipped empties.

#### Acceptance Criteria

- [ ] Quran/hadith/Talmud convert to `validate`-passing documents; Talmud
      standardized `text` contains no HTML tags and citations start at `2a`.
- [ ] Build and tests pass.

#### Test Plan

- Unit per converter against real data; Talmud: markup-free text, `2a` first
  citation, empties skipped, en/he as distinct versions.

### Phase 4: Interchange exporter and round-trip guarantee

**Dependencies**: Phase 2

#### Objective

Assemble standardized documents of a work/version into the single group
interchange document, with a lossless **semantic** round-trip (the spec's
non-vacuous round-trip criterion).

#### Design decisions

- Round-trip is **semantic reconstruction** of (`source` metadata + ordered
  `entries`), not reproduction of original files (an assembled document carries no
  shard-boundary metadata). State the **canonical entry ordering** (by work's
  native unit order) and the **dedup key** (unit citation + text).
- **Colliding `(work, version, language)`** across sources (e.g. LDS KJV OT/NT is
  byte-identical to Protestant KJV) are **merged with the union of their
  `tradition` lists** (per the spec's many-to-many intent), deduped by the key
  above — stated so Phases 5–6 counts are not distorted.

#### Files to Create / Modify

- Create `pipelines/sacredbench/export.py` — assemble standardized docs of one
  `(work, version, language)` → one interchange document (ordered, deduped,
  tradition-union); inverse grouping for the round-trip check.
- Modify `cli.py` — add an `export` command.

#### Deliverables

- [ ] `export` assembles → one interchange document per `(work, version, language)`.
- [ ] Round-trip lossless on (`source` metadata + ordered `entries`); tradition union on collision.
- [ ] Tests incl. a genuinely multi-source/multi-shard work and a dedup case.

#### Acceptance Criteria

- [ ] Assemble-then-regroup reproduces metadata + ordered entries; ordering
      deterministic; duplicate (citation,text) removed; colliding versions merge with tradition union.
- [ ] Build and tests pass.

#### Test Plan

- Unit: multi-shard assemble/round-trip; KJV collision → one doc, unioned
  traditions; repeated entry deduped; stable order.

### Phase 5: Deterministic, version-gated, balanced generation with resume-guarded collection

**Dependencies**: Phases 2, 4

#### Objective

Bring generation to the spec's contract and make collection's resume provably
bound to the question set — including the dead-key/resume scenario the spec
requires but the seed never tested.

#### Design decisions

- **Version-gated `identify_version`** emitted only for works with ≥2 converted
  versions (live for the Bible via KJV/ASV/WEB), skipped otherwise.
- **Overlap exclusions** cover both hazards: a wrong-work `verify_source` negative
  whose text also occurs in the attributed work, **and** an `identify_version`
  item whose text is shared across the work's versions (a verse identical in KJV
  and ASV has two correct answers) — excluded, not scored as noise.
- **Stable content-derived IDs + deterministic ordering** (task + source
  coordinates + text hash).
- **Generation policy**: configurable per-task quotas, `verify_source` negative
  ratio, and a tradition-balancing selection over the (unbalanced) corpus, with
  defined insufficient-pool behavior (fail-fast naming the shortfall).
- **Run digest + resume guard**: `generate` writes a manifest (seed, config,
  input-corpus hash) and a **question-set digest**; the digest is stamped into
  `answers.jsonl` (row or header) so `collect` refuses to skip/append against a
  different question set, and `score` validates it — closing the stale/mixed-answer
  hole. Names changes to `generate.py`, `collect.py`, `cli.py`.

#### Files to Create / Modify

- Modify `pipelines/sacredbench/generate.py` — version gating, both overlap
  exclusions, content IDs/ordering, quotas/negative-ratio/tradition-balancing +
  insufficient-pool fail-fast, manifest + question-set digest.
- Modify `pipelines/sacredbench/collect.py` — bind the digest; refuse resume on
  mismatch.
- Create `pipelines/tests/test_collect.py` — resume semantics behind a **fake
  provider**: dead-key cell stays pending → non-zero exit → re-run fills exactly
  the missing cells once; digest-mismatch refusal.

#### Deliverables

- [ ] Version-gated generation; both overlap exclusions; stable content IDs/order.
- [ ] Configurable quotas/negative-ratio/tradition-balancing; insufficient-pool fail-fast.
- [ ] Manifest + question-set digest bound through collect and validated by score.
- [ ] `test_collect.py` covering failure/resume + digest mismatch; generation determinism tests.

#### Acceptance Criteria

- [ ] Same seed ⇒ identical `questions.jsonl` (IDs+order); corpus edit changes the
      hash and resume is refused; `identify_version` present for the Bible, absent for single-version works.
- [ ] A failed cell stays pending, the run exits non-zero, and a fixed re-run fills
      exactly the missing cells; a digest-mismatched `answers.jsonl` is refused.
- [ ] Build and tests pass.

#### Test Plan

- Unit: seed determinism, version-gate on/off, both overlap exclusions, balancing +
  insufficient-pool, manifest/digest write; collection failure/resume + mismatch (fake provider).

### Phase 6: Per-task scoring contract and tradition-aware analysis

**Dependencies**: Phase 5

#### Objective

Make `score.py` match the spec's per-task contract (notably single-candidate
extraction so a hedge cannot score correct) and add the per-model × task ×
**tradition** summary with the list-valued rule and explicit missing-cell handling.

#### Design decisions

- `cite_passage` / `identify_source`: extract a **single** citation candidate; a
  multi-candidate answer scores `correct`=0.
- Each task's applicable metrics match the spec table; `_overall` accumulates
  **raw counts** (not the current lossy `round(accuracy*n)` reconstruction).
- Aggregation gains a **tradition** dimension: each observation counts once per
  listed tradition (per-tradition `n` can exceed the overall count); overall counts
  each observation once; missing/failed cells represented, not dropped.
- **English-corpus normalization** is the v1 scope: the first run's
  `retrieve_quote` is **English-only**, so `normalize()` stays Latin-centric;
  Arabic (alef/yeh/tatweel/tashkeel) and Hebrew/Aramaic (nikud) normalization are
  explicitly **follow-on** (stated so the scope is bounded).

#### Files to Create / Modify

- Modify `pipelines/sacredbench/score.py` — single-candidate citation extraction,
  per-task metric alignment, raw-count `_overall`, tradition aggregation + missing cells.
- Modify `cli.py` — `score` summary includes the tradition breakdown.

#### Deliverables

- [ ] Single-candidate correctness for citation tasks (hedge → 0); raw-count overall.
- [ ] Per-model × task × tradition summary (JSON + markdown), list-valued rule, missing cells shown.
- [ ] Tests incl. multi-candidate→0 and tradition-aggregation math.

#### Acceptance Criteria

- [ ] "could be A, B, or C" scores `correct`=0 for citation tasks; a single correct
      citation scores 1; for an overlapping-tradition work per-tradition `n` sums above the overall count.
- [ ] Build and tests pass.

#### Test Plan

- Unit: citation single-candidate (correct/hedge/wrong), per-task metric presence,
  tradition aggregation, a slice with a missing/failed cell.

### Phase 7: Minimal local results view

**Dependencies**: Phase 6 (format); buildable against a fixture in parallel

#### Objective

The smallest browser view of a run's `summary.json` + per-question `scores.jsonl`
(with question/answer text), served by a local dev server reading committed or
local `runs/` artifacts. Local only — no deploy, no domain adaptation (Spec 2).

#### Files to Create / Modify

- Add to `apps/viewer/src` a minimal local results route/page: a summary table
  (per-model × task) and a per-question scores list; read artifacts from a local
  path (a small committed sample under the app, or a dev-served `runs/`), **not**
  the GitHub data layer (untouched; no HeroUI v2-era provider added).
- `apps/viewer/README.md` — note the local-only results view; keep the
  "seed, not yet adapted" status for the rest.
- A vitest test for the results components against a small fixture.

#### Deliverables

- [ ] Local dev-server page showing run summary + per-question scores from local artifacts.
- [ ] No deploy/polish/domain-adaptation; GitHub data layer untouched.
- [ ] A vitest test; repo-data-coupled seed suites stay skipped when the dataset is absent.

#### Acceptance Criteria

- [ ] `pnpm -C apps/viewer dev` serves a page rendering a fixture run's summary +
      per-question scores; `pnpm -C apps/viewer test` passes.

#### Test Plan

- Component test: render summary table + scores list from a fixture; manual dev-server
  check against real artifacts is folded into Phase 8's tutorial walkthrough.

### Phase 8: First benchmark run and TUTORIAL walkthrough

**Dependencies**: Phases 1–7

#### Objective

Close the loop: run the first real benchmark end to end on the English corpora and
commit copyright-audited evidence, with a `TUTORIAL.md` whose every command is
verified on a fresh clone.

#### Design decisions

- **Scope**: English `retrieve_quote`, ~100 seeded questions; panel is **≥3 models
  spanning ≥2 providers** (small but meeting the spec bar), keys from env only.
- **Run-config convention**: commit `configs/models.example.yaml` (the panel
  shape); the live `configs/models.yaml` stays gitignored/per-user.
- **Usage/cost**: totals from `collect`'s recorded `usage` tokens; since no price
  table exists, report **token totals** (optionally a cost if per-model price is
  supplied in the run config) — do not invent prices.
- **Committed-evidence path**: commit the run under a non-ignored evidence path
  (add the `.gitignore` negation here, mirroring Phase 1) since `runs/` is ignored.
- **Copyright audit**: an automated check (committed, runnable in the test gate)
  that fails if any committed standardized/evidence artifact maps to a `restricted`
  catalogue entry or contains restricted text — not a manual pre-commit statement.

#### Files to Create / Modify

- Create `configs/models.example.yaml` (budgeted ≥3-model / ≥2-provider panel).
- Create `pipelines/sacredbench/audit.py` (or a check script) — restricted-text/
  restricted-origin artifact audit; wire into the test gate.
- Run convert (all committed) → validate → generate (~100 seeded English
  `retrieve_quote`) → collect → score; commit the evidence (summary + artifacts).
- Modify `.gitignore` — allow the committed evidence path.
- Create `TUTORIAL.md` (repo root) — copy-pasteable convert → validate → generate
  → collect → score → view walkthrough from a fresh checkout.

#### Deliverables

- [ ] Committed example run config + the first benchmark run's artifacts + summary,
      copyright-audited, token (and optional cost) totals computed.
- [ ] `audit.py` + a test; `TUTORIAL.md` with every command verified on a fresh clone.
- [ ] The minimal viewer renders this committed run.

#### Acceptance Criteria

- [ ] From a fresh clone, following `TUTORIAL.md` verbatim produces the summary
      table and a viewable results page; no `restricted` data required.
- [ ] The audit passes and would fail on injected restricted text; committed
      artifacts contain no restricted source text.
- [ ] `collect` ran ≥3 models / ≥2 providers; build and tests pass; the PR opens with all phase-commits on the branch.

#### Test Plan

- Automated: `audit.py` test (clean passes, injected restricted text fails);
  earlier phases' gates green. Manual: execute `TUTORIAL.md` on a fresh clone top to
  bottom — the acceptance gate for the loop, including the viewer step.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Real shapes have undocumented irregularities (Talmud HTML/daf offset, null fields, empty units) | High | Medium | Converters derived from the real data, fail-fast naming the file; per-converter tests against the real source; Talmud specifics named in Phase 3 |
| Catalogue schema can't express a future source | Medium | Low | `targets` list + data-derived metadata absorbs multi-work dirs; adding a source = a target entry + (maybe) one converter |
| Colliding/duplicate `(work,version,language)` distort counts | Medium | Medium | Phase 4 merges with tradition-union + dedup key; Phase 5 overlap exclusions; stated explicitly |
| Live `collect` cost/time overrun | Medium | Medium | Small budgeted ≥3-model panel, ~100 one-task questions; resumable; usage computed before any wider run |
| Scope creep from the viewer (pull toward full adaptation) | Medium | Medium | Minimal local-only view; full adaptation deferred to Spec 2; loop-closure over breadth |
| `TUTORIAL.md` drifts from real behavior | Medium | High | Every command verified on a fresh clone before the PR; it is the loop's acceptance gate |
| Restricted text leaking into committed artifacts | Low | High | Default-exclude restricted; automated `audit.py` in the test gate; `.gitignore` keeps restricted payloads out |

## Documentation Updates

- `pipelines/README.md` — catalogue/`source.yaml`, restricted flag, standardized-path convention, `export`, run config.
- `apps/viewer/README.md` — the local-only results view.
- `TUTORIAL.md` (new, repo root) — the end-to-end walkthrough.
- `texts/README.md` already documents the two tiers + held-back sources (landed with the data) — no change expected.
- Seeding `codev/resources/arch.md` / `lessons-learned.md` from this round is a MAINTAIN follow-up, not part of this PR.
