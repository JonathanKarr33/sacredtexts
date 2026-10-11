# Specification: Sacred Texts Benchmark — Phase 1 pipeline

<!--
SPEC vs PLAN BOUNDARY: this spec defines WHAT and WHY. The plan defines HOW/WHEN.
-->

## Problem Statement

The CEFE-AI "Sacred Texts" working group (organiser: Nancy Fulda, BYU) needs a
**Phase 1 benchmark by November 2026** answering one question (agreed Sep 17):

> Can AI models correctly recognize, retrieve, and generate sacred text, as well
> as reject false premises and incorrect texts?

A paper is planned for **ACM FAccT 2027** (abstract Oct 27, full paper Nov 3) with
an earlier arXiv preprint in October. Waleed Kadous and Jonathan Karr (Notre Dame)
are tech co-leads for the pipeline: JSON conversion, benchmark generation, scoring,
analysis and visualisation. As of Oct 10 no pipeline repo has been shared by the
group (Jonathan said Oct 5 he would share two repos "later today"; nothing arrived),
and the next working-group meeting (**Mon Oct 12**) expects a pipeline update.

Evidence the problem is real: Waleed's JaleesBench quranquote harness found Gemma 4
"just makes stuff up" on ~30% of tested Quran verses. Two non-peer-reviewed blog
studies (apologistproject.org, fideai.org) measured scripture-quotation fidelity for
Christian scripture only. No multi-tradition, provenance-aware benchmark exists.

Phase 2 (theological interpretation, recommendations, literary context) is
explicitly **out of scope**.

## Current State

- **The working group's real raw data has landed** (committed to `texts/raw/` on
  2026-10-10 from the Box "Phase I / raw JSON" drop) in **7 traditions with
  heterogeneous, source-specific shapes** — each needs its own converter:
  - **Protestant Christian** — KJV / ASV / WEB Bibles as a flat list of
    `{book, chapter, verse, text}` (~31k verses each). *Three versions of one
    work* — this is the multi-version data `identify_version` needs.
  - **Sunni Islam** — QUL Uthmani Quran as a dict keyed `"surah:ayah"` →
    `{id, verse_key, surah, ayah, text}`; 9 sunnah.com hadith collections as
    `{id, metadata, chapters[], hadiths[{id, idInBook, chapterId, bookId,
    arabic}]}` (Arabic-only).
  - **Judaism** — Sefaria William Davidson Talmud Bavli, per-tractate en/he JSON
    `{language, title, versionSource, versionTitle, …, text}`.
  - **Roman Catholic** — papal encyclicals (`encyclicals/index.json` listing 211
    items `{id, slug, title, pope, publicationDate, language}` + per-item text);
    NABRE held back (restricted).
  - **LDS** — ben-crowder editions as nested `{book: {heading, chapter: {verse:
    text}}}` (Book of Mormon, D&C, Pearl of Great Price, KJV OT/NT).
  - **Greek Orthodox** — held back (restricted; TLG extracts).
  Two **restricted** subsets (`Roman Catholic/nabre.json`, `Greek Orthodox/`) are
  gitignored and local-only pending licensing; everything else is committed
  verbatim. Converters are planned against these real committed shapes, not
  fixture guesses. JaleesBench also has a working quote-check harness (prior art).
- **The group agreed a standardised flat JSON** (Nancy, Sep 8 — see Interchange
  format below) but no converter into it exists.
- **Question templates are drafted** (six candidates, Sep 8) but not implemented;
  strict-vs-semantic evaluation is an open group question (Nancy leans "both").
- **multibench** (this org) already solved the adjacent problems: drop-in
  per-tradition data directories discovered by globbing, a provider seam over
  Anthropic/OpenAI-compatible/Gemini with retries+timeouts+usage accounting,
  resumable JSONL pipelines, and a four-subsystem layout (collection, scoring,
  analysis, visualisation). A draft port of these seams exists on this branch
  (`pipelines/sacredbench/`) as implementation seed material.

## Desired State

A `sacredtexts` pipeline with the FaithfulBench/multibench four-subsystem shape,
**multi-faith from day one** in the way multibench is multi-tradition:

