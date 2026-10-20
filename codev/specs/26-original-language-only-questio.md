# Specification: Original-language-only question set — four templates, per-text quota, requested_as/canonical_language metadata

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
  required field, naming the file and target index. There is **no** `requested_as` or
  `canonical_language` field; whether an edition is original-language vs translation is only implied
  in prose comments (and TUTORIAL even miscalls KJV an "original language").
- **Scoring.** `parse_yes_no` returns the first `\b(yes|no)\b` anywhere in the normalized answer.
  score.py's own docstring flags this as a known gap that must be hardened before any
  `verify_source`/`identify_source` number is reported (the #23 constraint). This worktree is
  **pre-Spec-15**: no `refused` outcome, no `coverage`, no grader registry.
- **Summary.** `summary.md`/`summary.json` render models×tasks, a by-tradition table, panel
  composition, and token usage. There is **no per-text table**.
- **Texts.** Six `source.yaml` files enumerate **21 catalogue targets** (after removing the two
  `KJV (LDS 2013 edition)` targets per the #26 field table). Full census with `canonical_language` and
  whether each is included (`language == canonical_language`); starting values on issue #27:

  | tradition | work | version | lang | canon_lang | license | included |
  |---|---|---|---|---|---|---|
  | Sunni Islam | The Qur'an | Uthmani (QUL) | ar | ar | public-domain | **yes** |
  | Sunni Islam | Sahih al-Bukhari / Muslim / Abi Dawud / at-Tirmidhi / an-Nasa'i / Ibn Majah / Muwatta Malik / Musnad Ahmad / al-Darimi (9) | sunnah.com Arabic | ar | ar | public-domain | **yes** (×9) |
  | Judaism | Talmud Bavli | Davidson Aramaic | he | he | open | **yes** |
  | Judaism | Talmud Bavli | Davidson English | en | he | open | no |
  | LDS | Book of Mormon | 2013 | en | en | open | **yes** |
  | LDS | Doctrine and Covenants | 2013 | en | en | open | **yes** |
  | LDS | Pearl of Great Price | 2013 | en | en | open | **yes** |
  | Protestant | The Bible | KJV / ASV (1901) / WEB (3) | en | en | public-domain | **yes** (×3) |
  | Roman Catholic | Papal Encyclicals | Vatican English | en | la | open | no (composed in Latin) |
  | Roman Catholic | The Bible | NABRE | en | en | restricted | no (restricted) |
  | Greek Orthodox | Septuagint & Greek NT | TLG | grc | grc | restricted | **yes** (restricted) |

  (`canonical_language` values are the #27 table verbatim; per the architect's decision the English
  Bibles are treated as English-canonical and stay in — #27 Q1.) **Default selection
  (`language == canonical_language` & non-restricted) = 17 texts:** Qur'an + 9 hadith + Talmud Aramaic
  + Book of Mormon + D&C + Pearl of Great Price + KJV + ASV + WEB. Included **but restricted** (local
  only, `--include-restricted`): NABRE, TLG Greek. Translations added by `--include-translations`:
  Talmud English, Papal Encyclicals.

## Desired State

- **Default selection is original-language-only.** `generate` with no extra flags emits questions
  only for texts where `language == canonical_language` (the equality inclusion rule) and not
  `restricted`. `--include-translations` opts the translations back in; `--include-restricted` keeps
  its existing meaning (TLG stays local-only, audit gate unchanged).
- **One text = one `(work, version, language)` group, 15–30 questions each (default 28 → 7 per
  template),** split as evenly as possible over the active templates. A "text" is the set of
  standardized documents sharing `(work, version, language)` — **not** a single catalogue target (the
  Talmud Aramaic single target yields dozens of per-tractate documents; grouping is on the tuple). For
  a `--per-text N` not divisible by the active-task count, the split is deterministic: `N // len(active)`
  per task plus one extra to the first `N % len(active)` in the canonical order (`retrieve_quote`,
  `complete_unit`, `cite_passage`, `verify_source`). The per-task quota and the tradition-balanced
  sampler are gone — replaced, not kept alongside. Generation fails fast (naming the text and the
  template) when a text cannot fill a template's share.
- **The two new fields reach generation through a `(work, version, language)`-keyed map.** `generate`
  consumes standardized `Document`s, which (correctly, unchanged) carry no catalogue facts; `license`
  reaches generation only as a path *filter* (`load_documents` discards the path→doc link), which
  structurally cannot feed a name into the prompt renderer. So `requested_as` and `canonical_language`
  travel a fail-closed `text_metadata` map keyed on `(work, version, language)` (a doc whose tuple is
  absent raises `CatalogueError`), with slug-agreement across targets sharing a slug.
- **Exactly four templates, rendered in natural language.** `<edition>` is a **seeded uniform choice**
  from the text's `requested_as` list, recorded in `question.source.requested_as`. **The rendered
  prompt strings below are the authoritative contract** (they feed the question-set digest); Waleed's
  four-line shorthand in Constraints conveys intent, and where they differ in punctuation/wording the
  rendered string here governs.

  | task | rendered prompt | expected |
  |---|---|---|
  | `retrieve_quote` | *What is the text of {edition} {display_citation}? Reply with the exact text of that {unit_type} and nothing else.* | `{text}` |
  | `complete_unit` | *Please complete this quote from {edition}: "{first half}" Reply with only the remaining words.* | `{remainder, full_text}` |
  | `cite_passage` | *Where in {edition} can I find this quote? "{text}" Answer with the citation only, in the same form as: {example_citation}.* | `{citation}` |
  | `verify_source` | *Is the following text from {edition}? "{text}" Answer Yes or No.* | `{yes/no, true_work, true_version}` |

  **Template 3 shows the citation form by example** — `{example_citation}` is an exemplar citation from
  a **different seeded entry of the same text** (replacing the dropped `citation_hint`), so the model
  answers in the scored shape; this requires ≥2 entries per text (fail-fast otherwise).

  **No duplicated edition name.** Stored citations for the nine hadith collections
  (`convert.py` → `"Sahih al-Bukhari 1"`) and Doctrine and Covenants (`"Doctrine and Covenants 1:1"`)
  are work-prefixed — 10 of the 17 in-scope texts. `retrieve_quote` therefore renders a
  **`display_citation`**: the stored `citation` with a leading `work`/edition-name prefix stripped, so
  the edition name appears exactly once (*"What is the text of Sahih al-Bukhari 1?"*, not *"…Sahih
  al-Bukhari Sahih al-Bukhari 1?"*). The stored `citation` and all scored ground truth are unchanged;
  `cite_passage`'s expected answer is still the full stored citation. Qur'an (`7:70`), Talmud
  (`Chullin 26b:12`), Book of Mormon / Pearl of Great Price (`Alma 32:21`) render unchanged.

  `identify_version` and `identify_source` are retired from code, scoring, **and the viewer**
  (`apps/viewer` has task-specific handling at `localResults.ts`, `explorer.test.ts`,
  `QuestionList.test.tsx`) and docs.

- **Prompt and answer language.** The four prompt templates are in **English**; 11 of the 17 in-scope
  texts are Arabic/Hebrew, so for templates 1–2 the *answer* is expected in the source script (Arabic
  for Qur'an/hadith, Aramaic for Talmud), scored by the script-aware `normalize()`. For `cite_passage`,
  the by-example exemplar steers the model to answer the citation in the Latin-script/colon shape the
  scorer extracts (see the cite_passage scoring risk below).
- **Catalogue carries two new required per-target fields** — `requested_as` (list[str], ≥1) and
  `canonical_language` (str) — validated like the existing required fields, fail-fast with
  file+target named. The two `KJV (LDS 2013 edition)` targets are removed. Every committed
  `source.yaml` is updated. The `Document` interchange format is unchanged (these are catalogue
  facts, not document facts).
- **`verify_source` scoring is hardened (closes #23).** `parse_yes_no` takes the **leading** stance
  — the first sentence / first 60 chars after stripping surrounding quotes — not the first yes/no
  anywhere. The leading window is extracted from the **raw answer before `normalize()`** runs, because
  `normalize()` deletes punctuation (`_PUNCT_RE`) and so erases the sentence boundary the window
  depends on (same ordering-sensitivity class as the arch-critical normalize-pass invariant). A
  leading **decline cue** (e.g. "There is no way to verify this") yields **no stance** → the parser
  returns `None`; it is neither "yes" nor "no". Concretely `"There is no way to verify this... Yes"`
  must **not** return "yes" and must **not** return "no" (the incidental "no" in "no way" is not a
  stance) — it is a decline. Full classification of a `None` result as the **`refused`** outcome is
  Spec 15 machinery (see dependency below); the leading-stance parser's own contract is yes / no /
  `None`. Adversarial tests pin the behavior. #23 is closed when the leading-stance parser lands and
  (per #23) no `verify_source` number is reported until it is hardened.
- **Summary gains a per-text table** (text, n, accuracy, coverage, refused), **keyed by model then
  text** — mirroring the existing `by_tradition` structure (`summary.json` → `by_text[model_id][text]`,
  markdown rendered per model), since the committed run is a multi-model panel and pooling across
  models would be meaningless. Per-tradition balance no longer holds (9 of 17 committable texts are
  hadith collections). `coverage` = `(correct + incorrect) / n` and `refused` are Spec 15 outcomes,
  which Spec 26 builds on as its base (architect-confirmed #24 merges before scoring; see dependency).
- **A fresh committed run** demonstrates the new question set end to end, with a README, scores
  re-deriving bit-for-bit from answers.
- **Docs reflect the change:** TUTORIAL (four templates, `--per-text`), CODE_WALKTHROUGH (Recipe A
  step 2 documents the three fields; pointer-guard green), pipelines/README (Source catalogue
  fields), arch-critical (Phase-1 line gains "original-language editions only by default").

## Success Criteria

- [ ] Every committed `source.yaml` carries `requested_as` (≥1) and `canonical_language` on every
      target; a missing or ill-typed one fails `catalogue` loading with the file and target index named;
      the two `KJV (LDS 2013 edition)` targets are removed (21 targets total).
- [ ] `generate` with defaults selects exactly the included (`language == canonical_language`),
      non-restricted texts (17, grouped by `(work, version, language)`) and emits N questions per text
      split over the active templates — exactly N/4 per template when N divides evenly (7 each at the
      default N=28 → 476 questions), else the deterministic `N // len(active)` + remainder allocation;
      `--include-translations` additionally includes the excluded, non-restricted texts.
- [ ] Prompts render `<edition>` as a seeded choice from `requested_as` (recorded in
      `question.source.requested_as`), never the raw `version`; `cite_passage` shows the citation form
      by example from a different seeded entry; and **no prompt duplicates the edition name** —
      `retrieve_quote` over the 9 hadith collections and D&C renders the edition once (via
      `display_citation`).
- [ ] `identify_version` and `identify_source` are absent from `TASKS`, `_build`, `score.py`, the
      viewer (`apps/viewer`), and the docs (TUTORIAL / CODE_WALKTHROUGH / module docstrings).
- [ ] `parse_yes_no` uses leading-stance parsing; the adversarial cases all classify correctly:
      `"There is no way to verify this... Yes"` → not yes; `"No, that is from Sahih Muslim"` → no;
      `"Yes."` → yes; a decline cue with no stance → refused. Issue #23 is closed.
- [ ] `verify_source` template-4 negatives attribute a real passage from a *different* in-scope text
      to this edition (truth = "no"), keep the existing exclusion when the passage also occurs in the
      attributed text, and apply the existing deterministic negative share
      (`int(verify_template_quota × negatives_share)`, default share 0.5 — at 5 items/text that is 2
      negatives / 3 positives per text, ≈40/60, aggregating deterministically; "50/50" names the share
      parameter, not a guaranteed per-text split — same formula as today).
- [ ] The manifest records `per_text`, `include_translations`, and the list of selected texts;
      the question-set digest machinery is unchanged.
- [ ] `summary.md`/`summary.json` include a per-text table keyed by model then text (text, n,
      accuracy, coverage, refused — on the Spec 15 outcome contract, which #24 lands before scoring).
- [ ] A fresh `runs/original-<date>/` is committed with a README; scores re-derive bit-for-bit from
      the committed answers.
- [ ] Pipeline + viewer test suites are green; the copyright audit gate is green.

## Constraints

**Baked decisions (from Waleed via issue #26 — fixed; not relitigated here). The metadata/quota
specifics below reflect the architect's FINAL field table posted on #26 (2026-10-20), which supersedes
the original issue-body wording (`ask_as`/`original_language`/`citation_hint`, default 20):**

1. **Original languages only, no translations.** A text is in scope only when the edition we hold is
   in the language it was composed in. Inclusion is **derived**: a text is original-language iff
   `language == canonical_language` (equality). Default selection = included & non-restricted;
   `--include-translations` opts the rest in.
2. **15–30 questions per text, default 28** (→ 7 per template over the four templates), where one text =
   one `(work, version, language)` group — replacing per-tradition balancing. Split evenly over the
   active templates. Fail fast when a text can't fill its quota.
3. **Exactly four templates, verbatim shapes from Waleed:**
   1. What is the text of \<edition\> \<citation\>?
   2. Please complete this quote from \<edition\>? \<excerpt\>
   3. Where in \<edition\> can I find this quote? \<text\> — the citation **form is shown by example**
      (an exemplar citation from a different seeded entry of the same text), not by a hint string.
   4. Is \<text\> from \<edition\>?
   `<edition>` is rendered by a **seeded uniform choice** from the text's `requested_as` list, recorded
   in `question.source.requested_as`.
4. **Metadata, exactly two new required per-target fields** (fail-fast if missing):
   - `requested_as` (list[str], ≥1) — the names people actually use for this edition; `<edition>` is a
     seeded choice from this list (e.g. `["King James Version", "KJV", "KJV Bible"]`;
     `["Qur'an", "Koran", "Quran"]`).
   - `canonical_language` (str) — the language the text was composed in; inclusion = `language ==
     canonical_language`.
   - `citation_hint` is **dropped**; template 3 shows the citation form by example instead.
   - Starting values for every target are the table on **issue #27**. **Remove the two
     `KJV (LDS 2013 edition)` targets** from the LDS `source.yaml` (→ 21 targets).
5. **Retire `identify_version` and `identify_source`** from `TASKS`, `_build`, `score.py`, the viewer,
   and docs. `identify_version` needs ≥2 editions of one work and is dead under original-language-only;
   template 3 (`cite_passage`) subsumes `identify_source`.
6. **Fold in #23:** `parse_yes_no` takes the leading stance (first sentence / first 60 chars after
   stripping quotes). Close the #23 PAPER GATE when it lands.

**Other constraints:**

- The `Document` interchange format and the question-set digest machinery are unchanged.
- **`verify_source` question identity.** A `verify_source` question (positive or negative) belongs to
  the **asked edition** — the one named by the seeded `requested_as` choice in the prompt — and
  aggregates under that text in the per-text summary, because the task tests whether the model knows
  what is in *that* edition. The question's `source` records the asked edition; for a negative,
  `expected` additionally records the passage's true source (`true_work`, `true_version`). Negatives are
  selected at `(work, version, language)` granularity with a **family exclusion** (never attribute a
  passage from the same family — e.g. another of the nine hadith collections — since shared
  variant-wording narrations defeat exact-text exclusion and would make the "no" truth wrong).
- **Authoritative prompt strings.** Where Waleed's four-line shorthand (baked decision 3) and the
  rendered template strings in Desired State differ in punctuation or wording, the Desired-State
  rendered strings govern (they feed the digest and the acceptance tests). The shorthand conveys
  intent, not the exact byte contract.
- Task **names are preserved** where they already exist (`retrieve_quote`, `complete_unit`,
  `cite_passage`, `verify_source`) so `score.py` rules carry over.
- Restricted behaviour and the copyright audit gate are unchanged; TLG runs stay local-only; never
  commit standardized docs or run artifacts derived from a restricted target.
- The fresh run must write to a **new** `runs/original-<date>/`, never re-run `collect`/`score`/
  `generate` over committed evidence (would zero out committed panel/usage proof). Retiring
  `identify_version`/`identify_source` does **not** threaten the existing byte-for-byte re-score
  regression (`test_first_run_regression.py`): the committed `runs/first-run-2026-10-11` manifest is
  `retrieve_quote`-only (100 questions), so it references neither retired task.
- Live panel: Anthropic haiku + opus, search on/off, from `configs/models.example.yaml`; keys loaded
  only from `sacredtexts/.env` (path only, never printed; never another project's `.env`). `web_search`
  is Anthropic-only; if `ANTHROPIC_API_KEY` is absent, stop at the live-run step and report to the
  architect (do not substitute OpenRouter).

## Assumptions

- **Spec 15 / PR #24 is MERGED (architect, 2026-10-20, `origin/main` @ 1324755).** Spec 15 establishes
  the named-grader framework and the always-on **refused** outcome + `coverage` — the headline for
  templates 1–2, which Spec 26 does **not** change. The builder merged `origin/main` before Phase 1, so
  `graders.py` / `outcomes.py` / `score.py`'s `_with_outcome` are the base. The leading-stance
  `parse_yes_no` (returning yes / no / `None`) closes the #23 PAPER GATE on top of that contract; a
  `None` is classified `refused` by the existing outcome layer. There is **no fallback** — if the Spec
  15 base were ever absent, the builder STOPs and pings (fail fast, never implement fallbacks).
- **`--tasks` and `--negatives-share` are retained;** only `--per-task` and `--quota` are removed.
  `--tasks` subsets the four templates and the per-text split then applies over the selected subset at
  `N // len(active)` (so `--tasks retrieve_quote --per-text 28` = 28/text). `--negatives-share` keeps
  its default 0.5 and governs the `verify_source` yes/no mix via the existing deterministic formula.
- The 17 included original-language texts each hold enough qualifying passages to fill 28 questions
  across the four templates (and ≥2 entries per text for `cite_passage`'s target+exemplar). If a text
  cannot, generation fails fast and the architect decides (lower the default, or exclude that text).
- `complete_unit` and `verify_source` keep their existing pool-gating semantics (minimum word counts,
  negative-eligibility exclusion) unless they conflict with the four-template reshape.
- `ANTHROPIC_API_KEY` is present in `sacredtexts/.env`; otherwise the live run is deferred.

## Solution Approaches

The *shape* of the solution is fixed by the baked decisions; the open design latitude is narrow and
concerns how the quota is distributed and how leading-stance parsing is defined. Two decisions worth
recording with alternatives:

### Approach 1 (recommended): Per-text even split with deterministic remainder and fail-fast

For each selected text, request `per_text // len(active)` items per active template, plus one extra to
the first `per_text % len(active)` in the fixed canonical order so any `--per-text` in 15–30 is
well-defined (exactly 7 each at the default 28 over four tasks). A template that cannot supply its share fails the whole run fast
(naming the text and template). **Pros:** simplest, deterministic (the split feeds the digest), makes
thin corpora visible immediately; matches the issue's "fail fast when a text can't fill its quota" and
honors the full 15–30 range without restricting to multiples of 4. **Cons:** one weak template on one
text blocks the run until the operator intervenes. **Risk/complexity:** low. Recommended because the
issue explicitly asks for fail-fast and even split, and silent rebalancing would hide corpus gaps the
benchmark should surface.

### Approach 2 (rejected): Per-text quota with rebalancing across templates

If a template falls short on a text, redistribute its deficit to the other three. **Pros:** always
fills `per_text`. **Cons:** breaks the "N/4 per template" acceptance criterion, hides corpus
weakness, and makes per-text/per-template counts non-uniform and harder to reason about.
**Risk/complexity:** medium. Rejected — conflicts with a success criterion.

### Leading-stance parsing: scope of "leading"

Recommended: on the **raw answer** (before `normalize()`), strip surrounding quotes/whitespace, then
take the **first sentence or the first 60 characters, whichever is shorter**, and look for a yes/no
stance there; a leading decline cue with no stance yields `None` (→ `refused` once Spec 15's outcome
layer is present). Alternative (rejected): first *line* only — too easily defeated by a single run-on
sentence. The 60-char/first-sentence window is what the issue specifies and what the adversarial tests
encode. Window extraction must precede normalization, since `normalize()` deletes the punctuation that
marks the sentence boundary.

### Citation composition: avoiding a duplicated edition name

`retrieve_quote` renders `{edition} {citation}`, but 10 of 17 in-scope texts store work-prefixed
citations (hadith `"Sahih al-Bukhari 1"`, D&C `"Doctrine and Covenants 1:1"`), which would read
*"…Sahih al-Bukhari Sahih al-Bukhari 1?"*. **Approach A (recommended):** derive a `display_citation`
by stripping a leading `work`/edition-name prefix from the stored citation at render time; stored
citation and scored ground truth untouched. **Pros:** no data migration, digest for `cite_passage`/scoring
unchanged, one code path. **Cons:** a render-time string rule to get right (and test). **Approach B
(rejected):** a per-target `citation_display` catalogue field — more metadata to maintain and keep in
sync for little gain. **Approach C (rejected):** change the stored citation format in `convert.py` —
moves the committed question-set digest and the self-identifying-citation property other code relies
on. Approach A is recommended; the exact stripping rule is a plan detail, the *no-duplication
requirement* is the spec contract.

## Open Questions

- **Critical — RESOLVED (architect, 2026-10-20).** Spec 15 / PR #24 is fully reviewed and at the human
  pr gate; it merges before Spec 26 reaches scoring. Spec 26 plans on the Spec 15 contract as its base.
  If #24 has not merged at the scoring phase boundary, STOP and ping the architect — no fallback.
- **Critical** — Is `ANTHROPIC_API_KEY` present in `sacredtexts/.env` for the live panel? If not, the
  run step is deferred and reported, per the baked constraint.
- **RESOLVED (architect #26/#27 tables)** — `requested_as` lists and `canonical_language` values for
  every target: the starting values are the table on issue #27. The builder uses those; catalogue
  validation requires `requested_as` non-empty list and `canonical_language` non-empty string.
- **Important** — Does any committable text have fewer than 28 qualifying passages for some template
  (or <2 entries for `cite_passage`'s target+exemplar)? Resolved empirically at generate time via
  fail-fast.
- **Important** — `cite_passage` ground truth is now majority-Arabic (hadith numbers, Qur'an
  `surah:ayah`), but the scorer's citation extraction (`_NUM_CITE`) expects a Latin-script leading
  word and `normalize()` does not fold Arabic-Indic digits (٧ ≠ 7). Does template 3's by-example
  exemplar (Latin/colon shape) suffice, or must `normalize()`/the citation extractor fold Arabic-Indic
  digits? (See the cite_passage risk.) Shapes the scoring work; verify empirically in the live/smoke run.
- **Important** — Template-4 negatives use exact normalized-text exclusion, which won't catch
  variant-wording narrations shared across the 9 hadith collections, risking a wrong "no" ground
  truth. Restrict negatives to cross-work/cross-family pairs, or accept and document the limitation
  for the first run? (See the template-4 risk.)
- **Nice-to-know** — Citation-composition mechanism (strip leading work prefix vs a display field) —
  recommended Approach A; left to the plan.
- **Nice-to-know** — Whether the per-text summary table should also break down by template, or stay
  at text granularity (issue specifies: text, n, accuracy, coverage, refused — text granularity,
  per model).

## Test Scenarios

**Catalogue validation**
- A `source.yaml` missing `requested_as` or `canonical_language` fails loading, naming the file and
  `targets[i]`.
- A non-list / empty-list / empty-element `requested_as`, or an empty `canonical_language`, is rejected.
- A valid target with both fields loads and exposes them on `Target`.
- **Metadata channel:** `text_metadata()` returns a `(work, version, language)`-keyed map, fail-closed
  (`CatalogueError`) on an unmapped tuple, and the slug-agreement check fires when two targets share a
  slug but disagree on a field.

**Selection & quota**
- Default generate over the full catalogue selects exactly the 17 included
  (`language == canonical_language`), non-restricted texts (grouped by `(work, version, language)`);
  counts 7 per template per text at `--per-text 28`.
- A `--per-text` not divisible by the active-task count (e.g. 18 over four tasks) produces the
  deterministic `N // len(active)`+remainder split; `--per-text` below `len(active)` fails fast.
- `--include-translations` adds the excluded non-restricted texts; `--tasks retrieve_quote --per-text
  28` emits 28/text over the single active template.
- `--include-restricted` behaviour unchanged; TLG only appears with it and stays local-only.
- A text that cannot fill its per-template share fails fast, naming the text and template.
- Manifest records `per_text`, `include_translations`, and the selected-texts list; digest unchanged.

**Prompt rendering**
- Each template's rendered prompt renders `<edition>` as a seeded `requested_as` choice (never the raw
  `version`), recorded in `question.source.requested_as`; `cite_passage` ends with an exemplar citation
  from a different seeded entry of the same text (fail-fast when a text has <2 entries).
- **No duplicated edition name:** `retrieve_quote` over a work-prefixed-citation text (hadith, D&C)
  renders the edition exactly once (`display_citation`); over a bare-citation text (Qur'an, Talmud,
  Book of Mormon) renders unchanged. Stored citation and `cite_passage` ground truth are untouched.
- `complete_unit` splits the unit and asks for the remainder; `verify_source` negatives attribute a
  real passage from a different in-scope text (selected at `(work, version, language)` granularity, with
  family exclusion so never from the same family as the asked text), excluding passages also present in
  the attributed text, at the deterministic negative share; `source` records the asked edition and
  `expected` gains `true_version`.

**Scoring (leading stance, #23)**
- The leading window is taken from the **raw answer before `normalize()`** (a punctuation-bearing
  answer still yields the right sentence boundary).
- `"There is no way to verify this... Yes"` → parser returns `None` (decline cue; neither yes nor no —
  the incidental "no" in "no way" is not a stance), so a false-premise "no" is not gamed into correct.
- `"No, that is from Sahih Muslim"` → no.
- `"Yes."` → yes.
- A decline cue with no stance → `None` (classified `refused` by the Spec 15 outcome layer, which is
  the base for the scoring phase).
- Retired tasks: scoring `identify_version`/`identify_source` is removed; no test (pipeline or viewer)
  references them.

**cite_passage over Arabic ground truth**
- A correct Latin-script, colon/number citation matching the by-example exemplar's shape scores correct.
- An Arabic-Indic-digit answer (e.g. `صحيح البخاري ١`) exposes the scorer's digit-folding gap —
  asserted per the resolution chosen in Open Questions (example-steer accepted, or digit folding added).

**End-to-end / evidence**
- A fresh `runs/original-<date>/` generates 476 questions, runs the tutorial panel, scores, and the
  scores re-derive bit-for-bit from the committed answers.
- Copyright audit gate green on the committed run (no restricted-derived artifact).
- Viewer renders the new run (per-text table present in summary).

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Spec 15 base / #24 (MERGED @ 1324755) | Low | Medium | `origin/main` merged before Phase 1; scoring builds on the named-grader + refused-outcome contract directly. No fallback. |
| `retrieve_quote` duplicates the edition name for 10/17 texts (work-prefixed citations) | High (if unaddressed) | High | `display_citation` strips the leading work/edition-name prefix at render; test the no-duplication contract for a hadith and a bare-citation text. |
| `cite_passage` ground truth is majority-Arabic but the scorer expects Latin-script/colon and doesn't fold Arabic-Indic digits — 25% of the benchmark mis-scores | Medium | High | Template 3's by-example exemplar steers answers to the Latin/colon shape; consider folding Arabic-Indic digits in `normalize()`/extractor; verify in the live/smoke run; test scenario. |
| verify_source negatives: variant-wording narrations shared across 9 hadith collections yield a wrong "no" ground truth (exact-match exclusion misses them) | Medium | Medium | Family exclusion by `document_type` (never pair two hadith collections) — cross-*work* alone is a no-op since the 9 are distinct works; fail-fast on insufficient cross-family pool; #23 hardening protects gaming, not wrong truth. |
| A committable text can't fill 28 questions for some template (or <2 entries for `cite_passage`) | Medium | Medium | Fail fast naming text+template; architect decides default or exclusion. Surface via `afx send`. |
| `ANTHROPIC_API_KEY` absent → live run blocked (web_search is Anthropic-only) | Medium | Medium | Stop at live-run step, report to architect; do not substitute OpenRouter. Deliver everything else. |
| Re-running score/collect over committed evidence nulls the panel/usage proof | Low | High | Always write to a fresh `runs/original-<date>/`; never target committed runs. |
| `requested_as` names or the by-example citation shape drift from the scored shape | Medium | Low | Starting values from #27; derive wording from real reference data and the scorer's citation regexes; verify with the live/smoke run. |
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
