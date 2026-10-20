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
- **Texts.** Six `source.yaml` files enumerate **23 catalogue targets**. Full census with the
  `original_language` (OL) each will carry:

  | tradition | work | version | lang | license | OL |
  |---|---|---|---|---|---|
  | Sunni Islam | The Qur'an | Uthmani (QUL) | ar | public-domain | **true** |
  | Sunni Islam | Sahih al-Bukhari / Muslim / Abi Dawud / at-Tirmidhi / an-Nasa'i / Ibn Majah / Muwatta Malik / Musnad Ahmad / al-Darimi (9) | sunnah.com Arabic | ar | public-domain | **true** (×9) |
  | Judaism | Talmud Bavli | Davidson Aramaic | he | open | **true** |
  | Judaism | Talmud Bavli | Davidson English | en | open | false |
  | LDS | Book of Mormon | 2013 | en | open | **true** |
  | LDS | Doctrine and Covenants | 2013 | en | open | **true** |
  | LDS | Pearl of Great Price | 2013 | en | open | **true** |
  | LDS | The Bible | KJV (LDS 2013) | en | public-domain | false (×2 targets, OT+NT, share one slug) |
  | Protestant | The Bible | KJV / ASV (1901) / WEB (3) | en | public-domain | false (×3) |
  | Roman Catholic | Papal Encyclicals | Vatican English | en | open | false (composed in Latin) |
  | Roman Catholic | The Bible | NABRE | en | restricted | false |
  | Greek Orthodox | Septuagint & Greek NT | TLG | grc | restricted | **true** |

  **Default selection (`original_language: true` & non-restricted) = 14 texts:** Qur'an + 9 hadith +
  Talmud Aramaic + Book of Mormon + D&C + Pearl of Great Price. Original-language **but restricted**:
  TLG Greek (local-only, `--include-restricted`). Translations added by `--include-translations`:
  Talmud English, KJV/ASV/WEB, the LDS KJV pair, Papal Encyclicals (NABRE stays restricted).

## Desired State

- **Default selection is original-language-only.** `generate` with no extra flags emits questions
  only for targets flagged `original_language: true` and not `restricted`. `--include-translations`
  opts the translations back in; `--include-restricted` keeps its existing meaning (TLG stays
  local-only, audit gate unchanged).
- **One text = one `(work, version, language)` group, 15–30 questions each (default 20),** split as
  evenly as possible over exactly four templates (exactly 5 each at the default 20). A "text" is the
  set of standardized documents sharing `(work, version, language)` — **not** a single catalogue
  target: e.g. the LDS KJV Old/New-Testament pair shares one `(work, version, language)` and one slug,
  and the Talmud Aramaic single target yields dozens of per-tractate documents. Grouping is on the
  tuple. For `--per-text N` that is not a multiple of 4, the split is deterministic: `N // 4` per
  template plus one extra to the first `N % 4` templates in the fixed canonical order
  (`retrieve_quote`, `complete_unit`, `cite_passage`, `verify_source`). The per-task quota and the
  tradition-balanced sampler are gone — replaced, not kept alongside. Generation fails fast (naming the
  text and the template) when a text cannot fill a template's share.
- **The three new fields reach generation the way `license` does.** `generate` consumes standardized
  `Document`s, which (correctly, unchanged) carry no catalogue facts — `license` is recovered from the
  standardized path via the catalogue, fail-closed, with a slug-agreement check. `original_language`,
  `ask_as`, and `citation_hint` travel the **same catalogue-recovery channel**: fail-closed if
  recovery fails, and all targets sharing a slug must agree on the three fields (slug-agreement),
  exactly as `license` does today.
