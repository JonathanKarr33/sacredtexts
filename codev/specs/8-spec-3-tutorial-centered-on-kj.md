# Specification: Tutorial centered on KJV / Qur'an / Talmud (he), 2-model panel, web-search on/off comparison

<!--
SPEC vs PLAN BOUNDARY:
This spec defines WHAT and WHY. The plan defines HOW and WHEN.
Keep implementation phases, file paths, code, and "first we will… then we will…"
out of the spec — those belong in codev/plans/XXXX-*.md.
-->

## Problem Statement

The repo-root `TUTORIAL.md` is the project's front door: a fresh-clone, copy-pasteable
walk through the whole benchmark loop (convert → validate → generate → audit → collect →
score → view). Today it demonstrates Spec 1's first run — 100 **English** `retrieve_quote`
questions over four English corpora, a 4-model / 2-provider panel, no tool use. Three
things about that story under-sell what this benchmark is actually for, and leave real
capability untested:

1. **It is monolingual.** The benchmark's own thesis is multi-faith, multi-script sacred
   text. Yet the tutorial never exercises a non-Latin script, so the two hardest and most
   interesting corpora the repo already ships — the **Arabic Qur'an** and the
   **Hebrew/Aramaic Talmud** — are invisible to a first-time reader, and the scoring path
   for them has never been demonstrated end-to-end.

2. **It does not show the central contrast the benchmark exists to measure.** "Can a model
   *retrieve* sacred text?" has two radically different answers depending on whether the
   model may *look it up* versus recite from parametric memory. The tutorial shows only the
   from-memory case, so a reader cannot see the single most illuminating result:
   parametric recall vs. tool-assisted retrieval, side by side, in the viewer.

3. **Scoring is unfair to non-Latin quotes.** The scoring `normalize()` was written for
   Latin text. On Arabic and Hebrew it mangles the string — vowel marks (harakat / niqqud)
   are turned into spaces that split every word into individual letters, the Qur'anic
   alef-wasla is not folded to a plain alef, and the Arabic tatweel elongation survives. A
   verbatim-correct Qur'an answer can therefore score `token_f1 = 0` against the expected
   text. Any Arabic/Hebrew number the tutorial produces would be noise.

Who is affected: every new contributor or working-group member who opens `TUTORIAL.md` to
understand the project (they get a partial, Latin-only picture); and the benchmark's own
credibility (it claims multi-faith, multi-script scope but has never shown a scored
non-Latin result or the retrieval-with-tools contrast that motivates the whole exercise).

## Current State

**Tutorial.** `TUTORIAL.md` (repo root) has a shared convert/validate preamble, then
Track A (explore the committed run, no keys), Track B (do your own run — `generate` over
*English* Protestant + LDS + Roman Catholic + **English** Talmud, `--tasks retrieve_quote
--per-task 100 --seed 20261011`, then `collect` with `configs/models.yaml`, then `score`),
and Track C (view locally). It points at `configs/models.example.yaml` as the panel to copy.

**Corpora already present (the issue's "add the Hebrew target" is largely done).** The raw
sources and catalogue entries for all three target texts already exist and all three
converters are registered:

- **KJV** — `texts/raw/Protestant Christian/source.yaml` target `The Bible / KJV / en`
  (converter `bible_flat`).
- **Qur'an** — `texts/raw/Sunni Islam/source.yaml` target `The Qur'an / Uthmani (QUL) /
  ar` (converter `quran_qul`, public-domain KFGQPC Uthmani via QUL), already handling the
  `{"surah:ayah": {verse_key, text}}` shape.
- **Talmud (Hebrew/Aramaic)** — `texts/raw/Judaism/source.yaml` **already carries** the
  `Talmud Bavli / William Davidson Edition - Aramaic / he` target (added in Spec 1, commit
  `cff38b2`), converter `sefaria_talmud`, which already strips HTML, applies the daf offset,
  and **cross-checks each file's `language` against the target** (so the `he` glob cannot
  mislabel an English tractate). The Davidson edition is CC-BY-NC, mapped to the catalogue's
  `open` enum — **not** `restricted`.

So the "catalogue a Hebrew target / teach the converter its shape" work the issue describes
is effectively complete in the source tree; what has never happened is *generating, collecting,
scoring, committing, and viewing* a run over the `ar`/`he` standardized documents.

**Scoring / `normalize()`.** `pipelines/sacredbench/score.py :: normalize()` does
`NFKD → fold curly quotes/dashes → strip [^\w\s] to spaces → casefold → collapse
whitespace`. Verified empirically against the real shipped scripts:

- Arabic vocalized basmala `بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ` → `'ب س م ٱلل ه ٱلر ح م ن
  ٱلر ح يم'` (harakat removed *as spaces*, splitting letters; alef-wasla `ٱ` not folded);
  `token_f1(vocalized, plain)` = **0.0**, and normalized-equality is **False** against the
  unvocalized form.
- `أإآا` → `'ا ا ا ا'` (hamza stripped but letters split); Arabic **tatweel** survives
  (`مـحـمـد` unchanged); Hebrew niqqud and maqaf split Hebrew words into letters.

The per-task scoring contract (`_SUBMETRICS`: `retrieve_quote`/`complete_unit` emit
`exact`/`normalized`/`token_f1`; `identify_version` emits `exact`/`normalized`; others emit
`correct` only) and the `retrieve_quote` headline (`correct = normalized`) are unaffected by
the normalisation internals — only the *value* of `normalized`/`token_f1` changes.

**Panel / collect / tools.** `config.py :: ModelSpec` has **no** tool-use field. The
Anthropic provider (`providers.py :: _anthropic`) makes a plain `messages.create` with no
`tools`. `collect.py :: _panel_fingerprint` is `provider|model|base_url` and binds a
model id to one provider/model/host across resumes. `cli.py score` builds the panel
snapshot as `{provider, model, endpoint, price_in, price_out}` and `score.py` writes
`summary.json.panel[model_id] = {provider, model, endpoint, served_by}`. `configs/models.example.yaml`
is the 4-model / 2-provider panel that produced the committed run.

**Viewer (merged, Spec 2 — zero changes allowed here).** Confirmed by reading
`apps/viewer/`:
- **Leaderboard** and **error explorer** key on `model_id` (`LeaderboardTable.tsx:46`,
  `explorer.ts:30`), so distinct model ids already render as distinct rows.
- **Standings** dedupes on `` `${panel.provider}\u0000${panel.model}` `` (`aggregate.ts:59`),
  falling back to `model_id` when a run has no panel entry. `parseSummary` reads only
  `{provider, model, endpoint, served_by}` from each panel entry and **ignores any other
  field** (it does not read a `tools` field).
- **Run discovery** lists any `runs/<id>/` whose immediate subdir has a readable, non-symlink
  `summary.json` (`runsEndpoint.ts:48`); a run is *loaded* only with the full four-file set
  (`summary.json`, `scores.jsonl`, `answers.jsonl`, `questions.jsonl`). "Most recent" is by
  directory **mtime** (id tiebreak).
- Committed-run gate test: `apps/viewer/src/local/realRun.test.ts` renders
  `runs/first-run-2026-10-11` end-to-end; the `#86` numbered-shade built-CSS probe lives in
  `apps/viewer/src/deploy.test.ts`.

**Committed evidence / gitignore.** `.gitignore` has `runs/*` with `!runs/first-run-2026-10-11/`;
`texts/standardized/` and `texts/interchange/` are rebuilt locally. The copyright audit
(`audit.py`, in `.codev/checks/test.sh`) fails only on `restricted`-derived artifacts; a run
over KJV (public-domain) + Qur'an (public-domain) + Talmud (open) is audit-clean to commit.

## Desired State

`TUTORIAL.md` revolves around the **three most important sources** — the **KJV** (English,
Protestant Christian), the **Qur'an** (Arabic, QUL Uthmani), and the **Talmud in
Hebrew/Aramaic** (Sefaria Davidson `he`) — and demonstrates, end-to-end from a fresh clone,
the benchmark's central contrast: **parametric recall vs. tool-assisted retrieval**.

- **Three-source, three-script tutorial.** The tutorial's `generate` step draws its
  questions from exactly those three standardized corpora, so a reader exercises Latin,
  Arabic, and Hebrew scoring in one run. The same seed ⇒ the same question set
  (deterministic), as today.
- **2-model panel, each run both ways.** The panel is one opus-class model
  (`claude-opus-5-5`) and one haiku-class model (`claude-haiku-5-5`). Each model is run
  **with the Anthropic server-side web-search tool enabled and disabled** — 2 models ×
  search-{on,off} = **4 panel entries** — so the viewer shows all four side by side and the
  difference between reciting-from-memory and looking-it-up is directly visible.
  `configs/models.example.yaml` is updated to this 2-model (4-entry) shape.
- **Tool use is a first-class, identity-bearing config.** `collect` accepts a per-model
  tool-use setting (web search enabled/disabled). The tools setting is part of a panel
  entry's identity: the collect panel-fingerprint incorporates it (so a search-on cell can
  never be silently resumed as search-off), **and** the identity the viewer's standings
  view rolls up on incorporates it, so search-on and search-off for the same underlying
  model never collapse into one standings row.
