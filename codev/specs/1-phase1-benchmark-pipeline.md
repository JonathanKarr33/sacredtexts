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

- **Input data exists in heterogeneous shapes.** Jonathan's
  `Religion-at-Notre-Dame/catholic_text_json` has (verified against the real data):
  NABRE Bible books as `{book, chapters:[{chapter, verses:[{verse, text}]}]}`, and
  211 papal encyclicals as `{pope, title, publicationDate, language, vaticanUrl,
  paragraphs:[{paragraph, text}]}` where `paragraph` may be null. More raw JSON
  lives in the group's Box folder ("Phase I / raw JSON"). JaleesBench has Quran
  data and a working quote-check harness.
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
     (Jonathan's repo JSON, Box files, Quran JSON, …), plus a committed
     **`source.yaml`** per source describing it: tradition list, work, version,
     language, document_type, where it came from (URL/repo/commit), how it was
     fetched, fetch date, license status, and which converter consumes it.
     Raw text payloads stay **gitignored** per the copyright gate; the YAML
     metadata is committed. This requires the repo's `.gitignore` to be
     restructured so a committed `source.yaml` under an otherwise-ignored
     `texts/raw/<id>/` is reachable (a bare `texts/*` ignore cannot re-include a
     path beneath an ignored directory), and `texts/README.md` updated to
     document the two-tier meaning.
   - `texts/standardized/` — the standard flat-format documents produced by the
     converters from `texts/raw/` (one document per work/version/language,
     possibly sharded per unit). **Public-domain corpora (e.g. KJV/ASV Bibles,
     openly-licensed Quran JSON) may be committed; corpora derived from
     copyrighted translations (NABRE) stay gitignored** pending licensing.
     Pipeline stages (`validate`, `generate`) read from here.
   - **At least two versions of at least one work** are present (e.g. two
     public-domain Bible translations) so that `identify_version` is a real
     discrimination task rather than inferable from the work alone.
   - Adding a faith tradition's texts = adding a `texts/raw/<source-id>/`
     directory + YAML; it never changes core pipeline code.
2. **Conversion scripts** turn `texts/raw/` sources into `texts/standardized/`
   documents: the `sacredbench convert` registry (NABRE books, encyclicals,
   Quran JSON, …) driven by each source's `source.yaml`, so the standardized
   tier is mechanically rebuildable from raw with one command. Adding a source
   format = one converter function + a registry line.

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
   excluded, and `identify_version` items whose wording is shared across the
   corpus's versions are excluded (so the answer is genuinely distinctive).
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
   task × tradition summary (JSON + markdown). **Visualisation** (matplotlib
   figures, the publicly useful browser SPA à la multibrowser) is explicitly a
   **follow-on spec**, like the viewer adaptation — this spec's analysis
   deliverable is the summary table, not figures.

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
| identify_version | "Which version of «work» says «text»?" | one version label from the corpus | exact, normalized (on label) | matches the *unique* correct version; items whose wording is shared across the corpus's versions are excluded at generation |
| retrieve_quote | "Please give me the «version» quote for «citation»" | exact unit text | exact, normalized, token-F1 | normalized exact match |
| verify_source | "Is «text» from «work»?" (incl. wrong-work negatives) | yes / no | boolean parse | parsed boolean equals ground truth |
| complete_unit | "Please complete this «unit_type»: «beginning»" | the remainder of the unit | exact, normalized, token-F1 | normalized exact match of the remainder |
| cite_passage | "What is the source citation for this passage from «work»?" | one citation | citation parse/normalize | the *single* extracted citation equals ground truth; multi-candidate answers score 0 |
| identify_source | "Where is this quote from? «text»" | work + one citation | per-field parse | both fields correct against a single extracted candidate; multi-candidate answers score 0 |

This table is the authoritative scoring contract; `pipelines/sacredbench/score.py`
must match it (it already gives the three similarity metrics only to
`retrieve_quote` / `complete_unit`).

## Success Criteria

- [ ] `texts/raw/` holds ≥2 traditions' sources (Catholic: NABRE + ≥1
      encyclical; Islam: Quran), each with a committed `source.yaml`
      (provenance, license status, fetch method, converter); raw payloads
      gitignored, with `.gitignore` restructured so the committed `source.yaml`
      is reachable and `texts/README.md` describing the two tiers.
- [ ] **At least two versions of at least one work** (e.g. two public-domain
      Bible translations) are present, so `identify_version` is a real
      discrimination task; public-domain standardized corpora are committed,
      NABRE-derived ones stay gitignored.
- [ ] `texts/standardized/` holds the corresponding standard-format documents,
      rebuilt from `texts/raw/` by one conversion command, with a validator
      that mechanically gates the format.
- [ ] The exporter **assembles** per-unit standardized shards into one
      interchange document per work/version with defined ordering/dedup, and the
      round-trip **standardized shards ↔ interchange document** is lossless on
      (`source` metadata + ordered `entries`).