1. **Two-tier `texts/` layout** (amended 2026-10-10, Waleed's direction):
   - `texts/raw/<source-id>/` — the **raw source data exactly as obtained**
     (the Box drop, organised by tradition), plus a committed **`source.yaml`**
     per source describing it: tradition list, work, version, language,
     document_type, where it came from (URL/repo/commit), how it was fetched,
     fetch date, which converter consumes it, and a **`license` field** with a
     controlled value — `public-domain`, `open`, or `restricted`.
     **Public-domain / open raw payloads are committed verbatim** (they already
     are — KJV/ASV/WEB, QUL Quran, hadith, Talmud, encyclical index, LDS
     editions); **`restricted` raw payloads are gitignored** and local-only
     (currently `Roman Catholic/nabre.json` and `Greek Orthodox/`), obtainable
     per `texts/README.md`. `source.yaml` is committed for every source,
     including restricted ones, so the catalogue is complete even when a payload
     is absent.
   - `texts/standardized/` — the standard flat-format documents produced by the
     converters from `texts/raw/` (one document per work/version/language,
     possibly sharded per unit). **Public-domain / open corpora may be committed;
     corpora derived from `restricted` sources stay gitignored** pending
     licensing. Pipeline stages (`validate`, `generate`) read from here.
   - Adding a faith tradition's texts = dropping a `texts/raw/<source-id>/`
     directory + `source.yaml` in; it never changes core pipeline code. The
     two-tier `raw/` layout is designed to **absorb additional working-group data
     as drop-in**, so the spec does not over-engineer for corpora not yet in hand
     (simpler is better) — new sources are handled by adding a converter, not by
     reshaping the pipeline.
2. **Conversion scripts** turn `texts/raw/` sources into `texts/standardized/`
   documents: the `sacredbench convert` registry (one converter per real raw
   shape — flat-verse Bibles, `surah:ayah` Quran, hadith collections, Sefaria
   Talmud, encyclicals, nested LDS editions) driven by each source's
   `source.yaml`, so the standardized tier is mechanically rebuildable from raw
   with one command. Converters are written against the **real committed shapes
   in `texts/raw/`**, not fixture-only guesses. Adding a source format = one
   converter function + a registry line.
   **Restricted-source policy**: `convert` and `generate` **exclude** sources
   whose `source.yaml` `license` is `restricted` **by default**; they are
   included only via an explicit opt-in flag (e.g. `--include-restricted`), so a
   user who holds a local NABRE/TLG copy can run them. `validate` operates on
   restricted sources regardless (the format gate does not depend on licensing).
   The no-copyrighted-text-in-committed-artifacts constraint holds throughout.

   **Standardized documents are stored in the interchange flat format
   (Nancy's JSON) itself** — there is no second internal representation. The
   standardized tier may be **sharded** (e.g. one document per Bible book, one
   per encyclical) so stages can stream and resume per unit. The **exporter**
   is therefore not a format translation (which would be a vacuous copy) but an
   **assembler**: it merges the per-unit standardized shards of a work/version
   into the single interchange document the group shares (Box), applying a
   defined entry ordering and dedup. The round-trip that must be lossless is
   **standardized shards ↔ assembled interchange document**, on the tuple
   (`source` metadata + ordered `entries`); `validate` is the mechanical gate on
   the flat format at both tiers.
3. **Benchmark generation**: deterministic (seeded) sampling over corpora through
   the six agreed templates → `questions.jsonl`. A stated **generation policy**
   governs validity: per-task item quotas, the negative ratio for `verify_source`,
   tradition balancing across the panel, and exclusions — a wrong-work
   `verify_source` negative whose text **also occurs** in the attributed work is
   excluded. `identify_version` is **version-gated per work**: `generate` emits it
   only for a work with ≥2 converted versions (the KJV/ASV/WEB Bibles make it live
   for the Bible), and skips it for single-version works where the answer would be
   inferable from the work alone.
   Every question carries a **stable content-derived ID and ordering**, and the
   run persists the seed, generation config, and a hash of the input corpora, so
   a corpus edit cannot silently reshuffle the set and a later stage refuses to
   resume against changed questions. Includes **false-premise negatives** (real
   text attributed to the wrong work) for the reject-false-premises objective;
   LLM-assisted *fabricated-text* items are a later stage behind the same seam.
4. **Collection**: fan every question out to a configured multi-provider model
   panel (Anthropic, any OpenAI-compatible host incl. OpenRouter, Gemini) →
   `answers.jsonl`. Resumable; concurrency-bounded; failed cells stay pending and
   exit non-zero.
5. **Scoring**: each answer is scored under its task's contract (the task-types
   table above) — the similarity metrics (exact; normalized; token-F1 in v1,
   with embedding/judge-based semantic scoring as a pluggable later metric) apply
   to the free-text tasks, while yes/no and structured tasks are parsed. The
   headline `correct` must be **robust to evasive answers**: for `cite_passage`
   and `identify_source` a single citation candidate is extracted and a
   multi-candidate hedge ("could be John 3:16, Luke 2:4, or Rom 5:8") scores 0,
   so containment alone cannot game the provenance-honesty property Phase 1
   exists to measure. Output → `scores.jsonl` + per-model × task × tradition
   summary.
6. **Analysis**: aggregate accuracy per model × task × tradition. Because
   `tradition` is list-valued (a work can be Catholic *and* Protestant *and* …),
   the aggregation rule is stated and fixed: **an observation counts once per
   listed tradition** (so per-tradition `n` sums to more than the item count),
   and a separate overall row counts each observation exactly once — this is the
   rule every number in the paper is computed under. Output is the per-model ×
   task × tradition summary (JSON + markdown).
7. **A closed loop, even if narrow** (amended 2026-10-10, human direction —
   loop-closure over breadth): the headline deliverable is the **full
   end-to-end flow working** on real data, explicitly not perfect or broad. Two
   thin pieces complete the loop:
   - **`TUTORIAL.md`** at the repo root — a copy-pasteable, step-by-step
     walkthrough from a fresh checkout: convert → validate → generate (small,
     seeded) → collect (small, budgeted panel) → score → view the results. Every
     command is verified by running it, in order, on a fresh clone before the PR.
   - **A minimal LOCAL results view in `apps/viewer`** — the smallest thing that
     shows the evidence run's summary + per-question scores in a browser, served
     by a local dev server reading the run artifacts (committed or local
     `runs/`). **No deploy, no polish, no domain adaptation** — the full viewer
     adaptation and any public SPA stay **follow-on (Spec 2 / issue #2)**.
   Heavier **visualisation** (matplotlib figures, the public multibrowser-style
   SPA) is out of scope here.

### Interchange format (group-agreed, Sep 8 draft + feedback)

```json
{
  "source": {
    "tradition": ["<faith tradition or community>", "..."],
    "work": "<title>", "version": "<edition/translation>",
    "language": "<lang>", "document_type": "<scripture|encyclical|...>",
    "source_url": "<optional>"
  },
  "entries": [
    {"unit_type": "<verse|ayah|line|shabad|sutra|paragraph>",
     "citation": "<traditional citation>", "text": "[EXACT TEXT]"}
  ]
}
```

`tradition` is a **list** (Smiley/Kadous feedback: traditions share texts —
many-to-many between tradition and source). v1 is **flat** (hierarchy is Phase 2);
queries **state the desired version** (v1 does not score translation choice);
detailed provenance/parent citations/footnotes are omitted in v1.

### The six question templates → task types

Each task has an **expected-answer schema** and a defined set of **applicable
metrics** — a single exact/normalized/token-F1 triple is not meaningful for
yes/no or structured answers, so the scoring contract is per-task, not uniform.
The `correct` column is the headline number the paper reports and must be robust
to evasive/multi-candidate answers (see Scoring, below).

| task | template | expected-answer schema | metrics | headline `correct` |
|---|---|---|---|---|
| identify_version | "Which version of «work» says «text»?" | one version label from the corpus | exact, normalized (on label) | **Version-gated per work** — `generate` emits it only for works with ≥2 converted versions (KJV/ASV/WEB make it live for the Bible), and skips it for single-version works where the answer is inferable from the work alone. |
| retrieve_quote | "Please give me the «version» quote for «citation»" | exact unit text | exact, normalized, token-F1 | normalized exact match |
| verify_source | "Is «text» from «work»?" (incl. wrong-work negatives) | yes / no | boolean parse | parsed boolean equals ground truth |
| complete_unit | "Please complete this «unit_type»: «beginning»" | the remainder of the unit | exact, normalized, token-F1 | normalized exact match of the remainder |
| cite_passage | "What is the source citation for this passage from «work»?" | one citation | citation parse/normalize | the *single* extracted citation equals ground truth; multi-candidate answers score 0 |
| identify_source | "Where is this quote from? «text»" | work + one citation | per-field parse | both fields correct against a single extracted candidate; multi-candidate answers score 0 |

This table is the authoritative scoring contract; `pipelines/sacredbench/score.py`
must match it (it already gives the three similarity metrics only to
`retrieve_quote` / `complete_unit`).

## Success Criteria

- [ ] Every source under `texts/raw/` (the 7 landed traditions) has a committed
      `source.yaml` carrying provenance, fetch method, converter, and a `license`
      field valued `public-domain` / `open` / `restricted`. Public-domain/open
      raw payloads are committed; `restricted` payloads (NABRE, TLG) are
      gitignored and local-only, with `texts/README.md` documenting how to obtain
      them.
- [ ] `convert` and `generate` **exclude `restricted` sources by default** and
      include them only under an explicit `--include-restricted` opt-in;
      `validate` works on them regardless.
- [ ] `texts/standardized/` holds the corresponding standard-format documents,
      rebuilt from `texts/raw/` by one conversion command, with a validator
      that mechanically gates the format; public-domain/open standardized corpora
      are committed, `restricted`-derived ones stay gitignored.
- [ ] The exporter **assembles** per-unit standardized shards into one
      interchange document per work/version with defined ordering/dedup, and the
      round-trip **standardized shards ↔ interchange document** is lossless on
      (`source` metadata + ordered `entries`).
- [ ] `generate` is deterministic for a fixed seed: stable content-derived
      question IDs and ordering, seed + generation config + input-corpus hash
      persisted, and a later stage refuses to resume against changed questions.
      Every question carries exact expected answer + full source coordinates;
      `verify_source` includes negatives (excluding wrong-work negatives whose
      text also occurs in the attributed work); `identify_version` is version-gated
      — emitted only for works with ≥2 versions (the Bible via KJV/ASV/WEB),
      skipped for single-version works.
- [ ] `collect` runs a ≥3-model panel spanning ≥2 providers (verified by committed
      run artifacts, not CI); resumable; partial failure exits non-zero with the
      failed cells listed.
- [ ] `score` implements the per-task scoring contract (task-types table):
      applicable metrics per task + a headline `correct` robust to multi-candidate
      answers, plus a per-model × task × tradition summary (JSON + markdown) using
      the stated list-valued-tradition aggregation rule.
- [ ] **The first real benchmark run, end to end**: convert all committed
      sources → standardized, generate ~100 seeded `retrieve_quote` questions,
      collect across a small budgeted panel, score, and commit the summary +
      artifacts as evidence, with usage/cost totals computed from the data.
      Committed artifacts (`questions`/`answers`/`scores`) carry **only
      public-domain/open or synthetic text**; any `restricted` (NABRE/TLG) text is
      redacted or hashed per the copyright gate.
- [ ] **`TUTORIAL.md`** walks the whole flow (convert → validate → generate →
      collect → score → view) from a fresh checkout with copy-pasteable commands,
      every one verified by running it in order on a fresh clone before the PR.
- [ ] **A minimal local results view** in `apps/viewer` shows the run's summary +
      per-question scores in a browser via a local dev server reading the run
      artifacts; no deploy/polish/domain-adaptation (that is Spec 2).
- [ ] Unit tests cover converters (against the real committed raw sources, plus
      real-shape fixtures for restricted ones), generation determinism
      (IDs/ordering/hash), the per-task scoring contract (incl. a
      multi-candidate-answer-scores-0 case), the restricted-source
      exclude/`--include-restricted` behavior, and an end-to-end analysis
      aggregation over a slice with a missing/failed cell; all pass via the
      repo's test gate.
- [ ] Demo-able for the Mon Oct 12 meeting from a fresh checkout: a one-command
      run on a small slice of **committed** public-domain/open corpora producing
      the summary table (no gitignored `restricted` data required to demo).

## Constraints

- **Human oversight**: AI-generated code is acceptable to the group only with
  human review and output validated against the sources (Nancy's condition on
  Codev). SPIR's human gates are the mechanism.
- **Copyright**: each source's `license` field (`public-domain` / `open` /
  `restricted`) is the single control point. `restricted` sources — currently the
  copyrighted **NABRE** translation and the licensed **TLG** (Greek Orthodox)
  extracts — have their raw payloads gitignored/local-only and are excluded from
  `convert`/`generate` unless `--include-restricted` is passed (for users holding
  a local licensed copy); their standardized/derived corpora are never committed.
  Public-domain / open corpora carry no such restriction and are committed. The
  gate also covers **derived artifacts**: committed `questions`/`answers`/`scores`
  and any smoke evidence must not embed `restricted` source text — such items are
  redacted or hashed. Whether `restricted` excerpts may be **sent to third-party
  model-provider APIs** during a live run is an open group question (below); until
  answered, committed live evidence uses only public-domain/open/synthetic corpora.
- **Public repo**: no API keys, no personal-key leakage (live-run key discipline
  as in multibench); results committed must be scores+metadata, not bulk text.
- **Stack**: Python uv project(s), Typer CLIs, fail-fast (no silent fallbacks),
  JSONL seams between stages — matching multibench conventions so the team can
  move between the repos.
- **Interop**: the group's interchange format is Nancy's JSON, verbatim — it is
  the format the standardized tier is stored in, and the exporter assembles the
  sharded standardized documents into it losslessly.

## Assumptions

- The working group's raw corpora have **already landed** in `texts/raw/` (7
  traditions, committed 2026-10-10); converters are built against those real
  committed shapes. Jonathan's code repo may still appear; if it does we
  reconcile rather than compete, and the exporter emits interchange JSON his
  tooling can consume.