- **Fair non-Latin scoring.** `normalize()` treats Arabic and Hebrew sensibly — vowel
  marks (harakat / niqqud) and the Arabic tatweel are removed *without* splitting words,
  alef / hamza / alef-wasla variants are folded, and the Hebrew maqaf is handled — so a
  verbatim-correct Qur'an or Talmud quote is scored as correct. The per-task scoring
  **contract is unchanged**; only the `normalized`/`token_f1` *values* for non-Latin text
  improve. Latin scoring is unchanged.
- **A committed tutorial run** lives under `runs/` (gitignore negation + a README), is
  copyright-audit-clean, and its panel carries no secrets. The **merged viewer picks it up
  with zero code changes** — it appears in the run selector, its leaderboard ranks the four
  entries, the error explorer drills into each, and the standings view shows the four as
  distinct rows (search-on vs. search-off not collapsed).
- **The full E2E property holds** (as today): fresh clone → follow `TUTORIAL.md` verbatim →
  deterministic question set → `collect` (keys from env; the only paid step) → `score` →
  `view`. The committed run is reference evidence; a fresh `collect` produces a *new* run
  (answers are not reproducible byte-for-byte, especially with live web search).

The concrete improvement: a first-time reader runs one tutorial and sees three scripts
scored fairly and the parametric-vs-retrieval contrast rendered in the viewer — the
benchmark's thesis, demonstrated rather than asserted.

## Success Criteria

- [ ] `TUTORIAL.md` is reworked to revolve around the three sources (KJV / Qur'an (ar) /
      Talmud (he)); its `generate` step selects exactly those three standardized corpora;
      the commands remain copy-pasteable from the repo root and deterministic (same seed ⇒
      same question set).
- [ ] `convert` followed by `generate` over the Qur'an (`ar`) and Talmud (`he`) standardized
      documents succeeds and yields a question set spanning the three traditions /
      three scripts (demonstrated by the committed run's `questions.jsonl` containing
      Arabic and Hebrew expected text).
- [ ] `configs/models.example.yaml` describes a **2-model** panel (`claude-opus-5-5` +
      `claude-haiku-5-5`), expressed as **four entries** = each model × web-search-{on,off},
      with distinct model ids and the tool-use setting on each; the tool-use setting is
      genuinely **parsed into `ModelSpec` and honored** (not silently ignored), and the panel
      loads through `config.py` with no duplicate-id error.
- [ ] Tool-config validation is **fail-fast**: enabling the Anthropic web-search tool on a
      non-`anthropic` provider, or supplying an unrecognised tools value, raises
      `ConfigError` at load time (before any provider call), never a silent no-op.
- [ ] `collect` honours a per-model web-search tool setting: when enabled, the Anthropic
      call is made with the server-side web-search tool; when disabled, it is not. A
      search-enabled and a search-disabled entry for the same underlying model are two
      distinct cells.
- [ ] The collect **panel fingerprint incorporates the tools setting** — resuming an
      answers file where a model id was collected under one tools setting against a config
      that now maps it to a different tools setting is refused (`CollectError`), consistent
      with the existing provider/model identity binding.