- **Exactly four templates, rendered in natural language** using new metadata so prompts read the
  way a person would ask (`ask_as` for the edition, `citation_hint` appended to the "where" prompt).
  **The rendered prompt strings below are the authoritative contract** (they feed the question-set
  digest); Waleed's four-line shorthand in Constraints conveys intent, and where the shorthand and
  the rendered form differ in punctuation/wording (e.g. template 2's `?` vs `:`), the rendered string
  here governs.

  | task | rendered prompt | expected |
  |---|---|---|
  | `retrieve_quote` | *What is the text of {ask_as} {display_citation}? Reply with the exact text of that {unit_type} and nothing else.* | `{text}` |
  | `complete_unit` | *Please complete this quote from {ask_as}: "{first half}" Reply with only the remaining words.* | `{remainder, full_text}` |
  | `cite_passage` | *Where in {ask_as} can I find this quote? "{text}" Answer with the citation only ({citation_hint}).* | `{citation}` |
  | `verify_source` | *Is the following text from {ask_as}? "{text}" Answer Yes or No.* | `{yes/no, true_work, true_version}` |

  **No duplicated edition name.** Stored citations for the nine hadith collections
  (`convert.py` → `"Sahih al-Bukhari 1"`) and Doctrine and Covenants (`"Doctrine and Covenants 1:1"`)
  are work-prefixed — 10 of the 14 in-scope texts. `retrieve_quote` therefore renders a
  **`display_citation`**: the stored `citation` with a leading `work`/`ask_as` prefix stripped, so the
  edition name appears exactly once (*"What is the text of Sahih al-Bukhari 1?"*, not *"…Sahih
  al-Bukhari Sahih al-Bukhari 1?"*). The stored `citation` and all scored ground truth are unchanged;
  `cite_passage`'s expected answer is still the full stored citation (and `citation_hint` steers the
  model to that work-prefixed shape). Qur'an (`7:70`), Talmud (`Chullin 26b:12`), Book of Mormon /
  Pearl of Great Price (`Alma 32:21`) are not work-prefixed and render unchanged.

  `identify_version` and `identify_source` are retired from code, scoring, **and the viewer**
  (`apps/viewer` has task-specific handling at `localResults.ts`, `explorer.test.ts`,
  `QuestionList.test.tsx`) and docs.

- **Prompt and answer language.** The four prompt templates are in **English**; 11 of the 14 in-scope
  texts are Arabic/Hebrew, so for templates 1–2 the *answer* is expected in the source script (Arabic
  for Qur'an/hadith, Aramaic for Talmud), scored by the script-aware `normalize()`. For
  `cite_passage`, `citation_hint` steers the model to answer the citation in the Latin-script/colon
  shape the scorer extracts (see the cite_passage scoring risk below).
- **Catalogue carries three new required per-target fields** — `original_language` (bool), `ask_as`
  (str), `citation_hint` (str) — validated like the existing required fields, fail-fast with
  file+target named, with `original_language` required to be a real bool. Every committed
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
  models would be meaningless. Per-tradition balance no longer holds (9 of 14 committable texts are
  hadith collections). `coverage` = `(correct + incorrect) / n` and `refused` are Spec 15 outcomes
  (see dependency); if Spec 15 is not yet integrated when scoring is built, see the degraded fallback
  in Assumptions.
- **A fresh committed run** demonstrates the new question set end to end, with a README, scores
  re-deriving bit-for-bit from answers.
- **Docs reflect the change:** TUTORIAL (four templates, `--per-text`), CODE_WALKTHROUGH (Recipe A
  step 2 documents the three fields; pointer-guard green), pipelines/README (Source catalogue
  fields), arch-critical (Phase-1 line gains "original-language editions only by default").

## Success Criteria

- [ ] Every committed `source.yaml` carries `original_language`, `ask_as`, `citation_hint` on every
      target; a missing one fails `catalogue` loading with the file and target index named, and a
      non-bool `original_language` is rejected.
- [ ] `generate` with defaults selects exactly the `original_language: true`, non-restricted texts
      (14, grouped by `(work, version, language)`) and emits N questions per text split over the four
      templates — exactly N/4 per template when N is a multiple of 4 (5 each at N=20 → ~280
      questions), else the deterministic `N//4` + remainder-to-first-`N%4` allocation;
      `--include-translations` additionally includes the `original_language: false`, non-restricted
      texts.
- [ ] Rendered prompts use `ask_as`, never the raw `version` string; `cite_passage` appends
      `citation_hint`; and **no prompt duplicates the edition name** — `retrieve_quote` over the 9
      hadith collections and D&C renders the edition once (via `display_citation`).
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
      accuracy, and — once Spec 15 is integrated — coverage, refused).
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
- **`verify_source` question identity.** A `verify_source` question (positive or negative) belongs to
  the **asked edition** — the one named by `ask_as` in the prompt — and aggregates under that text in
  the per-text summary, because the task tests whether the model knows what is in *that* edition. The
  question's source metadata records the asked edition; for a negative, `expected` additionally
  records the passage's true source (`true_work`, `true_version`). This resolves the ambiguity that a
  negative passage is physically drawn from a different text.
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

- **Dependency on Spec 15 / PR #24 (OPEN, not merged at spec time).** Spec 15 establishes the
  containment headline, the `refused` outcome, `coverage`, and the named-grader framework — the
  headline for templates 1–2, which Spec 26 does **not** change. Per issue #26: build on `main` and
  merge `origin/main` when #24 lands; conflicts are expected in TUTORIAL.md / CODE_WALKTHROUGH.md /
  score.py docstrings. #23's hardening (leading-stance `parse_yes_no`) sits on top of whatever
  `parse_yes_no` exists at merge time. This worktree's current score.py is pre-Spec-15.
  - **Split of responsibility:** the leading-stance `parse_yes_no` (returning yes / no / `None`) is
    independent of Spec 15 and lands in this project regardless. The `refused` **outcome**, `coverage`,
    and the per-text table's coverage/refused columns are Spec 15 machinery that Spec 26 consumes, not
    reimplements.
  - **Expected path:** PR #24 merges before Spec 26 reaches its scoring phase; the builder merges
    `origin/main` and integrates. Because this sequencing is a cross-project coordination call, the
    builder surfaces the dependency to the architect rather than deciding it (see Open Questions).
  - **Degraded fallback (if #24 has not merged when Spec 26 reaches scoring and the architect directs
    shipping without it):** do **not** duplicate Spec 15's outcomes machinery. The per-text table
    ships with text / n / accuracy only; a `None` from `parse_yes_no` is recorded as `parsed: null`
    (not `refused`); coverage/refused columns and full #23 closure follow once Spec 15 lands. Per #23,
    no `verify_source` accuracy number is published in that degraded mode.
- **`--tasks` and `--negatives-share` are retained;** only `--per-task` and `--quota` are removed.
  `--tasks` subsets the four templates (the tutorial generates `retrieve_quote` only) and the per-text
  split then applies over the selected subset. `--negatives-share` keeps its default 0.5 and governs
  the `verify_source` yes/no mix via the existing deterministic formula.
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

### Approach 1 (recommended): Per-text even split with deterministic remainder and fail-fast

For each selected text, request `per_text // 4` items per template, plus one extra to the first
`per_text % 4` templates in the fixed canonical order so any `--per-text` in 15–30 is well-defined
(exactly 5 each at the default 20). A template that cannot supply its share fails the whole run fast
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

`retrieve_quote` renders `{ask_as} {citation}`, but 10 of 14 in-scope texts store work-prefixed
citations (hadith `"Sahih al-Bukhari 1"`, D&C `"Doctrine and Covenants 1:1"`), which would read
*"…Sahih al-Bukhari Sahih al-Bukhari 1?"*. **Approach A (recommended):** derive a `display_citation`
by stripping a leading `work`/`ask_as` prefix from the stored citation at render time; stored citation
and scored ground truth untouched. **Pros:** no data migration, digest for `cite_passage`/scoring
unchanged, one code path. **Cons:** a render-time string rule to get right (and test). **Approach B
(rejected):** a per-target `citation_display` catalogue field — more metadata to maintain and keep in
sync for little gain. **Approach C (rejected):** change the stored citation format in `convert.py` —
moves the committed question-set digest and the self-identifying-citation property other code relies
on. Approach A is recommended; the exact stripping rule is a plan detail, the *no-duplication
requirement* is the spec contract.

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
- **Important** — `cite_passage` ground truth is now majority-Arabic (hadith numbers, Qur'an
  `surah:ayah`), but the scorer's citation extraction (`_NUM_CITE`) expects a Latin-script leading
  word and `normalize()` does not fold Arabic-Indic digits (٧ ≠ 7). Does `citation_hint`'s
  Latin/colon steer suffice, or must `normalize()`/the citation extractor fold Arabic-Indic digits?
  (See the cite_passage risk.) Shapes the scoring work; verify empirically in the live/smoke run.
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
- A `source.yaml` missing `original_language` (or `ask_as`, or `citation_hint`) fails loading, naming
  the file and `targets[i]`.
- `original_language: "true"` (string) or a non-bool is rejected as not a bool.
- A valid target with all three fields loads and exposes them on `Target`.
- **Metadata channel:** the three fields recover from the standardized path the way `license` does —
  fail-closed when recovery fails, and the slug-agreement check fires when two targets share a slug
  but disagree on a field (e.g. an LDS-KJV-pair-shaped fixture).

**Selection & quota**
- Default generate over the full catalogue selects exactly the 14 original-language, non-restricted
  texts (grouped by `(work, version, language)`); counts 5 per template per text at `--per-text 20`.
- A non-multiple-of-4 `--per-text` (e.g. 18) produces the deterministic `N//4`+remainder split.
- `--include-translations` adds the `original_language: false` non-restricted texts; `--tasks
  retrieve_quote` restricts to one template and the per-text split applies over that subset.
- `--include-restricted` behaviour unchanged; TLG only appears with it and stays local-only.
- A text that cannot fill its per-template share fails fast, naming the text and template.
- Manifest records `per_text`, `include_translations`, and the selected-texts list; digest unchanged.

**Prompt rendering**
- Each template's rendered prompt uses `ask_as` (never the raw `version`); `cite_passage` ends with
  the text's `citation_hint`.
- **No duplicated edition name:** `retrieve_quote` over a work-prefixed-citation text (hadith, D&C)
  renders the edition exactly once (`display_citation`); over a bare-citation text (Qur'an, Talmud,
  Book of Mormon) renders unchanged. Stored citation and `cite_passage` ground truth are untouched.
- `complete_unit` splits the unit and asks for the remainder; `verify_source` negatives attribute a
  real passage from a different in-scope text, excluding passages also present in the attributed text,
  at the deterministic negative share.

**Scoring (leading stance, #23)**
- The leading window is taken from the **raw answer before `normalize()`** (a punctuation-bearing
  answer still yields the right sentence boundary).
- `"There is no way to verify this... Yes"` → parser returns `None` (decline cue; neither yes nor no —
  the incidental "no" in "no way" is not a stance), so a false-premise "no" is not gamed into correct.
- `"No, that is from Sahih Muslim"` → no.
- `"Yes."` → yes.
- A decline cue with no stance → `None` (classified `refused` where Spec 15's outcome layer exists;
  `parsed: null` in the degraded fallback).
- Retired tasks: scoring `identify_version`/`identify_source` is removed; no test (pipeline or viewer)
  references them.

**cite_passage over Arabic ground truth**
- A correct Latin-script, colon/number citation matching `citation_hint`'s steer scores correct.
- An Arabic-Indic-digit answer (e.g. `صحيح البخاري ١`) exposes the scorer's digit-folding gap —
  asserted per the resolution chosen in Open Questions (hint-steer accepted, or digit folding added).

**End-to-end / evidence**
- A fresh `runs/original-<date>/` generates ~280 questions, runs the tutorial panel, scores, and the
  scores re-derive bit-for-bit from the committed answers.
- Copyright audit gate green on the committed run (no restricted-derived artifact).
- Viewer renders the new run (per-text table present in summary).

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| PR #24 (Spec 15) merges mid-flight and conflicts in score.py / docs | High | Medium | Build on `main`; merge `origin/main` when #24 lands; expect conflicts in TUTORIAL / CODE_WALKTHROUGH / score.py docstrings; reconcile leading-stance parsing onto #24's `parse_yes_no`. |
| PR #24 does not merge before Spec 26 scoring (refused/coverage unavailable) | Medium | Medium | Surface sequencing to architect; do not reimplement Spec 15. Degraded fallback (Assumptions): per-text table = text/n/accuracy, `parsed: null`, no verify_source number published. |
| `retrieve_quote` duplicates the edition name for 10/14 texts (work-prefixed citations) | High (if unaddressed) | High | `display_citation` strips the leading work/ask_as prefix at render; test the no-duplication contract for a hadith and a bare-citation text. |
| `cite_passage` ground truth is majority-Arabic but the scorer expects Latin-script/colon and doesn't fold Arabic-Indic digits — 25% of the benchmark mis-scores | Medium | High | `citation_hint` steers answers to the Latin/colon shape; consider folding Arabic-Indic digits in `normalize()`/extractor; verify in the live/smoke run; add as a test scenario. |
| Template-4 negatives: variant-wording narrations shared across 9 hadith collections yield a wrong "no" ground truth (exact-match exclusion misses them) | Medium | Medium | Prefer cross-work/cross-family negatives; document the residual shared-narration limitation as accepted for the first run; the #23 hardening protects against gaming but not wrong truth. |
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