- The QUL Uthmani Quran is committed (`open`); if a licensing question arises an
  openly-licensed public source (Tanzil / quran.com JSON) is the drop-in fallback.
- Model panel for the first real run is decided at run time by config, not code;
  Nancy's Gemini Nano request is handled as a panel-config question (open below).

## Solution Approaches

### Approach 1 (recommended): two-tier `texts/` (raw + standardized) + staged JSONL pipeline

Drop-in `texts/raw/<source-id>/` (raw payload + committed `source.yaml`) converted
to `texts/standardized/` documents **stored in the interchange flat format
itself** (possibly sharded per unit), with one `pipelines/` uv project whose
subsystems are modules (convert/generate/collect/score) over JSONL seams. There is
**one** text representation (the interchange format); the "exporter" assembles
sharded standardized documents into the single group-shareable interchange file,
so the round-trip is a real ordering/dedup guarantee, not a copy. Pros: proven in
multibench; multi-faith by construction; resumable; committed provenance via
`source.yaml`; group interchange is the native format. Cons: standardized corpora
are large, so licensing/sharding discipline matters (handled by the copyright gate
and per-unit shards).

### Approach 2: single monolithic interchange document per work, no sharding/raw tier

Pipeline reads one large Nancy-format JSON array per work directly, no raw tier and
no per-unit shards. Pros: nothing to assemble. Cons: large single-array JSON files
(31k Bible verses) are unwieldy for streaming/resume; no committed provenance home
(`source.yaml`); no separation of the gitignored raw payload from committed
metadata; harder to gate incrementally with a validator.