- [ ] The **standings identity incorporates the tools setting**: in the committed tutorial
      run, the merged viewer's standings view shows the search-on and search-off variants of
      the same model as **separate rows** (they do not collapse into one), achieved with
      **no change to viewer source**.
- [ ] `normalize()` removes the Arabic- and Hebrew-range combining marks **and the Qur'anic
      annotation marks / editorial symbols actually present in QUL** (the U+06D6–U+06ED block,
      the rub-el-hizb / sajdah symbols, superscript alef, tatweel — including those that occur
      **mid-word**) without splitting words, and folds alef/hamza/alef-wasla and the Hebrew
      maqaf, such that a vocalized and an unvocalized form of the same Qur'an/Talmud text are
      `normalized`-equal and score `token_f1 = 1.0`. The mark set is re-derived from the real
      QUL/Davidson data. Latin normalisation is byte-for-byte unchanged (existing Latin tests
      still pass). The per-task `_SUBMETRICS` contract and the `retrieve_quote` headline rule
      are **not** changed.
- [ ] Python tests cover the non-Latin normalisation with **real-script fixtures** — at least
      one **full real QUL ayah** carrying annotation marks and a sajdah/rub-el-hizb symbol,
      and a real Davidson Talmud line — plus Arabic with/without harakat, tatweel, alef
      variants and Hebrew with/without niqqud, maqaf; asserting the equality/`token_f1`
      outcomes and a **Latin regression fixture** proving Latin output is byte-for-byte
      unchanged.
- [ ] The committed `first-run-2026-10-11` **question-set digest is unchanged** by the
      `normalize()` change (regression guard): `generate.py` imports `normalize` from `score`
      for `work_texts`/`version_texts`, so the change has a generation-side blast radius; the
      first run's Latin digest must not move (it will not, since `_qid` hashes raw text and
      Latin output is unchanged, but it is asserted).
- [ ] A **committed tutorial run** exists under `runs/<id>/` with the full four-file set +
      a `README.md`, negated in `.gitignore`; `uv --project pipelines run python -m
      sacredbench audit runs/<id>` passes (origin-clean; the run derives only from
      public-domain/open sources); the committed panel in `summary.json` contains no
      secrets (provider / model / endpoint / `api_model` / served_by only — no keys).
- [ ] The committed run is committed **as collected** — no manual copyright-clearance /
      redaction pass over the search-on answers (human determination, 2026-10-11: incidentally
      web-retrieved copyrighted text in a model answer is fair use for academic research).
      Answers are never truncated or edited (the explorer must show them verbatim); the run
      `README.md` carries a one-line fair-use note. The automated `audit` still gates.
- [ ] The committed run's `README.md` preserves source / attribution / **CC-BY-NC** licence /
      non-commercial notice for the Davidson Talmud (coarse `open` audit-pass is not
      attribution).
- [ ] The committed run reports **no misleading cost**: its panel is unpriced (token-only, no
      `cost_usd`) so that uncaptured per-request web-search charges cannot understate a
      reported cost; if any search-request usage is captured it is additive provenance only.
- [ ] The merged viewer, run against the repo with the committed tutorial run present,
      renders it with **zero source changes**: it appears in the run selector; its
      leaderboard ranks the four entries with per-task + per-tradition columns and token
      totals; the explorer drills into each entry; the standings view lists the four as
      distinct rows. (Verified by running the viewer and/or a viewer test; whether a new
      viewer test is added is a plan decision — but no behavioural source change is made.)
- [ ] The existing viewer committed-run gate (`realRun.test.ts` over
      `runs/first-run-2026-10-11`) and the `#86` CSS probe still pass — adding the tutorial
      run does not break them.
- [ ] `.codev/checks/test.sh` is green (pipeline pytest + viewer vitest + audit).
- [ ] The web-search-vs-no-search contrast is **observable** in the committed run: the
      search-enabled entries' `retrieve_quote` `exact` / `normalized` / `token_f1` are
      reported alongside the search-disabled entries so a viewer can see the difference. The
      human's expectation that search-enabled scores higher is a result to *display*, not a
      pass/fail threshold — and because the headline `correct = normalized` is **whole-answer
      equality**, a search-on answer that appends an attribution/citation can score *lower*
      on the headline while retrieving better; `token_f1`/`exact` are named as the
      discriminating numbers. The `_SUBMETRICS` contract is **not** altered to "fix" this
      (requirement 4 forbids it).

## Constraints

