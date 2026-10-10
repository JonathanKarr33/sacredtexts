# Plan: Sacred Texts Benchmark — Phase 1 pipeline

**Specification**: [codev/specs/1-phase1-benchmark-pipeline.md](../specs/1-phase1-benchmark-pipeline.md)

## Executive Summary

The spec's recommended approach (Approach 1: two-tier `texts/` + staged JSONL
pipeline) is already seeded — PR #1 shipped `pipelines/sacredbench` with
`schema`/`convert`/`validate`/`generate`/`collect`/`score` and 25 passing tests,
and the working group's real raw corpora (7 traditions) have landed in
`texts/raw/`. This plan therefore implements the **delta** between that seed and
the approved spec, and closes the human's headline requirement: **the full
end-to-end flow working on real data, narrow but complete** (loop-closure over
breadth).

The delta, in dependency order: (1) a committed `source.yaml` catalogue with a
`license` field and restricted-source gating; (2) converters for the real
committed shapes (the seed only has the old NABRE/encyclical shapes); (3) the
interchange exporter + a meaningful shards↔document round-trip; (4) generation
hardening (version-gated `identify_version`, stable content IDs, seed/config/
input-hash provenance + resume guard); (5) the per-task scoring contract
(single-candidate extraction so hedges can't game it) + tradition-aware
analysis; (6) a minimal local results view in `apps/viewer`; (7) the first real
benchmark run (~100 seeded `retrieve_quote` questions across a small panel) with
committed copyright-clean evidence, tied together by a `TUTORIAL.md` verified on
a fresh clone.

Each phase is one atomic commit on a single branch / one PR; the PR opens during
or after Phase 7.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Source catalogue and license gating"},
    {"id": "phase_2", "title": "Converters for the committed corpus shapes"},
    {"id": "phase_3", "title": "Interchange exporter and round-trip guarantee"},
    {"id": "phase_4", "title": "Deterministic, version-gated question generation"},
    {"id": "phase_5", "title": "Per-task scoring contract and tradition-aware analysis"},
    {"id": "phase_6", "title": "Minimal local results view"},
    {"id": "phase_7", "title": "First benchmark run and TUTORIAL walkthrough"}
  ]
}
```

## Phase Breakdown

### Phase 1: Source catalogue and license gating

**Dependencies**: None

#### Objective

Make `source.yaml` the single provenance/licensing control point and route
`convert`/`generate` through it, so `restricted` sources are excluded by default
and opt-in only. This is the copyright gate's mechanism and every later phase
reads the catalogue.

#### Files to Create / Modify

- Create `pipelines/sacredbench/catalogue.py` — `source.yaml` schema + loader
  (`tradition[]`, `work`, `version`, `language`, `document_type`, provenance
  (source_url/repo/commit), fetch method + date, `converter`, and
  `license: public-domain|open|restricted`), fail-fast on unknown `license` or
  missing fields; a discovery function that walks `texts/raw/` for `source.yaml`.
- Create one committed `texts/raw/<source>/source.yaml` per landed source
  (7 traditions), including the two `restricted` ones (NABRE, TLG) even though
  their payloads are absent.
- Modify `pipelines/sacredbench/cli.py` — `convert`/`generate` consult the
  catalogue and skip `restricted` sources unless `--include-restricted`;
  `validate` is unaffected by `license`.
- Modify `pipelines/README.md` — document `source.yaml` and the restricted flag.

#### Deliverables

- [ ] `source.yaml` schema + loader + discovery, fail-fast.
- [ ] Committed `source.yaml` for all 7 landed sources with correct `license`.
- [ ] `--include-restricted` opt-in; restricted excluded by default in
      `convert`/`generate`; `validate` ignores licensing.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Loading a malformed/`license`-less `source.yaml` fails loudly naming the file.
- [ ] A default `convert`/`generate` over `texts/raw/` processes no `restricted`
      source; with `--include-restricted` it includes them (given a local payload).
- [ ] Build and tests pass via `.codev/checks/test.sh`.

#### Test Plan

- Unit: catalogue load (valid/invalid/unknown-license), discovery over a fixture
  tree, default-exclude vs `--include-restricted` selection logic.

### Phase 2: Converters for the committed corpus shapes

**Dependencies**: Phase 1

#### Objective

Convert every committed source into valid standard-format documents. The seed's
`convert.py` only knows the old nested NABRE shape and encyclicals; the real
committed data has five more shapes that each need a converter.

#### Files to Create / Modify

- Modify `pipelines/sacredbench/convert.py` — add converters, each registered in
  `CONVERTERS` and selected by `source.yaml` `converter`:
  - `bible_flat` — Protestant KJV/ASV/WEB: flat list `{book, chapter, verse,
    text}` → one scripture document per version (citations `<Book> c:v`).
  - `quran_qul` — dict keyed `"surah:ayah"` → `{id, verse_key, surah, ayah,
    text}` (unit_type `ayah`, citation `surah:ayah`).
  - `hadith_sunnah` — `{metadata, chapters[], hadiths[{idInBook, chapterId,
    arabic}]}` (unit_type `hadith`, citation from book/number).
  - `sefaria_talmud` — per-tractate `{language, title, …, text}` (nested
    sections → folio/line citations); en/he handled as separate versions.
  - `lds_nested` — `{book: {heading, chapter: {verse: text}}}` → one document
    per work.
  - keep `encyclicals` (already matches the committed `en/*.json` shape) and the
    restricted `nabre`.
- Modify `cli.py` — catalogue-driven `convert` dispatches to the named converter.

#### Deliverables

- [ ] A converter per committed shape, registered; fail-fast naming the file.
- [ ] `convert` over the whole catalogue (restricted excluded) writes
      standardized documents that pass `validate`.
- [ ] Tests for each converter against its **real committed source** (tiny
      real-shape fixtures for the restricted NABRE shape).

#### Acceptance Criteria

- [ ] Each public-domain/open source converts to documents that `validate`
      accepts; KJV/ASV/WEB yield three versions of "The Bible".
- [ ] A malformed shape raises `ConvertError` naming the file.
- [ ] Build and tests pass.

#### Test Plan

- Unit per converter: real committed input (or fixture) → expected entry count,
  citations, unit_type, exact text; malformed-shape failure.

### Phase 3: Interchange exporter and round-trip guarantee

**Dependencies**: Phase 2

#### Objective

Assemble sharded standardized documents of a work/version into the single group
interchange document, with a lossless round-trip — satisfying the spec's
non-vacuous round-trip criterion.

#### Files to Create / Modify

- Create `pipelines/sacredbench/export.py` — assemble per-unit/per-shard
  standardized documents of one (work, version, language) into one interchange
  document with a defined entry ordering + dedup; inverse re-shard for the
  round-trip check.
- Modify `cli.py` — add an `export` command.

#### Deliverables

- [ ] `export` assembles shards → one interchange document per work/version.
- [ ] Round-trip **standardized shards ↔ assembled document** lossless on
      (`source` metadata + ordered `entries`).
- [ ] Tests incl. a genuinely multi-shard work (not a file-copy identity).

#### Acceptance Criteria

- [ ] For a multi-shard work, assemble-then-reshard reproduces the inputs on
      metadata + ordered entries; ordering is deterministic; duplicates removed.
- [ ] Build and tests pass.

#### Test Plan

- Unit: multi-shard assemble/round-trip; dedup of a repeated entry; stable order.

### Phase 4: Deterministic, version-gated question generation

**Dependencies**: Phase 2

#### Objective

Bring generation to the spec contract: `identify_version` version-gated per
work, stable content-derived IDs/ordering, persisted seed/config/input-hash with
a resume guard, and valid negatives.

#### Files to Create / Modify

- Modify `pipelines/sacredbench/generate.py` —
  - `identify_version` emitted only for works with ≥2 converted versions (live
    for the Bible via KJV/ASV/WEB), skipped otherwise;
  - question `id` derived from content (task + source coordinates + text hash),
    stable across runs; deterministic ordering;
  - exclude wrong-work `verify_source` negatives whose text also occurs in the
    attributed work;
  - emit a run manifest (seed, generation config, input-corpus hash).
- Modify `cli.py` — `generate` writes the manifest; a downstream stage refuses to
  resume when the manifest's question/corpus hash changed.

#### Deliverables

- [ ] Version-gated `identify_version`; stable content IDs + ordering.
- [ ] Manifest (seed/config/input-hash) persisted; resume refused on change.
- [ ] Overlapping-text negatives excluded.
- [ ] Tests for determinism, version-gating, hash-change refusal, negatives.

#### Acceptance Criteria

- [ ] Same seed ⇒ identical `questions.jsonl` (IDs + order); different seed ⇒
      different sample; editing a corpus changes the hash and resume is refused.
- [ ] `identify_version` present for the Bible, absent for single-version works.
- [ ] Build and tests pass.

#### Test Plan

- Unit: seed determinism (IDs/order), version-gate on/off, negative exclusion,
  manifest write + resume-refusal on changed hash.

### Phase 5: Per-task scoring contract and tradition-aware analysis

**Dependencies**: Phase 4

#### Objective

Make `score.py` match the spec's per-task contract — notably single-candidate
extraction so a multi-candidate hedge cannot score correct — and add the
per-model × task × **tradition** summary with the list-valued-tradition rule and
missing-cell handling.

#### Files to Create / Modify

- Modify `pipelines/sacredbench/score.py` —
  - `cite_passage` / `identify_source`: extract a **single** citation candidate;
    a multi-candidate answer scores `correct`=0;
  - confirm each task's applicable metrics match the spec table;
  - aggregation gains a **tradition** dimension: each observation counts once per
    listed tradition (per-tradition `n` can exceed the overall count), overall
    counts each observation once; missing/failed cells handled explicitly.
- Modify `cli.py` — `score` summary includes the tradition breakdown.

#### Deliverables

- [ ] Single-candidate correctness for citation tasks (hedge → 0).
- [ ] Per-model × task × tradition summary (JSON + markdown), list-valued rule.
- [ ] Missing/failed cells represented, not silently dropped.
- [ ] Tests incl. a multi-candidate-answer-scores-0 case and tradition aggregation.

#### Acceptance Criteria

- [ ] A "could be A, B, or C" answer scores `correct`=0 for the citation tasks;
      a single correct citation scores 1.
- [ ] For an overlapping-tradition work, per-tradition `n` sums above the overall
      count; overall counts each observation once.
- [ ] Build and tests pass.

#### Test Plan

- Unit: citation single-candidate (correct/hedge/wrong), per-task metric
  presence, tradition aggregation math, an aggregation over a slice with a
  missing/failed cell.

### Phase 6: Minimal local results view

**Dependencies**: Phase 5

#### Objective

The smallest browser view of a run's `summary.json` + per-question `scores.jsonl`
(+ the question/answer text), served by a local dev server reading committed or
local `runs/` artifacts. Local only — no deploy, no domain adaptation (Spec 2).

#### Files to Create / Modify

- Add to `apps/viewer/src` a minimal local results route/page: a summary table
  (per-model × task, as `score` renders) and a per-question scores list for the
  run; read artifacts from a local path (committed sample under the app, or a
  dev-served `runs/`), **not** the GitHub data layer.
- `apps/viewer/README.md` — note the local-only results view and how to point it
  at a run; keep the "seed, not yet adapted" status for the rest.
- A vitest test for the results components against a small fixture.

#### Deliverables

- [ ] A local dev-server page showing the run summary + per-question scores.
- [ ] Reads run artifacts locally; no deploy/polish/domain-adaptation.
- [ ] A vitest test; repo-data-coupled seed suites stay skipped when absent.

#### Acceptance Criteria

- [ ] `pnpm -C apps/viewer dev` serves a page rendering a fixture run's summary +
      per-question scores; `pnpm -C apps/viewer test` passes.
- [ ] No HeroUI v2-era provider added; GitHub data layer untouched.

#### Test Plan

- Component test: render summary table + scores list from a fixture; manual: dev
  server shows the real run artifacts (verified in Phase 7's tutorial walkthrough).

### Phase 7: First benchmark run and TUTORIAL walkthrough

**Dependencies**: Phases 1–6

#### Objective

Close the loop: run the first real benchmark end to end and commit copyright-clean
evidence, with a `TUTORIAL.md` whose every command is verified on a fresh clone.

#### Files to Create / Modify

- Create a small committed run config (budgeted panel, ≥2 providers) under
  `pipelines/` (keys from env only).
- Run: convert all committed sources → standardized; `validate`; `generate` ~100
  seeded `retrieve_quote` questions; `collect` across the panel; `score`.
- Commit the evidence under `runs/<dated>/` — `summary.json` + markdown + the
  artifacts, **public-domain/open text only** (restricted redacted/hashed), with
  usage/cost totals computed from the data.
- Create `TUTORIAL.md` at the repo root — copy-pasteable convert → validate →
  generate → collect → score → view walkthrough from a fresh checkout.

#### Deliverables

- [ ] Committed run config + the first benchmark run's artifacts + summary,
      copyright-clean, usage/cost computed.
- [ ] `TUTORIAL.md`, every command verified by running it in order on a fresh
      clone before the PR.
- [ ] The minimal viewer renders this committed run.

#### Acceptance Criteria

- [ ] From a fresh clone, following `TUTORIAL.md` verbatim produces the summary
      table and a viewable results page; no `restricted` data required.
- [ ] Committed artifacts contain no `restricted` source text.
- [ ] Build and tests pass; the PR is opened with all phase-commits on the branch.

#### Test Plan

- Manual: execute `TUTORIAL.md` on a fresh clone top to bottom (the acceptance
  gate for the loop); automated gates from earlier phases still green.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| A committed shape has undocumented irregularities (null fields, empty units) | High | Medium | Converters derived from the real data, fail-fast naming the file; per-converter tests against the real source |
| Live `collect` cost/time overrun on the real run | Medium | Medium | Small budgeted panel, ~100 one-task questions; resumable; usage computed before any wider run |
| Scope creep from the viewer (pull toward full domain adaptation) | Medium | Medium | Minimal local-only view; full adaptation explicitly deferred to Spec 2; loop-closure over breadth |
| `TUTORIAL.md` drifts from real behavior | Medium | High | Every command verified on a fresh clone before the PR; it is the loop's acceptance gate |
| Restricted text leaking into committed run artifacts | Low | High | Run excludes restricted by default; artifacts are public-domain/open only; redact/hash check before commit |

## Documentation Updates

- `pipelines/README.md` — `source.yaml`, restricted flag, `export`, the run config.
- `apps/viewer/README.md` — the local-only results view.
- `TUTORIAL.md` (new, repo root) — the end-to-end walkthrough.
- `texts/README.md` already documents the two tiers and held-back sources (landed
  with the data) — no change expected.
- Seed `codev/resources/arch.md` / `lessons-learned.md` from this round is a
  MAINTAIN follow-up, not part of this PR.
