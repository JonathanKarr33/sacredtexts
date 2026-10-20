# Specification: Original-language-only question set — four templates, per-text quota, ask_as/citation_hint metadata

<!--
SPEC vs PLAN BOUNDARY:
This spec defines WHAT and WHY. The plan defines HOW and WHEN.
Keep implementation phases, file paths, code, and "first we will… then we will…"
out of the spec — those belong in codev/plans/26-*.md.
-->

## Problem Statement

The benchmark asks models to recognize, retrieve, and generate sacred text (Phase 1). Today the
question set is shaped by two choices that no longer match how Waleed wants the benchmark to
measure fidelity:

1. **It mixes original-language editions with translations.** When we ask a model to reproduce
   "the KJV of John 3:16," a correct answer tests the model's memory of one *English translation* —
   an editorial artifact — not its fidelity to the text as composed. A translation has many valid
   renderings; the benchmark's exact/normalized-containment scoring treats one chosen edition as
   ground truth, which is the wrong measurement for a translated work. Waleed's decision
   (2026-10-20): **a text is in scope only when the edition we hold is in the language it was
   composed in.**

2. **It balances questions per tradition, not per text, and the prompts leak internal identifiers.**
   The current generator draws a per-task quota balanced across traditions, and renders prompts
   from the raw `version` string — e.g. *"Please give me the Uthmani (QUL) quote for 7:70."* No real
   person asks that way; "Uthmani (QUL)" is our cataloguing label, and `7:70` is handed over with no
   hint of the citation shape we score against. This both reads unnaturally and gives the model no
   fair chance to answer in the form the scorer expects.