- [ ] `generate` is deterministic for a fixed seed: stable content-derived
      question IDs and ordering, seed + generation config + input-corpus hash
      persisted, and a later stage refuses to resume against changed questions.
      Every question carries exact expected answer + full source coordinates;
      `verify_source` includes negatives (excluding wrong-work negatives whose
      text also occurs in the attributed work); `identify_version` excludes
      shared-wording items.
- [ ] `collect` runs a ≥3-model panel spanning ≥2 providers (verified by committed
      run artifacts, not CI); resumable; partial failure exits non-zero with the
      failed cells listed.
- [ ] `score` implements the per-task scoring contract (task-types table):
      applicable metrics per task + a headline `correct` robust to multi-candidate
      answers, plus a per-model × task × tradition summary (JSON + markdown) using
      the stated list-valued-tradition aggregation rule.
- [ ] One end-to-end smoke run on live providers (small question count) committed
      as evidence, with usage/cost totals computed from the data — and committed
      smoke artifacts (`questions`/`answers`/`scores`) carry **only public-domain
      or synthetic text**; any copyrighted (NABRE) text in them is redacted or
      hashed per the copyright gate.
- [ ] Unit tests cover converters (against real-shape fixtures), generation
      determinism (IDs/ordering/hash), the per-task scoring contract (incl. a
      multi-candidate-answer-scores-0 case), and an end-to-end analysis
      aggregation over a slice with a missing/failed cell; all pass via the
      repo's test gate.
- [ ] Demo-able for the Mon Oct 12 meeting from a fresh checkout: a one-command
      run on a small slice of **committed** public-domain/synthetic corpora
      producing the summary table (no gitignored NABRE data required to demo).

## Constraints

- **Human oversight**: AI-generated code is acceptable to the group only with
  human review and output validated against the sources (Nancy's condition on
  Codev). SPIR's human gates are the mechanism.
- **Copyright**: encyclicals/CST are cleared per Jonathan. NABRE is a copyrighted
  translation — texts/ corpora derived from it are **not committed** to this
  public repo until licensing is confirmed; converters pull from Jonathan's repo
  (or Box) at build time instead. Committed fixtures use tiny synthetic data.
  Public-domain translations (KJV/ASV, openly-licensed Quran) carry no such
  restriction and may be committed. The gate also covers **derived artifacts**:
  committed `questions`/`answers`/`scores` and any smoke evidence must not embed
  copyrighted source text — NABRE-derived items are redacted or hashed. Whether
  NABRE excerpts may be **sent to third-party model-provider APIs** during a live
  run is an open group question (below); until answered, live runs committed as
  evidence use public-domain/synthetic corpora.
- **Public repo**: no API keys, no personal-key leakage (live-run key discipline
  as in multibench); results committed must be scores+metadata, not bulk text.
- **Stack**: Python uv project(s), Typer CLIs, fail-fast (no silent fallbacks),
  JSONL seams between stages — matching multibench conventions so the team can
  move between the repos.
- **Interop**: the group's interchange format is Nancy's JSON, verbatim — it is
  the format the standardized tier is stored in, and the exporter assembles the
  sharded standardized documents into it losslessly.

## Assumptions

- Jonathan's repos may still appear; this pipeline must be able to consume his
  dataset repo as a source (it already does) and to export interchange JSON his
  tooling can consume. If his code repo lands, we reconcile rather than compete.
- Quran JSON is obtainable from JaleesBench quranquote data (same org access);
  if not, an openly-licensed public source (Tanzil / quran.com JSON) is the
  committable fallback (see Risks).
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
  **May copyrighted (NABRE) excerpts be sent to third-party model-provider
  APIs** during a live run? Until the group answers, committed live-run evidence
  uses only public-domain/synthetic corpora.
- **Nice-to-know**: translation-agnostic queries (multi-translation + BLEU-style
  metrics) — explicitly deferred by the group; fabricated-text (not just
  wrong-attribution) negatives via LLM generation with human review.

## Test Scenarios

- Converter fed real-shape NABRE/encyclical fixtures produces valid corpora;
  malformed shapes fail loudly naming the file.
- **Sharded standardized documents → assembled interchange → shards** round-trips
  losslessly on (`source` metadata + ordered `entries`), including the merge of
  multiple book-shards of one work (not a trivial file-copy identity).
- Same seed ⇒ identical `questions.jsonl` with identical question IDs and order;
  different seed ⇒ different sample; editing a corpus changes the input hash and a
  resume against the changed set is refused.
- Generation excludes a wrong-work `verify_source` negative whose text also occurs
  in the attributed work, and an `identify_version` item whose wording is shared
  across versions.
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
| Copyright on translations (NABRE) in a public repo | Medium | High | Don't commit derived corpora until cleared; synthetic fixtures; build-time conversion |
| Copyrighted text leaking into committed derived artifacts (questions/answers/scores/smoke) | Medium | High | Gate covers derived artifacts; redact/hash NABRE text; committed live evidence uses public-domain/synthetic corpora |
| Quran corpus unavailable (JaleesBench access is the only stated source) | Medium | High | Fall back to an openly-licensed public source (Tanzil / quran.com JSON); it also sidesteps licensing and is committable |
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