### Approach 3: wait for Jonathan's repos

Pros: no duplicated effort. Cons: nothing has arrived since Oct 5; the Monday
meeting needs a pipeline update; Waleed already offered (Oct 8) to take a shot.

## Open Questions

- **Critical** — none blocking implementation of the above.
- **Important**: semantic-similarity scoring beyond token-F1 (embeddings? LLM
  judge?) — group question, Nancy leans "test both"; design keeps the metric
  pluggable. · Gemini Nano in the panel (Nancy's unanswered request): on-device
  model, not reachable via the Gemini API — needs a stance (e.g. AI Studio /
  Chrome built-in harness, or report as out-of-scope for the API panel). ·
  **May `restricted` (NABRE / TLG) excerpts be sent to third-party
  model-provider APIs** during a live run? Until the group answers, committed
  live-run evidence uses only public-domain/open/synthetic corpora.
- **Nice-to-know**: translation-agnostic queries (multi-translation + BLEU-style
  metrics) — explicitly deferred by the group; fabricated-text (not just
  wrong-attribution) negatives via LLM generation with human review.

## Test Scenarios

- Each converter run against its **real committed raw source** produces corpora
  that pass `validate`; malformed shapes fail loudly naming the file. Restricted
  shapes (NABRE) are covered by tiny real-shape fixtures since the payload is not
  committed.
- A `restricted` source is excluded from `convert`/`generate` by default and
  included under `--include-restricted`; `validate` accepts it either way.
- **Sharded standardized documents → assembled interchange → shards** round-trips
  losslessly on (`source` metadata + ordered `entries`), including the merge of
  multiple book-shards of one work (not a trivial file-copy identity).
- Same seed ⇒ identical `questions.jsonl` with identical question IDs and order;
  different seed ⇒ different sample; editing a corpus changes the input hash and a
  resume against the changed set is refused.
- Generation excludes a wrong-work `verify_source` negative whose text also occurs
  in the attributed work, and emits `identify_version` **only for a work with ≥2
  versions** (the Bible via KJV/ASV/WEB), skipping it for single-version works.
- Collection with a dead provider key fails that model's cells, exits non-zero,
  and a re-run with the key fixed fills exactly the missing cells.
- Scoring: curated answer fixtures hit expected metric values per the per-task
  contract (incl. unicode-quote and punctuation-only divergences); `verify_source`
  parses "Yes."/"no," variants; a **multi-candidate hedge** ("could be John 3:16,
  Luke 2:4, or Rom 5:8") scores `correct`=0 for `cite_passage`/`identify_source`.
- Analysis aggregation over a small slice with a missing/failed cell produces the
  per-model × task × tradition summary with the list-valued-tradition rule applied
  (per-tradition `n` exceeds the overall count where traditions overlap).
- Live smoke (budgeted, small) against ≥2 providers verifies the real path
  (mock-boundary lesson from multibench), on public-domain/synthetic corpora only.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Duplicate effort vs Jonathan's unshared repos | Medium | Medium | Converter consumes his dataset repo; exporter emits group format; share early at Monday's meeting |
| `restricted` translations (NABRE, TLG) in a public repo | Medium | High | `license: restricted` → raw gitignored/local-only, excluded from convert/generate unless `--include-restricted`, derived corpora never committed |
| `restricted` text leaking into committed derived artifacts (questions/answers/scores/smoke) | Medium | High | Gate covers derived artifacts; redact/hash restricted text; committed live evidence uses public-domain/open/synthetic corpora |
| A new Box source arrives in an unanticipated shape | Medium | Low | Two-tier `raw/` absorbs it as drop-in; one new converter + registry line, no pipeline reshape; `validate` gates the result |
| Strict-match scores unfairly punish verbose models | High | Medium | Both tiers + token-F1 reported; answer-format instruction in prompts; semantic metric pluggable |
| Benchmark saturation on primary sources (Waleed, Aug 5) | Medium | Medium | Phase 1 measures provenance/rejection too (verify_source negatives); secondary sources are Phase 2 fodder |
| Live-run cost overrun | Low | Medium | Budgeted smoke; usage computed from data before any larger run |

## References

- Status report compiled from waleedk@gmail.com email (2026-10-10, in-session).
- Group docs: Sacred Texts Benchmark doc; JSON-fields doc; Box "Phase I / raw
  JSON"; Overleaf FAccT draft (links in the status report / email threads).
- `Religion-at-Notre-Dame/catholic_text_json` (real input shapes, verified).
- JaleesBench quranquote harness (`iaser-ai/jaleesbench/tree/main/quranquote`).
- multibench: `workflows/judging` (provider seam, resumable JSONL discipline),
  `traditions/` drop-in module pattern, `apps/tradition_validator`.
- FAccT 2027 CFP: https://facctconference.org/2027/cfp.html