Separately, a **paper gate (#23)** blocks reporting any `verify_source` number: `parse_yes_no`
currently matches the *first* yes/no token anywhere in the answer, so a negation-evading answer
("there is no way to verify this … yes") can score correct on a false-premise question — and
`verify_source` is the benchmark's false-premise instrument. Because Spec 26 promotes
`verify_source` to one of four headline tasks, this gate must close here.

**Who is affected:** Waleed and the working group (benchmark validity); anyone reading a run's
scores or the viewer; future contributors adding corpora (the metadata contract changes).

## Current State

- **Selection & quota.** `generate` takes `--per-task` (default 10), draws a tradition-balanced
  sample (`_balanced_sample`, round-robin over each tradition's primary-tradition sub-pool), and
  supports per-task `--quota task=N` overrides. Restricted targets are excluded unless
  `--include-restricted`. There is no notion of "original language" and no per-text quota.
- **Six templates.** `TASKS = (identify_version, retrieve_quote, verify_source, complete_unit,
  cite_passage, identify_source)`. Prompts are rendered from `doc.work` / `doc.version` directly;
  e.g. `retrieve_quote` → *"Please give me the {version} quote for {citation}. Reply with the exact
  text …"*. `identify_version` requires ≥2 editions of one work; `identify_source` asks "Where is
  this quote from? Name the work and the citation."
- **Catalogue.** Each `source.yaml` target carries `payload, converter, work, version, language,
  document_type, tradition[], license (+ license_detail)`. `catalogue.py` fail-fasts on any missing
  required field, naming the file and target index. There is **no** `original_language`, `ask_as`,
  or `citation_hint` field; whether an edition is original-language vs translation is only implied
  in prose comments (and TUTORIAL even miscalls KJV an "original language").
- **Scoring.** `parse_yes_no` returns the first `\b(yes|no)\b` anywhere in the normalized answer.
  score.py's own docstring flags this as a known gap that must be hardened before any
  `verify_source`/`identify_source` number is reported (the #23 constraint). This worktree is
  **pre-Spec-15**: no `refused` outcome, no `coverage`, no grader registry.
- **Summary.** `summary.md`/`summary.json` render models×tasks, a by-tradition table, panel
  composition, and token usage. There is **no per-text table**.
- **Texts.** Six `source.yaml` files enumerate the committable corpus. The original-language,
  non-restricted targets are: the Qur'an (Uthmani, ar), nine classical hadith collections
  (sunnah.com Arabic, ar), and the Talmud Bavli Aramaic edition (he) — 11 — plus the Book of Mormon,
  Doctrine and Covenants, and Pearl of Great Price (LDS 2013, composed in English) — 3 — for **14
  texts**. Original-language **but restricted**: TLG Greek (grc), local-only. Translations
  (out of scope by default): Talmud English, KJV/ASV/WEB, Papal Encyclicals (Vatican English —
  composed in Latin), NABRE (restricted).

## Desired State

- **Default selection is original-language-only.** `generate` with no extra flags emits questions
  only for targets flagged `original_language: true` and not `restricted`. `--include-translations`
  opts the translations back in; `--include-restricted` keeps its existing meaning (TLG stays
  local-only, audit gate unchanged).
- **One text = one `(work, version, language)` target, 15–30 questions each (default 20),** split
  evenly over exactly four templates (5 each at the default). The per-task quota and the
  tradition-balanced sampler are gone — replaced, not kept alongside. Generation fails fast when a
  text cannot fill its quota.
- **Exactly four templates, rendered in natural language** using new metadata so prompts read the
  way a person would ask (`ask_as` for the edition, `citation_hint` appended to the "where" prompt):

  | task | rendered prompt | expected |
  |---|---|---|
  | `retrieve_quote` | *What is the text of {ask_as} {citation}? Reply with the exact text of that {unit_type} and nothing else.* | `{text}` |
  | `complete_unit` | *Please complete this quote from {ask_as}: "{first half}" Reply with only the remaining words.* | `{remainder, full_text}` |
  | `cite_passage` | *Where in {ask_as} can I find this quote? "{text}" Answer with the citation only ({citation_hint}).* | `{citation}` |
  | `verify_source` | *Is the following text from {ask_as}? "{text}" Answer Yes or No.* | `{yes/no, true_work, true_version}` |

  `identify_version` and `identify_source` are retired from code, scoring, and docs.
- **Catalogue carries three new required per-target fields** — `original_language` (bool), `ask_as`
  (str), `citation_hint` (str) — validated like the existing required fields, fail-fast with
  file+target named, with `original_language` required to be a real bool. Every committed
  `source.yaml` is updated. The `Document` interchange format is unchanged (these are catalogue
  facts, not document facts).
- **`verify_source` scoring is hardened (closes #23).** `parse_yes_no` takes the **leading** stance
  — the first sentence / first 60 chars after stripping surrounding quotes — not the first yes/no
  anywhere. A declining answer with no stance is not a yes/no (refused). Adversarial tests pin the
  behavior. #23 is closed when this lands.
- **Summary gains a per-text table** (text, n, accuracy, coverage, refused), since per-tradition
  balance no longer holds (9 of 14 committable texts are hadith collections).
- **A fresh committed run** demonstrates the new question set end to end, with a README, scores
  re-deriving bit-for-bit from answers.
- **Docs reflect the change:** TUTORIAL (four templates, `--per-text`), CODE_WALKTHROUGH (Recipe A
  step 2 documents the three fields; pointer-guard green), pipelines/README (Source catalogue
  fields), arch-critical (Phase-1 line gains "original-language editions only by default").

## Success Criteria

- [ ] Every committed `source.yaml` carries `original_language`, `ask_as`, `citation_hint` on every
      target; a missing one fails `catalogue` loading with the file and target index named, and a
      non-bool `original_language` is rejected.
- [ ] `generate` with defaults selects exactly the `original_language: true`, non-restricted targets
      (14 committable texts) and emits N questions per text, N/4 per template (5 each at N=20 →
      ~280 questions); `--include-translations` additionally includes the `original_language: false`
      targets.
- [ ] Rendered prompts use `ask_as`, never the raw `version` string; `cite_passage` appends
      `citation_hint`.
- [ ] `identify_version` and `identify_source` are absent from `TASKS`, `_build`, `score.py`, and
      the docs (TUTORIAL / CODE_WALKTHROUGH / module docstrings).
- [ ] `parse_yes_no` uses leading-stance parsing; the adversarial cases all classify correctly:
      `"There is no way to verify this... Yes"` → not yes; `"No, that is from Sahih Muslim"` → no;
      `"Yes."` → yes; a decline cue with no stance → refused. Issue #23 is closed.
- [ ] `verify_source` template-4 negatives attribute a real passage from a *different* in-scope text
      to this edition (truth = "no"), keep the existing exclusion when the passage also occurs in the
      attributed text, and keep the 50/50 yes/no mix.
- [ ] The manifest records `per_text`, `include_translations`, and the list of selected texts;
      the question-set digest machinery is unchanged.
- [ ] `summary.md`/`summary.json` include a per-text table (text, n, accuracy, coverage, refused).
- [ ] A fresh `runs/original-<date>/` is committed with a README; scores re-derive bit-for-bit from
      the committed answers.
- [ ] Pipeline + viewer test suites are green; the copyright audit gate is green.

## Constraints

**Baked decisions (from Waleed via issue #26, 2026-10-20 — fixed; not relitigated here):**

1. **Original languages only, no translations.** A text is in scope only when the edition we hold is
   in the language it was composed in. Default selection = `original_language: true` & non-restricted;
   `--include-translations` opts the rest in.
2. **15–30 questions per text, default 20**, where one text = one `(work, version, language)` target —
   replacing per-tradition balancing. Split evenly over the four templates (5 each at 20). Fail fast
   when a text can't fill its quota.
3. **Exactly four templates, verbatim shapes from Waleed:**
   1. What is the text of \<edition\> \<citation\>?
   2. Please complete this quote from \<edition\>? \<excerpt\>
   3. Where in \<edition\> can I find this quote? \<text\>
   4. Is \<text\> from \<edition\>?
4. **Metadata, three new required per-target fields** (fail-fast if missing):
   - `original_language` (bool) — this edition is in the language the text was composed in. Mapping:
     Qur'an Uthmani → true; KJV/ASV/WEB/NABRE → false; Talmud Aramaic → true, Talmud English → false;
     the nine hadith collections → true; Book of Mormon / D&C / Pearl of Great Price (2013) → true
     (composed in English); Papal Encyclicals (Vatican English) → false; TLG Greek → true.
   - `ask_as` (str) — how a person names this edition; rendered as `<edition>` (e.g. `the Qur'an`,
     `Sahih al-Bukhari`, `the Talmud (Aramaic)`, `the Book of Mormon`, `the King James Bible`).
   - `citation_hint` (str) — how a person says a citation; appended to template 3 (e.g.
     `surah:ayah, e.g. 7:70`; `tractate, daf and line, e.g. Chullin 26b:12`; `the hadith number as
     on sunnah.com, e.g. Sahih al-Bukhari 1234`; `book chapter:verse, e.g. Alma 32:21`).
5. **Retire `identify_version` and `identify_source`** from `TASKS`, `_build`, `score.py`, and docs.
   `identify_version` needs ≥2 editions of one work and is dead under original-language-only;
   template 3 (`cite_passage`) subsumes `identify_source`.
6. **Fold in #23:** `parse_yes_no` takes the leading stance (first sentence / first 60 chars after
   stripping quotes). Close #23 when it lands.

**Other constraints:**

- The `Document` interchange format and the question-set digest machinery are unchanged.
- Task **names are preserved** where they already exist (`retrieve_quote`, `complete_unit`,
  `cite_passage`, `verify_source`) so `score.py` rules carry over.
- Restricted behaviour and the copyright audit gate are unchanged; TLG runs stay local-only; never
  commit standardized docs or run artifacts derived from a restricted target.
- The fresh run must write to a **new** `runs/original-<date>/`, never re-run `collect`/`score`/
  `generate` over committed evidence (would zero out committed panel/usage proof).
- Live panel: Anthropic haiku + opus, search on/off, from `configs/models.example.yaml`; keys loaded
  only from `sacredtexts/.env` (path only, never printed; never another project's `.env`). `web_search`
  is Anthropic-only; if `ANTHROPIC_API_KEY` is absent, stop at the live-run step and report to the
  architect (do not substitute OpenRouter).

## Assumptions

- **Dependency on Spec 15 / PR #24 (OPEN, not merged at spec time).** Spec 15 establishes the
  containment headline, the `refused` outcome, `coverage`, and the named-grader framework — the
  headline for templates 1–2, which Spec 26 does **not** change. Per issue #26: build on `main` and
  merge `origin/main` when #24 lands; conflicts are expected in TUTORIAL.md / CODE_WALKTHROUGH.md /
  score.py docstrings. #23's hardening (leading-stance `parse_yes_no`) sits on top of whatever
  `parse_yes_no` exists at merge time. This worktree's current score.py is pre-Spec-15.
- The 14 committable original-language texts each hold enough qualifying passages to fill 20
  questions across the four templates (hadith/Qur'an/Talmud-Aramaic/LDS pools are large). If a text
  cannot, generation fails fast and the architect decides (lower the default, or exclude that text).
- `complete_unit` and `verify_source` keep their existing pool-gating semantics (minimum word counts,
  negative-eligibility exclusion) unless they conflict with the four-template reshape.
- `ANTHROPIC_API_KEY` is present in `sacredtexts/.env`; otherwise the live run is deferred.

## Solution Approaches

The *shape* of the solution is fixed by the baked decisions; the open design latitude is narrow and
concerns how the quota is distributed and how leading-stance parsing is defined. Two decisions worth
recording with alternatives:

### Approach 1 (recommended): Per-text even split with explicit fail-fast

For each selected text, request `per_text / 4` items per template; a template that cannot supply its
share fails the whole run fast (naming the text and template). **Pros:** simplest, deterministic,
makes thin corpora visible immediately; matches the issue's "fail fast when a text can't fill its
quota." **Cons:** one weak template on one text blocks the run until the operator intervenes.
**Risk/complexity:** low. Recommended because the issue explicitly asks for fail-fast and even split,
and silent rebalancing would hide corpus gaps the benchmark should surface.

### Approach 2 (rejected): Per-text quota with rebalancing across templates

If a template falls short on a text, redistribute its deficit to the other three. **Pros:** always
fills `per_text`. **Cons:** breaks the "N/4 per template" acceptance criterion, hides corpus
weakness, and makes per-text/per-template counts non-uniform and harder to reason about.
**Risk/complexity:** medium. Rejected — conflicts with a success criterion.

### Leading-stance parsing: scope of "leading"

Recommended: strip surrounding quotes/whitespace, then take the **first sentence or the first 60
characters, whichever is shorter**, and look for a yes/no stance there; a decline cue with no stance
is refused. Alternative (rejected): first *line* only — too easily defeated by a single run-on
sentence. The 60-char/first-sentence window is what the issue specifies and what the adversarial
tests encode.

## Open Questions

- **Critical** — Will Spec 15 / PR #24 merge before Spec 26's implementation reaches scoring, and in
  what order should the branches integrate? (The issue bakes the answer: build on `main`, merge
  `origin/main` when #24 lands. Surface to architect if #24's shape changes `parse_yes_no` or the
  summary structure in a way that conflicts.)
- **Critical** — Is `ANTHROPIC_API_KEY` present in `sacredtexts/.env` for the live panel? If not, the
  run step is deferred and reported, per the baked constraint.
- **Important** — Exact `ask_as` / `citation_hint` wording for each of the 14 committable texts (and
  the translations/TLG for completeness). The issue gives representative examples; the builder fills
  the rest to read naturally and to match the citation shape the scorer expects. Non-blocking:
  catalogue validation only requires the fields to be present non-empty strings.
- **Important** — Does any committable text have fewer than 20 qualifying passages for some template
  (e.g. short-unit filters on `complete_unit`)? Resolved empirically at generate time via fail-fast.
- **Nice-to-know** — Whether the per-text summary table should also break down by template, or stay
  at text granularity (issue specifies: text, n, accuracy, coverage, refused — text granularity).

## Test Scenarios

**Catalogue validation**
- A `source.yaml` missing `original_language` (or `ask_as`, or `citation_hint`) fails loading, naming
  the file and `targets[i]`.
- `original_language: "true"` (string) or a non-bool is rejected as not a bool.
- A valid target with all three fields loads and exposes them on `Target`.

**Selection & quota**
- Default generate over the full catalogue selects exactly the 14 original-language, non-restricted
  texts; counts 5 per template per text at `--per-text 20`.
- `--include-translations` adds the `original_language: false` non-restricted targets.
- `--include-restricted` behaviour unchanged; TLG only appears with it and stays local-only.
- A text that cannot fill its per-template share fails fast, naming the text and template.
- Manifest records `per_text`, `include_translations`, and the selected-texts list; digest unchanged.

**Prompt rendering**
- Each template's rendered prompt uses `ask_as` (never the raw `version`); `cite_passage` ends with
  the text's `citation_hint`.
- `complete_unit` splits the unit and asks for the remainder; `verify_source` yes/no mix is ~50/50;
  negatives attribute a real passage from a different in-scope text, excluding passages also present
  in the attributed text.

**Scoring (leading stance, #23)**
- `"There is no way to verify this... Yes"` → not classified yes (so a false-premise "no" is not
  gamed into correct).
- `"No, that is from Sahih Muslim"` → no.
- `"Yes."` → yes.
- A decline cue with no stance → refused (not a spurious yes/no).
- Retired tasks: scoring `identify_version`/`identify_source` is removed; no test references them.

**End-to-end / evidence**
- A fresh `runs/original-<date>/` generates ~280 questions, runs the tutorial panel, scores, and the
  scores re-derive bit-for-bit from the committed answers.
- Copyright audit gate green on the committed run (no restricted-derived artifact).
- Viewer renders the new run (per-text table present in summary).

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| PR #24 (Spec 15) merges mid-flight and conflicts in score.py / docs | High | Medium | Build on `main`; merge `origin/main` when #24 lands; expect conflicts in TUTORIAL / CODE_WALKTHROUGH / score.py docstrings; reconcile leading-stance parsing onto #24's `parse_yes_no`. |
| A committable text can't fill 20 questions for some template | Medium | Medium | Fail fast naming text+template; architect decides default or exclusion. Surface via `afx send`. |
| `ANTHROPIC_API_KEY` absent → live run blocked (web_search is Anthropic-only) | Medium | Medium | Stop at live-run step, report to architect; do not substitute OpenRouter. Deliver everything else. |
| Re-running score/collect over committed evidence nulls the panel/usage proof | Low | High | Always write to a fresh `runs/original-<date>/`; never target committed runs. |
| `ask_as`/`citation_hint` wording drifts from the scored citation shape | Medium | Low | Derive wording from real reference data and the scorer's citation regexes; verify with the live/smoke run. |
| Leading-stance window too narrow/wide, mis-scoring real answers | Low | Medium | Encode the adversarial cases as tests; use first-sentence/first-60-chars as specified. |

## References

- Issue #26 — Original-language-only question set (the governing issue; baked decisions above).
- Issue #23 — PAPER GATE: harden `verify_source` scoring (closed by this spec's leading-stance change).
- Spec 15 / PR #24 (OPEN) — `codev/specs/15-scoring-contract-contains-exac.md` on branch
  `builder/aspir-15`: containment headline, `refused` outcome + coverage, named graders. Dependency.
- `codev/resources/arch-critical.md` — pipeline shape, scoring contract, copyright gate.
- `codev/resources/lessons-critical.md` — fresh-run discipline, live-smoke, derive-from-real-data.
- `pipelines/sacredbench/{catalogue,generate,score}.py`; `texts/raw/*/source.yaml`; TUTORIAL.md;
  CODE_WALKTHROUGH.md; pipelines/README.md.
