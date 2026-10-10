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

1. **Corpora are drop-in directories** under `texts/<corpus-id>/` — adding a faith
   tradition's texts adds a directory, never changes core code. Each corpus holds
   small metadata (YAML: tradition list, work, version, language, document_type,
   source/provenance) plus the text units as **JSONL** (one entry per line:
   `{unit_type, citation, text}`). Core discovers corpora by globbing.
2. **Converters** turn known source shapes (NABRE books, encyclicals, Quran JSON,
   …) into corpora, and an **exporter** emits the group's agreed interchange JSON
   (Nancy's flat format) for Box/group sharing. Adding a source format = one
   converter function + a registry line.
3. **Benchmark generation**: deterministic (seeded) sampling over corpora through
   the six agreed templates → `questions.jsonl`. Includes **false-premise
   negatives** (real text attributed to the wrong work) for the
   reject-false-premises objective; LLM-assisted *fabricated-text* items are a
   later stage behind the same seam.
4. **Collection**: fan every question out to a configured multi-provider model
   panel (Anthropic, any OpenAI-compatible host incl. OpenRouter, Gemini) →
   `answers.jsonl`. Resumable; concurrency-bounded; failed cells stay pending and
   exit non-zero.
5. **Scoring**: every answer gets **both** strictness tiers (exact; normalized)
   **and** a graded similarity (token-F1 in v1; embedding/judge-based semantic
   scoring is a pluggable later metric) → `scores.jsonl` + per-model×task summary.
6. **Analysis & visualisation**: aggregate accuracy per model × task × tradition,
   matplotlib figures suitable for the paper; the group wants publicly useful
   visualisation (a browser SPA à la multibrowser is a follow-on spec).

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

| task | template | correct answer |
|---|---|---|
| identify_version | "Which version of «work» says «text»?" | the version |
| retrieve_quote | "Please give me the «version» quote for «citation»" | exact text |
| verify_source | "Is «text» from «work»?" (incl. wrong-work negatives) | yes/no |
| complete_unit | "Please complete this «unit_type»: «beginning»" | the remainder |
| cite_passage | "What is the source citation for this passage from «work»?" | the citation |
| identify_source | "Where is this quote from? «text»" | work + citation |

## Success Criteria

- [ ] `texts/` holds ≥2 traditions' corpora (Catholic: NABRE + ≥1 encyclical;
      Islam: Quran) in the drop-in format, produced by converters from the real
      source JSON, with a validator that mechanically gates the format.
- [ ] Exporter emits interchange JSON that round-trips (`corpus → interchange →
      corpus` is lossless).
- [ ] `generate` is deterministic for a fixed seed; every question carries exact
      expected answer + full source coordinates; verify_source includes negatives.
- [ ] `collect` runs a ≥3-model panel spanning ≥2 providers; resumable; partial
      failure exits non-zero with the failed cells listed.
- [ ] `score` emits per-answer exact/normalized/token-F1 (+ per-task headline
      `correct`), and a per-model × task × tradition summary (JSON + markdown).
- [ ] One end-to-end smoke run on live providers (small question count) committed
      as evidence, with usage/cost totals computed from the data.
- [ ] Unit tests cover converters (against real-shape fixtures), generation
      determinism, scoring metrics; all pass via the repo's test gate.
- [ ] Demo-able for the Mon Oct 12 meeting: a one-command run on a small slice
      producing the summary table.

## Constraints

- **Human oversight**: AI-generated code is acceptable to the group only with
  human review and output validated against the sources (Nancy's condition on
  Codev). SPIR's human gates are the mechanism.
- **Copyright**: encyclicals/CST are cleared per Jonathan. NABRE is a copyrighted
  translation — texts/ corpora derived from it are **not committed** to this
  public repo until licensing is confirmed; converters pull from Jonathan's repo
  (or Box) at build time instead. Committed fixtures use tiny synthetic data.
- **Public repo**: no API keys, no personal-key leakage (live-run key discipline
  as in multibench); results committed must be scores+metadata, not bulk text.
- **Stack**: Python uv project(s), Typer CLIs, fail-fast (no silent fallbacks),
  JSONL seams between stages — matching multibench conventions so the team can
  move between the repos.
- **Interop**: the group's interchange format is Nancy's JSON, verbatim — our
  internal corpus layout must export to it losslessly.

## Assumptions

- Jonathan's repos may still appear; this pipeline must be able to consume his
  dataset repo as a source (it already does) and to export interchange JSON his
  tooling can consume. If his code repo lands, we reconcile rather than compete.
- Quran JSON is obtainable from JaleesBench quranquote data (same org access).
- Model panel for the first real run is decided at run time by config, not code;
  Nancy's Gemini Nano request is handled as a panel-config question (open below).

## Solution Approaches

### Approach 1 (recommended): multibench-style file-based corpora + staged JSONL pipeline

Drop-in `texts/<corpus-id>/` (YAML metadata + entries.jsonl) mirroring the
tradition-module pattern; one `pipelines/` uv project with subsystems as modules
(convert/generate/collect/score) and JSONL seams. Pros: proven in multibench;
multi-faith by construction; resumable; group interchange via exporter. Cons: two
representations (internal corpus + interchange) need a round-trip guarantee.

### Approach 2: interchange JSON as the only representation

Pipeline reads Nancy's JSON documents directly, no internal corpus tier. Pros: one
format. Cons: large single-array JSON files (31k Bible verses) are unwieldy for
streaming/resume; no per-corpus metadata home (provenance, converter identity);
diverges from the proven multibench layout; harder to gate with a validator.

### Approach 3: wait for Jonathan's repos

Pros: no duplicated effort. Cons: nothing has arrived since Oct 5; the Monday
meeting needs a pipeline update; Waleed already offered (Oct 8) to take a shot.

## Open Questions

- **Critical** — none blocking implementation of the above.
- **Important**: semantic-similarity scoring beyond token-F1 (embeddings? LLM
  judge?) — group question, Nancy leans "test both"; design keeps the metric
  pluggable. · Gemini Nano in the panel (Nancy's unanswered request): on-device
  model, not reachable via the Gemini API — needs a stance (e.g. AI Studio /
  Chrome built-in harness, or report as out-of-scope for the API panel).
- **Nice-to-know**: translation-agnostic queries (multi-translation + BLEU-style
  metrics) — explicitly deferred by the group; fabricated-text (not just
  wrong-attribution) negatives via LLM generation with human review.

## Test Scenarios

- Converter fed real-shape NABRE/encyclical fixtures produces valid corpora;
  malformed shapes fail loudly naming the file.
- `corpus → interchange → corpus` round-trip is byte-stable on entries.
- Same seed ⇒ identical questions.jsonl; different seed ⇒ different sample.
- Collection with a dead provider key fails that model's cells, exits non-zero,
  and a re-run with the key fixed fills exactly the missing cells.
- Scoring: curated answer fixtures hit expected exact/normalized/token-F1 values
  (incl. unicode-quote and punctuation-only divergences); verify_source parses
  "Yes."/"no," variants; wrong-citation answers score 0.
- Live smoke (budgeted, small) against ≥2 providers verifies the real path
  (mock-boundary lesson from multibench).

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Duplicate effort vs Jonathan's unshared repos | Medium | Medium | Converter consumes his dataset repo; exporter emits group format; share early at Monday's meeting |
| Copyright on translations (NABRE) in a public repo | Medium | High | Don't commit derived corpora until cleared; synthetic fixtures; build-time conversion |
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