**Fixed requirements from the human (Issue #8, 2026-10-11) — copied verbatim; treated as
settled (baked); not relitigated in Solution Approaches:**

1. **Rework TUTORIAL.md to revolve around the 3 most important sources**: the KJV (English,
   Protestant Christian corpus), the Qur'an (Arabic, QUL Uthmani), and the **Talmud in
   Hebrew/Aramaic** — the Sefaria Davidson `he` files already in `texts/raw/Judaism/` (only
   the English target is catalogued today; add the Hebrew target to `source.yaml` and handle
   its shape in the converter).
2. **2-model panel**: one opus-class and one haiku-class model (claude-opus-5-5 +
   claude-haiku-5-5; configs/models.example.yaml updated to this shape).
3. **Tool-use toggle**: per-model `tools` config in collect — specifically **web search
   enabled vs disabled** (Anthropic server-side web_search tool). The tutorial run executes
   the panel BOTH ways (2 models × search on/off = 4 panel entries) so the difference is
   directly visible in the viewer. The panel fingerprint and standings identity must
   incorporate the tools setting so on/off never collide as one model.
4. **Non-Latin scoring**: the deferred Arabic/Hebrew normalization lands now — `normalize()`
   must treat Arabic (diacritics/tatweel/alef variants) and Hebrew (niqqud/maqaf) sensibly
   so Qur'an/Talmud quote scoring is fair; per-task contract unchanged; tests with
   real-script fixtures.
5. **Committed tutorial run** under `runs/` (gitignore negation + README, audited clean,
   secret-free panel); the merged viewer must pick it up with zero code changes — verify
   leaderboard, explorer, and standings against it.
6. Keep the full E2E property: fresh clone → TUTORIAL.md verbatim → same questions
   (deterministic) → collect (keys in env) → score → view.

**Human notes (Issue #8, 2026-10-11) — binding context:**

- Issue #7 (mtime recency) is adjacent: if `score.py` gains a `generated_at` in
  `summary.json` while you're in there, that closes #7's pipeline half — optional, flag it
  in the spec either way. *(Flagged — see Solution Approaches / Open Questions.)*
- Web-search-enabled quoting is expected to score HIGHER — that contrast (parametric memory
  vs tool-assisted retrieval) is what the human wants to see.

**Observed-state constraints that bound the solution (from reading the code):**

- The **Hebrew `he` Talmud target and both non-Latin converters already exist** (see Current
  State). Requirement 1's "only the English target is catalogued today; add the Hebrew
  target / handle its shape" is **already satisfied in the source tree**; treat it as a
  *verify the ar/he path produces and scores documents end-to-end* task, not a from-scratch
  converter build. (Flagged per the Builder brief; no architect decision is being overridden
  — the catalogued `he` target stands.)
- **The viewer must not be changed** (requirement 5: "zero code changes"). Its standings
  dedupe key is `panel.provider \u0000 panel.model` and it ignores any non-`{provider,
  model, endpoint, served_by}` panel field, so the tools-setting distinction (requirement 3)
  must be produced **in the pipeline's panel output**, not by teaching the viewer a new field.
- Stack / contract fixed: the run data model is owned by `pipelines/sacredbench score`; the
  per-task `_SUBMETRICS` table and the headline rules are unchanged (requirement 4). Derive
  behaviour from **real data**, not docs (project lesson).
- Copyright gate unchanged: the committed run may derive only from public-domain / open
  sources (KJV, Qur'an QUL, Davidson Talmud all qualify); the audit is part of the test gate.
- `runs/first-run-2026-10-11/` is the Spec-1/Spec-2 committed evidence and the viewer's
  committed-run gate target; it is not removed by this work.
- Web search is an **Anthropic server-side** tool, so the tool toggle is meaningful only for
  the two `anthropic`-provider models; the panel for this tutorial is all-Anthropic by
  design (the ≥2-provider story was a Spec-1 proof concern, not a gate). Enabling it on a
  non-Anthropic provider is a config error (fail-fast), not a silent no-op.
- **New copyright surface: committing live-web-search answers to a public repo.** The
  existing `audit.py` cannot detect a copyrighted third-party edition/translation echoed by a
  search-enabled model (its origin layer keys on the question's public source; its content
  layer is restricted-payload-gated and, as verified, Latin-only). **Amended 2026-10-11:** the
  maintainers accept such incidental copyrighted text in a model answer as **fair use for
  academic research**, so the run is committed as collected with a fair-use note (no manual
  clearance step — see Approach F, superseded). The automated `audit` remains the enforced gate.
- **The scoring contract does not change.** `_SUBMETRICS` and the per-task headline rules
  (incl. `retrieve_quote`'s `correct = normalized`) stay exactly as they are (requirement 4);
  only the *values* `normalize()` produces for non-Latin text change.
- **Attribution for CC-BY-NC.** The committed run's README preserves the Davidson Talmud's
  source/attribution/licence/non-commercial notice; the coarse `open` enum is a gate
  classification, not a substitute for attribution.

## Assumptions

- The three standardized corpora are produced by `convert` from the committed raw sources
  (KJV, Qur'an QUL, Talmud `he`); `texts/standardized/` is rebuilt locally, so the tutorial's
  convert step is the prerequisite for its generate step (as today).
- `generate`'s `retrieve_quote` template works unchanged over Arabic/Hebrew entries (it emits
  the expected unit text and citation from the standardized document); non-Latin is a
  data-content concern, not a template concern. (To be confirmed during implementation — see
  Risks.)
- The Anthropic Python SDK accepts the server-side web-search tool via `tools=[…]` on
  `messages.create`; the existing text-extraction (`join text blocks`) and usage extraction
  (`input_tokens`/`output_tokens`) remain valid when tool blocks are present. (Verify the
  exact tool spec/version against the SDK during implementation; fail loud if the shape is
  not as expected — project "no fallbacks" rule.)
- With web search enabled, `collect` results are **not** byte-reproducible (live web + model
  nondeterminism); determinism (requirement 6) is a property of the **question set**, not the
  answers — matching the existing Track A (reference) / Track B (fresh run) split.
- The committed tutorial run's question count is modest (plan-level), because 4 panel entries
  and server-side web search raise the cost of the one paid step; the tutorial keeps the
  `collect` step clearly marked as the only paid part.
- The Davidson Talmud (`he`) and QUL Qur'an quotes in a committed run are copyright-clean
  (open / public-domain), so the committed run passes the origin audit in a clone / CI.
- Adding a second committed run does not break the viewer's run-discovery or committed-run
  gate tests (checked during the consult: the viewer tests stub `fetch` with a hardcoded
  index and `runsEndpoint.test.ts` works over a temp dir — none enumerate the real `runs/`
  — so the risk is low; still verified by running the suite).
- The benchmark targets the **original-language** texts (KJV English, Qur'an Uthmani Arabic,
  Talmud Hebrew/Aramaic original), which are public-domain as originals; the CC-BY-NC applies
  to the Davidson *edition/English translation*. A web-search answer that returns a
  copyrighted translation is both wrong (scores 0 against the original-language target) and an
  easy-to-spot outlier — but, per the 2026-10-11 amendment, it is committed as collected (fair
  use), not redacted.
- `generate.py` imports `normalize` from `score` (for `work_texts`/`version_texts` in
  `verify_source`/`identify_version` pooling). The normalize change therefore has a
  generation-side blast radius for non-Latin pooling, but Latin determinism is safe:
  `generate._qid` hashes **raw** text and Latin `normalize()` output is unchanged. The
  tutorial pins `--tasks retrieve_quote`, which does not use that pooling.
- `generate.py`'s `MIN_WORDS_IDENTIFIABLE = 12` excludes short units from some pools, so the
  committed run's Arabic items may skew toward longer ayat — expected behaviour, not a bug
  (the Qur'an pool is ample).
- Anthropic reports server-side web-search usage under `usage.server_tool_use.
  web_search_requests`, which the current token-only usage extraction does not capture; the
  committed run avoids a misleading cost by staying unpriced (Solution Approaches H).

## Solution Approaches

The *what* (three-source tutorial, 2-model × search-on/off panel, fair non-Latin scoring,
committed run the viewer picks up) is fixed by the Constraints. The open design space is in
four areas; each is resolved below.

### Approach A: Tools-setting identity — encode into the emitted panel identity (CHOSEN)

Add an optional per-model tool-use setting to the run config (e.g. a `tools` / web-search
flag on each model entry). In `collect`, when enabled, pass the Anthropic server-side
web-search tool on the call; extend `_panel_fingerprint` to include the tools setting. In
the panel snapshot written to `summary.json`, make the tools setting part of the identity the
viewer already keys on — i.e. the emitted `panel.model` (and/or `provider`) for a
search-enabled entry is distinct from the search-disabled entry (for example by a stable
suffix/marker), while the **actual API model string sent to the provider is unchanged**.

- **Pros:** satisfies requirement 3 (fingerprint *and* standings identity incorporate tools)
  **and** requirement 5 (zero viewer changes) simultaneously — standings keys on
  `provider\u0000model`, so a tools-marked `model` yields distinct rows; leaderboard/explorer
  key on `model_id` and already separate the four entries. No new viewer field, no viewer
  behaviour change.
- **Keep the proof truthful.** `score.py` documents the `panel` block as the committed
  artifact's *proof* of what actually ran, so a marker-bearing `panel.model` must not erase
  the real API model string. The panel entry also emits the **raw API model string** under a
  key the viewer ignores (e.g. `api_model`), so `(provider, model)` carries the tools-aware
  identity the viewer keys on while the true model id remains recoverable from the artifact.
- **Cons:** the emitted `panel.model` is a display/identity string that now carries a tools
  marker, not purely the raw API model id (mitigated by the `api_model` field above); the
  panel markdown header ("≥3-model / ≥2-provider proof") becomes a slight misnomer for a
  2-model all-Anthropic panel (cosmetic — see Open Questions).
- **Risk/complexity:** low. The real API model string is kept separate from the panel-identity
  string; fingerprint and panel changes are localized to `config.py` / `collect.py` /
  `cli.py` / `score.py`.
- **Tool-config validation is fail-fast** (project "no fallbacks" norm). `ModelSpec` also
  accepts `openai`/`gemini`; web search is an Anthropic server-side tool, so enabling it on a
  non-`anthropic` provider, or supplying an unrecognised tools value, must raise
  `ConfigError` at load time — never be silently ignored. (Today `config.py` does **no**
  unknown-key validation, so a stray `tools:` is silently dropped; the new setting must be
  genuinely parsed and validated, not merely tolerated.)

### Approach B: Tools-setting identity — add a `tools` field to the panel and change the viewer (REJECTED)

Emit `panel[...].tools` and teach the viewer's `aggregate` key (and parser) to include it.

- **Pros:** cleaner data model (the raw API model id stays pure; tools is its own field).
- **Cons:** **violates requirement 5** ("zero code changes" to the merged viewer). Rejected
  on that constraint alone. (If the architect later decides a viewer change is acceptable,
  this is the cleaner long-term shape — noted, not chosen.)

### Approach C: Committed tutorial run — ADD a new run, keep first-run (CHOSEN)

Create a new `runs/<tutorial-id>/`, negate it in `.gitignore` alongside the existing
`!runs/first-run-2026-10-11/`, and leave `first-run-2026-10-11` in place. The new run is the
most recent, so the viewer defaults to it; the committed-run gate test (`realRun.test.ts`)
keeps targeting first-run untouched.

- **Pros:** honours requirement 5's "zero code changes" most literally — the existing viewer
  gate test and its fixture are not disturbed; the tutorial run is picked up purely as data
  (run discovery lists any dir with a `summary.json`). Two committed runs also make the
  standings/cross-run view non-trivial (first-run's models vs. the tutorial's models).
- **Cons:** the repo now commits two runs (more bytes); if any viewer test asserts an *exact*
  set of discovered runs, adding one would break it (see Risks — to verify; that is the one
  tension that could require a viewer-test touch, which would be raised rather than decided).
- **Alternative (REJECTED): replace first-run with the tutorial run.** Cleaner single-run
  story, but requires repointing `realRun.test.ts` — a viewer source change (requirement 5)
  — and discards Spec-1/Spec-2 evidence. Rejected.

### Approach D: Non-Latin normalisation — delete marks before punctuation-stripping (CHOSEN)

In `normalize()`, before the `[^\w\s]`→space step, **delete** (not space-replace) the Arabic-
and Hebrew-range combining marks and editorial annotation code points, remove the Arabic
tatweel (U+0640), fold alef/hamza/alef-wasla variants to a bare alef (U+0622/0623/0625/0671 →
U+0627) and fold the Hebrew maqaf (U+05BE). Keep the existing NFKD / quote / dash / casefold /
whitespace steps for Latin so Latin output is byte-for-byte unchanged.

**The mark set is derived from the REAL QUL / Davidson data, not a guessed range** (project
lesson; a reviewer correctly caught that a U+064B–U+065F-only list would ship broken). An
enumeration of the committed `quran_uthmani_from_qul.json.json` shows the Qur'anic text
carries combining marks and editorial symbols *well beyond* the basic harakat — and many
occur **mid-word**, so the current `[^\w\s]` pass splits those words:

- basic harakat / tanwin / shadda / sukun / maddah / superscript-alef: U+064B–U+0655, U+0670;
- Qur'anic annotation marks (small high/low marks): the U+06D6–U+06ED block
  (e.g. U+06D6, U+06DA, U+06DF, U+06E2, U+06ED — all present in QUL);
- editorial symbols (category So): U+06DE (start of rub-el-hizb), U+06E9 (place of sajdah);
- small modifier letters (category Lm): U+06E5/U+06E6 (small waw/yeh), and tatweel U+0640;
- Hebrew points U+05B0–U+05BD / U+05BF / U+05C1–U+05C2 / U+05C4–U+05C5 / U+05C7, cantillation
  U+0591–U+05AF, and the maqaf U+05BE.

The contract is therefore stated by **range + category** (delete Arabic-block combining marks
U+064B–U+065F and U+0670 and U+06D6–U+06ED, the Arabic editorial So/Lm annotation code points
present in QUL, the Hebrew-block combining/cantillation marks, and tatweel), re-derived from
the real data during implementation, and locked by **full real-ayah and real-Talmud-line
fixtures** (e.g. a QUL ayah carrying annotation marks + a sajdah/rub-el-hizb symbol such as
2:5 / 7:206) — not a toy string.

- **Pros:** fixes the real failure (verified: harakat/niqqud were turned into word-splitting
  spaces and alef-wasla left unfolded) with an auditable, data-derived transformation; the
  per-task contract and Latin behaviour are untouched.
- **Cons:** an explicit mark/range set is a maintenance surface (new scripts need new ranges);
  mitigated by deriving from real data and by real-script fixtures.
- **Alternative (considered): strip *all* Unicode combining marks (category Mn) generically.**
  Simpler and would catch any missed Arabic/Hebrew mark, but it also changes Latin-with-
  diacritics behaviour (`naïve` currently normalises to `nai ve`; delete-all-Mn would give
  `naive`), which risks regressing Latin `normalized`/`token_f1` values and the "Latin
  byte-for-byte unchanged" guarantee. The script-scoped approach is preferred; a Latin
  regression fixture guards whichever is chosen.

### Approach E: Issue #7 `generated_at` timestamp (OPTIONAL — recommend include)

`score.py` could stamp a `generated_at` (UTC ISO timestamp) into `summary.json`, closing the
pipeline half of Issue #7 (the viewer's "most recent" ordering currently relies on fragile
directory mtime). This is additive metadata the current viewer ignores (no viewer change), so
it is safe to include.

- **Recommendation:** include it as a small additive field (it is low-risk, the human
  flagged it, and it strengthens the committed run's self-description), but treat it as
  *optional scope* — if it complicates the committed-run reproduction or the audit, drop it
  and leave #7 open. The viewer cannot consume it without a (disallowed) change, so it does
  **not** change this spec's viewer behaviour either way.

### Approach F: Web-search answers in a public committed artifact — documented clearance (SUPERSEDED)

> **Amended 2026-10-11 (human determination):** the manual clearance step below was **dropped**.
> The maintainers treat incidentally web-retrieved copyrighted text appearing in a model answer
> as **fair use for academic research**; the run is committed **as collected**, answers never
> truncated or edited, with a one-line fair-use note in the run `README.md`. The automated
> `audit` (origin + restricted-payload fingerprints) remains the enforced gate. The analysis
> below is retained as the rationale for *why* the exposure is bounded (original-language targets),
> which still holds — only the manual review step is removed.

This spec commits, for the first time, **model answers produced with live web search** to a
**public** repo. That is a new copyright surface the existing gate cannot see: `audit.py`'s
origin layer keys on the *question's* source (KJV / QUL / Davidson — all public-domain or
open, so it passes), and its content layer only fingerprints restricted text when the
held-back payloads are present locally. A search-enabled model asked for a Talmud daf or a
Bible verse could fetch and echo a *copyrighted third-party edition/translation* (e.g.
Steinsaltz English, NABRE, NA28) that then lands in a committed `answers.jsonl`.

- **What makes the exposure bounded:** the tutorial's expected answers are the
  **original-language** texts — the KJV (public domain), the Qur'an Uthmani **Arabic**
  (public domain), and the Talmud **Hebrew/Aramaic original** (ancient text; the CC-BY-NC
  applies to the Davidson *edition/English translation*, not the original-language letters).
  A model that returns a copyrighted *translation* is both answering the wrong thing (it
  scores 0 against the original-language target) and an easy-to-spot outlier.
- **Chosen mitigation:** a **documented copyright clearance of the committed search-on
  answers** before they are committed — at minimum a recorded spot-check (described in the
  run README) that the committed answers are original-language text, not lifted copyrighted
  editions; the exact mechanism is a plan decision, but the spec *requires one to exist* and
  requires the README to state it ran. **Truncating/omitting the committed answers is
  rejected** — the viewer's error explorer must show the model's actual answer, so the
  answers stay intact and are cleared instead.
- **Attribution:** because the Davidson Talmud is **CC-BY-NC**, the committed run's README
  preserves source / attribution / licence / non-commercial notice for it (coarse `open`
  audit-pass is not attribution).

### Approach G: `audit.py :: _norm` is Latin-only on the non-Latin run — extend (RECOMMENDED, optional)

Verified: `audit.py :: _norm` strips non-ASCII, so `_norm(<vocalized basmala>)` → `''` and
the restricted-text content layer (which needs `len(n) >= 60`) is a **no-op** on Arabic /
Hebrew. For *this* committed run the content layer is not the guard anyway (it fires only when
restricted payloads are present locally; in a clone/CI the enforceable proxy is origin, and
this run uses no restricted source). But a spec whose point is fair non-Latin handling should
not leave the content layer silently blind.

- **Recommendation:** extend `audit._norm` for Arabic/Hebrew alongside the `normalize()` work
  (small, adjacent, same scripts) so the content layer actually fingerprints non-Latin
  restricted text. Treat as *optional scope*; if dropped, the spec **states the limitation
  explicitly** (content layer is Latin-only; origin + Approach F clearance are the committed
  run's protection) rather than letting "`audit` passes" imply non-Latin coverage it lacks.

### Approach H: Web-search request cost accounting — unpriced committed run (CHOSEN)

`_anthropic_usage` captures only `input_tokens`/`output_tokens`; Anthropic bills server-side
web search **per request** (`usage.server_tool_use.web_search_requests`), which the current
extraction omits. With `price_in`/`price_out` set, the committed run's cost table would
understate the true cost — against `score.py`'s explicit norm that a partial number must not
masquerade as the run's cost.

- **Chosen:** the committed tutorial run's `models.example.yaml` panel stays **unpriced**
  (token-only, as the first run did), so `score` emits **no** `cost_usd` and no misleading
  cost table arises. Optionally also capture `web_search_requests` into the answer-row usage
  as provenance (additive; the viewer ignores it). The spec forbids emitting a priced cost
  table for a search-enabled run while per-request search charges are uncaptured.

## Open Questions

- **Critical — RESOLVED (human, 2026-10-11): committed search-on answers are NOT cleared.**
  The maintainers determined that incidentally web-retrieved copyrighted text in a model answer
  is fair use for academic research; the run is committed as collected (answers never truncated
  or edited) with a one-line fair-use note in the run `README.md`, and no manual clearance step
  runs. The automated `audit` (origin + restricted-payload fingerprints) remains the enforced
  gate. (Approach F's clearance mechanism is superseded; its bounded-exposure rationale stands.)
- **Important** — *Exact Anthropic web-search tool spec.* The precise tool type/name/version
  and any `max_uses` cap for the server-side web-search tool must be pinned against the
  installed SDK during implementation (fail loud if the response shape differs). Shapes the
  collect change; does not block the spec.
- **Important** — *Extend `audit._norm` for non-Latin, or declare it out of scope?* The audit
  content layer is Latin-only today (verified no-op on Arabic/Hebrew). Recommended to extend
  it alongside `normalize()` (Solution Approaches G); if not, state the limitation explicitly.
- **Important** — *Capture `web_search_requests` usage, or only stay unpriced?* The committed
  run stays unpriced regardless (Approach H); whether to also record search-request counts as
  provenance is a plan call.
- **Important** — *Panel-identity encoding form.* Approach A requires a concrete, stable way
  to make the search-on entry's `panel.model` distinct from search-off (a suffix marker vs.
  another scheme). Resolve in the plan; the requirement (standings must distinguish them,
  viewer unchanged) is fixed.
- **Nice-to-know** — *Panel markdown header wording.* `summary_markdown` labels the panel
  table "proof of the ≥3-model / ≥2-provider bar"; for a 2-model all-Anthropic tutorial panel
  that heading is inaccurate. Soften it (pipeline, low-risk) or leave it. Cosmetic.
- **Nice-to-know** — *Tutorial question count / per-task.* How many questions the committed
  tutorial run contains (cost of 4 cells × web search). Plan-level; keep it modest.
- **Nice-to-know** — *Include `generated_at` (Issue #7)?* See Approach E — recommend include,
  optional.

## Test Scenarios

**Happy paths**

- `convert` then `generate` over the three standardized corpora (KJV `en`, Qur'an `ar`,
  Talmud `he`) with a fixed seed produces a question set whose `expected.text` includes
  Arabic and Hebrew strings across the three traditions; re-running with the same seed
  reproduces the identical set (digest stable).
- `normalize()` on a vocalized vs. unvocalized Qur'an ayah returns equal strings and
  `token_f1 = 1.0`; same for a niqqud vs. plain Hebrew/Aramaic Talmud line. A
  verbatim-correct Arabic `retrieve_quote` answer scores `normalized = 1` (`correct = 1`).
- A **full real QUL ayah** carrying mid-word annotation marks and a sajdah/rub-el-hizb
  symbol normalises to the same form as its mark-free spelling (not split into fragments).
- The committed `first-run-2026-10-11` question-set digest recomputed after the
  `normalize()` change equals the committed digest (Latin generation unaffected).
- `config.py` loads the 2-model / 4-entry `models.example.yaml` (opus + haiku, each ×
  search-{on,off}) with distinct ids and the tools setting, no error.
- `collect` with a search-enabled model issues the Anthropic web-search tool call; with it
  disabled, a plain call; both produce scorable answer rows carrying a tools-aware panel
  fingerprint.
- The committed tutorial run renders in the merged viewer with no source change: the run
  selector lists it (and first-run), the leaderboard ranks all four entries with per-task +
  per-tradition columns and token totals, the explorer drills into each, and **standings
  shows the four as four rows** (opus-search / opus-no-search / haiku-search /
  haiku-no-search), none collapsed.
- The web-search-on entries' `retrieve_quote` accuracy/similarity is visible next to the
  web-search-off entries (the parametric-vs-retrieval contrast is readable).

**Edge cases**

- Latin text (KJV verse) through the new `normalize()` is byte-for-byte identical to the old
  output (regression guard); all pre-existing Latin scoring tests pass unchanged.
- Arabic with tatweel (`مـحـمـد`) and with mixed alef variants normalises to the same form as
  the plain spelling.
- Hebrew with a maqaf (`עַל־כֵּן`) normalises without splitting into single letters and matches
  the un-pointed, maqaf-free form.
- Resuming the committed tutorial run's `answers.jsonl` against a config that flips a model's
  tools setting is refused with a clear `CollectError` (panel-identity / tools binding).
- A run missing a `panel` entry for a model still renders in standings via the `model_id`
  fallback (unchanged viewer behaviour; not regressed).

**Error conditions / integrity**

- `audit runs/<tutorial-id>` passes (origin-clean; only public-domain/open sources); a
  deliberately planted restricted-derived artifact would fail (existing gate behaviour,
  not re-implemented).
- The run is committed as collected (no manual clearance pass); the run README records the
  fair-use note and the CC-BY-NC Davidson attribution. Answers are verbatim, never truncated.
- The committed `summary.json.panel` contains no API keys or secrets — only provider / model
  / endpoint / `api_model` / served_by.
- Adding the tutorial run leaves `realRun.test.ts` (first-run gate) and the `#86` CSS probe
  green; `.codev/checks/test.sh` is green overall.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Standings collapses search-on/off into one row because the identity change didn't reach the key the viewer actually uses | Medium | High | Approach A encodes tools into the emitted `panel.model` — the *exact* `provider\u0000model` key `aggregate.ts:59` reads; verified against the committed run in the viewer before calling it done. |
| A viewer test asserts an *exact* set of discovered runs, so adding the tutorial run reds the suite | Low | Medium | Verify against the merged viewer test suite early; if such an assertion exists, **raise it with the architect** (touching a viewer test is the one place requirement 5 may bend) rather than silently editing viewer source. |
| `generate`'s `retrieve_quote` template or citation uniqueness misbehaves on Arabic/Hebrew entries | Low | Medium | Converters already produce `ar`/`he` documents with unique citations; run convert→generate on the real corpora and inspect the produced questions before collecting (derive from real data). |
| Anthropic web-search tool spec/SDK shape differs from assumption; tool blocks break text/usage extraction | Medium | High | Pin the exact tool spec against the installed SDK; validate the response structure and **fail loud** on an unexpected shape (no fallback); a budgeted live smoke exercises the search-on path end-to-end. |
| `normalize()` mark set under-covers the real QUL data (misses Qur'anic annotation marks, some mid-word), so Arabic quotes still mis-score | Medium | High | Derive the mark set from the REAL QUL/Davidson data (enumerated: U+06D6–U+06ED block, rub-el-hizb/sajdah symbols, superscript alef, tatweel); lock with a full real-ayah fixture. |
| New `normalize()` silently changes Latin scoring (regresses the committed first-run numbers) | Low | High | Scope mark-deletion/folding to Arabic/Hebrew ranges; add a Latin regression fixture asserting byte-identical output; assert the first-run digest is unchanged; keep all existing Latin scoring tests. |
| **A search-enabled model echoes a copyrighted translation into a committed public artifact; the audit can't see it** | Medium | Low (accepted) | Target original-language (public-domain) texts; a copyrighted translation scores 0 and is an outlier; **human determination 2026-10-11: incidental copyrighted text in a model answer is fair use for academic research** — committed as collected with a fair-use note, no manual clearance; CC-BY-NC Davidson attribution preserved in the README. |
| `audit._norm` is Latin-only, so the content layer silently no-ops on the non-Latin committed run | Medium | Medium | Extend `audit._norm` for Arabic/Hebrew alongside `normalize()` (Approach G), or state the limitation explicitly; the committed run's enforceable protection is origin regardless. |
| A priced search-enabled run reports a cost that omits per-request web-search charges | Low | Medium | Keep the committed panel unpriced (token-only, no `cost_usd`); forbid a priced cost table while search-request charges are uncaptured (Approach H). |
| Headline `correct = normalized` (whole-answer equality) inverts the search-on/off contrast (attribution prose penalised) | Medium | Medium | Name the hazard; present `token_f1`/`exact` as the discriminating numbers; do NOT alter `_SUBMETRICS` (req 4). |
| Tool-use config silently ignored (today `config.py` does no unknown-key validation) | Medium | Medium | Parse the tools setting into `ModelSpec` and validate fail-fast (ConfigError on non-Anthropic provider / invalid value); a test asserts the rejection. |
| Web-search `collect` is slow / costly (4 cells × server-side search) | Medium | Low | Keep the tutorial question count modest; `collect` is the only paid step and stays clearly marked; resumable collect limits waste. |
| Committed tutorial run re-scored/re-collected over itself corrupts the evidence | Low | High | Write a fresh `runs/<id>/`; the tutorial's own Track-A/B guidance (and the project lesson) forbid collect/score over committed evidence. |
| Panel markdown header still claims a "≥3-model/≥2-provider" bar for a 2-model panel | Low | Low | Soften the header wording (pipeline, cosmetic) or leave it; noted as nice-to-know. |

## References

- Issue #8 — `[Spec 3] Tutorial centered on KJV / Qur'an / Talmud (he), 2-model panel,
  web-search on/off comparison` (requirements 1–6 + notes copied verbatim into Constraints).
- Issue #7 — mtime recency (the `generated_at` pipeline half; Approach E / Open Questions).
- `codev/specs/1-phase1-benchmark-pipeline.md` + review — the pipeline, the run data model,
  the `TUTORIAL.md` loop, and the committed `first-run-2026-10-11` evidence.
- `codev/specs/2-spec-2-replace-multibrowser-le.md` + the merged viewer (`apps/viewer/`) —
  the leaderboard / explorer / standings this run must render unchanged; standings key
  `apps/viewer/src/lib/aggregate.ts`, panel parse `apps/viewer/src/lib/localResults.ts`, run
  discovery `apps/viewer/vite/runsEndpoint.ts`, gate `apps/viewer/src/local/realRun.test.ts`,
  `#86` probe `apps/viewer/src/deploy.test.ts`.
- `pipelines/sacredbench/score.py` — `normalize()`, `_SUBMETRICS`, the panel snapshot, the
  "cost must not masquerade" rule; `collect.py` — `_panel_fingerprint`; `config.py` —
  `ModelSpec` (no unknown-key validation today); `providers.py` — `_anthropic`,
  `_anthropic_usage` (token-only); `cli.py` — the `score` panel build; `generate.py` —
  imports `normalize`, `_qid` (raw-text hash), `MIN_WORDS_IDENTIFIABLE`; `audit.py` — origin
  + content layers, `_norm` (Latin-only).
- Iter-1 spec consultation (both REQUEST_CHANGES, HIGH): `codev/projects/8-spec-3-tutorial-centered-on-kj/8-specify-iter1-{codex,claude}.txt`
  — the copyright-exposure, QUL-mark-coverage, audit `_norm`, web-search-cost, headline-metric,
  config fail-fast, and `api_model` findings folded into this revision.
- `texts/raw/Protestant Christian/source.yaml` (KJV), `texts/raw/Sunni Islam/source.yaml`
  (Qur'an QUL `ar`), `texts/raw/Judaism/source.yaml` (Talmud Davidson `he`) — the three
  target corpora; `convert.py` converters `bible_flat` / `quran_qul` / `sefaria_talmud`.
- `codev/resources/arch-critical.md`, `codev/resources/lessons-critical.md` — multi-faith by
  construction, copyright gate, derive formats from real data, never re-run collect/score
  over committed evidence.
- `.gitignore` (`runs/*` + `!runs/first-run-2026-10-11/`); `TUTORIAL.md` (the file reworked
  by this spec); `configs/models.example.yaml` (updated to the 2-model panel).
