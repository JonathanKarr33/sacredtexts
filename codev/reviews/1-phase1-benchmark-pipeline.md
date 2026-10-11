# Review: Phase 1 benchmark pipeline, viewer, and codev infrastructure

## Summary

Built the Sacred Texts (CEFE-AI) Phase 1 benchmark end to end across **8 implement
phases**: a two-tier text corpus (`texts/raw` → `texts/standardized`) driven by a
`source.yaml` catalogue with a licence gate; seven real-data converters; an
interchange exporter with a round-trip guarantee; deterministic version-gated
generation; resumable collection; a per-task scoring contract with tradition-aware
analysis, token usage and panel proof; a minimal local results viewer; a copyright
audit in the test gate; and a first **live run** (100 English `retrieve_quote`
questions × a 4-model / 2-provider panel) committed as copyright-clean evidence with
a fresh-clone-verified `TUTORIAL.md`. Net outcome: the loop closes on real data — the
benchmark discriminates (claude-haiku 24%, three small models ~0%) and surfaces the
target failure mode (refusal vs fabrication).

## Spec Compliance

- [x] AC — `source.yaml` catalogue as the single provenance/licence control point;
  restricted sources excluded by default (Phase 1)
- [x] AC — converters derived from the real data, fail-fast, per-converter tests
  (Phases 2–3: Bibles, LDS, encyclicals, Qur'an, hadith, Talmud)
- [x] AC — interchange export is lossless with an inverse-grouping round-trip (Phase 4)
- [x] AC — deterministic, version-gated, tradition-balanced generation; resume-guarded
  collection bound by a question-set digest (Phase 5)
- [x] AC — scoring reports exact/normalized/token-F1 on every answer; per-task headline
  contract; per-model × task × tradition breakdown with missing-cell roster (Phase 6)
- [x] AC — minimal local viewer renders a run independent of the GitHub data layer (Phase 7)
- [x] AC — from a fresh clone, `TUTORIAL.md` verbatim produces the summary table and a
  viewable page; no restricted data required (Phase 8, verified)
- [x] AC — audit passes and would fail on injected restricted **text**; committed
  artifacts contain no restricted source text (Phase 8)
- [x] AC — `collect` ran ≥3 models / ≥2 providers; build + tests pass; PR opens with all
  phase commits (Phase 8; panel proof + token totals committed in the run)

## Deviations from Plan

- **Phase 4/5 (data fact, architect-directed):** LDS KJV is **not** byte-identical to
  Protestant KJV (104/2900 verses differ, editorial/orthographic). Used distinct
  version labels (`KJV` vs `KJV (LDS 2013 edition)`); dedup applies only to truly
  byte-equal entries. Mechanism unchanged — no re-gate.
- **Phase 8 cost reporting:** the plan allows optional cost "if per-model price is
  supplied." Wired `price_in`/`price_out` through `ModelSpec`/`load_config`/the score
  CLI and compute a total only when every model is priced (else token totals only);
  prices are never invented.
- Otherwise the plan held.

## Consultation Feedback

Per-phase 2-way consults (`codex`, `claude`); full artifacts + dispositions in
`codev/projects/1-spec-1-seed-phase-1-benchmark-/`. porch advanced each phase once the
substantive concerns were **fixed or dispositioned** — which is NOT the same as both
reviewers ending on APPROVE. Several phases' final round still carried a
REQUEST_CHANGES whose remaining points were non-blocking refinements or already
addressed (verified by re-running); the exact final verdicts per phase:

| Phase | final codex | final claude | note |
|---|---|---|---|
| 1 | APPROVE | APPROVE | |
| 2 | APPROVE | REQUEST_CHANGES | claude's residual points addressed; porch advanced |
| 3 | APPROVE | APPROVE | |
| 4 | REQUEST_CHANGES | APPROVE | codex residual dispositioned (round-trip fix verified) |
| 5 | REQUEST_CHANGES | APPROVE | codex residual dispositioned (balanced-sample fix verified) |
| 6 | COMMENT | REQUEST_CHANGES | scoring contract gated; residual = Spec-2 refinements |
| 7 | APPROVE | APPROVE | |
| 8 | COMMENT | APPROVE | |

(An earlier draft of this doc overstated this as "every phase converged"/labelled 4
and 5 as codex COMMENT — corrected here per the PR-level claude review.)

### Phases 1–7 (summary; detail in each phase's iter files)
- **Phase 1 (3 rounds → APPROVE/APPROVE):** gate failed open (`_catalogue_or_empty`
  returned `[]`) → **Addressed** with `CatalogueMissing` + fail-loud; missing
  spec-required provenance fields → **Addressed**.
- **Phase 2 (3 rounds → codex APPROVE, claude REQUEST_CHANGES; residual addressed):** heading-as-verse inflated BoM counts →
  **Addressed**; duplicate encyclical citations and a footnote-restart heuristic that
  truncated bodies → **Addressed** with lossless `(dup N)` conversion.
- **Phase 3 (2 rounds → APPROVE/APPROVE):** Talmud HTML/daf-offset/empty-section
  handling → **Addressed** (derived from the real data; tractate dedup; language guard).
- **Phase 4 (3 rounds → claude APPROVE, codex REQUEST_CHANGES; residual dispositioned):** round-trip must prove no
  invention/reordering → **Addressed** with inverse-grouping + entry-set equality
  (fix verified at HEAD by the PR-level review).
- **Phase 5 (3 rounds → claude APPROVE, codex REQUEST_CHANGES; residual dispositioned):** `_balanced_sample` was
  input-order-dependent → **Addressed** (sort sub-pools by content before seeded
  shuffle); single-work verify_source silently all-positive → **Addressed** (fail-fast).
- **Phase 6 (5 rounds; the hardest):** citation scoring was gameable by containment →
  **Addressed** (single-candidate boundary equality); `identify_version` containment →
  **Addressed** (label metrics); a numeric-only extractor regressed correct citations
  and a greedy paragraph prefix collapsed hedges → **Addressed** (shape-selected
  extractor + `(?![Pp]ara)` guard); a repeated-correct citation counted as a hedge →
  **Addressed** (collapse spans asserting the expected citation). claude's final
  residual concerns were non-blocking refinements; **N/A** to the gated contract.
- **Phase 7 (2 rounds → APPROVE/APPROVE):** viewer only rendered a compiled-in fixture
  → **Addressed** with `loadRun` + a dev middleware serving real `runs/`.

### Phase 8 (3 rounds → claude APPROVE, codex COMMENT)
- **iter-1** (both REQUEST_CHANGES): token/usage totals absent → **Addressed** (`usage`
  block); keyless TUTORIAL step tracebacked → **Addressed** (`ConfigError` fail-fast +
  keyless variant); ≥2-provider bar not provable from artifacts → **Addressed** (`panel`
  block, no secrets); audit origin-only vs "contains restricted text" → **Addressed**
  (content-fingerprint layer + injected-text test); fresh-clone run not done →
  **Addressed** (ran TUTORIAL 1–7 from a clean clone; digest byte-identical).
- **iter-2** (codex REQUEST_CHANGES, claude COMMENT): TUTORIAL `collect`/`score`
  targeted the committed evidence (resume-skip / overwrite) → **Addressed** (Track A
  keyless→/tmp, Track B fresh `runs/<id>/`); panel block rendered null under no-config
  → **Addressed** (omit when no config); cost branch unreachable → **Addressed** (wired
  prices + test).
- **iter-3** (claude APPROVE, codex COMMENT): partial-pricing total was a subtotal with
  `$0.0000` rows → **Addressed** (total only when all priced; `n/a` render); Track B
  audited only questions → **Addressed** (post-score audit); committed summary not
  self-describing → **Addressed** (`runs/first-run-2026-10-11/README.md`). Abstention-
  vs-hallucination split and a relaxed "quote-contained" metric → **N/A** here
  (gated Phase-6 contract) — see Follow-up.

### Review phase — PR #3 (3-way integration review: codex REQUEST_CHANGES, claude COMMENT→REQUEST_CHANGES, architect fresh-clone verification; gemini lane unavailable)

The architect's consolidated review raised 4 pre-merge items + 4 to disposition.
The committed evidence was independently re-verified reproducible (digest `ef837474`
byte-identical; scores reproduce from answers; keyscan clean).

Pre-merge (all **Addressed**):
1. `audit` crashed (exit 2) when a restricted payload with an **unregistered converter**
   (TLG) was present locally → **Addressed**: `restricted_text_fingerprints` skips such
   targets with a loud warning; the origin layer stays enforced.
2. NABRE converter was written against the wrong shape (real `nabre.json` is a
   **top-level list** of 73 book objects) → **Addressed**: `convert_nabre` + fixture
   rewritten to the list shape; heading strings in verse text kept verbatim.
3. Test dispatcher skipped PRs touching only `runs/**` or `texts/**` → **Addressed**:
   both now route to the pipelines lane (whose pytest runs the committed-artifact audit).
4. Evidence binding was digest-complete but panel-incomplete → **Addressed**: `collect`
   now stamps a per-cell panel fingerprint (provider|model|base_url) and refuses resume
   under a changed identity; `score --questions` refuses when the answers' digest ≠ the
   questions' digest. (codex's standalone digest/schema REQUEST_CHANGES also **Addressed**:
   schema now rejects null/blank/non-string source metadata.)

Dispositioned:
5. `identify_source.work_found` is substring containment (collapses into the citation
   check) → **N/A here / Spec 2** (scoring-contract revision); docstring now scopes it.
6. `parse_yes_no` matches the first Yes/No anywhere (gameable by negation) → **N/A here /
   Spec 2**; the first run is `retrieve_quote`-only so no `verify_source` number is
   reported; docstring scopes it and flags "harden before reporting those tasks".
7. Manifest lacked input paths → **Addressed**: `build_manifest` now records `inputs`
   (the committed run's manifest regenerated; questions byte-identical).
8. **Vatican encyclicals are `license: open` with 211 texts committed, but vatican.va
   texts carry © Libreria Editrice Vaticana** → **escalated to the humans / working
   group** (see Follow-up): a licensing call, not a code change; must be signed off
   before any public preprint.
Minor notes (prose-hedge anti-gaming limit, `AuditError` currently unused, audit
content-layer O(fingerprints×blob), `convert` not pruning stale standardized outputs,
`decodeURIComponent` throw in dev-only `serveRuns`) → recorded as Follow-up / Spec 2.

No `CONSULT_ERROR`s. Both reviewers independently re-ran the pipeline (impl iter-2/3 and
the PR review) and reproduced questions/scores/summary byte-identically.

## Lessons Learned

### What Went Well
- Deriving every converter and the scoring shapes from the **real data** (not docs)
  caught irregularities (BoM headings, `paragraph: null`, Talmud daf offsets) early.
- A budgeted **live smoke** before the full run caught the reasoning-model empty-output
  failure (gpt-oss needed `max_tokens` headroom) cheaply; resumable collect filled the
  stragglers without re-paying.
- Pinning the committed run through the viewer's own `loadRun` (`realRun.test.ts`) made
  "view the real run" a gate, not a promise.

### Challenges Encountered
- **Scoring (Phase 6) took 5 rounds**: expressing "correct retrieval" without being
  gameable by containment, and without false-negatives on repeated-correct or
  shape-mismatched citations. Resolved with a shape-selected extractor + single-
  candidate boundary equality.
- **No API keys** initially blocked the live run; resolved by the human supplying an
  out-of-repo env file sourced only in-shell for `collect` (never echoed/committed).

### What Would Be Done Differently
- Write run evidence to a **fresh path** from the start; committing to the same path a
  tutorial later re-runs caused the resume-skip / overwrite bugs codex caught in iter-2.
- Add the `usage`/`panel`/cost reporting in Phase 6's scoring from the outset rather
  than retrofitting in Phase 8.

### Methodology Improvements
- The strongest reviews **re-ran the pipeline** rather than reading it; SPIR benefits
  when the consult environment can execute, not just inspect. (Gemini can't see the
  worktree here, hence the `["codex","claude"]` panel.)

## Architecture Updates

- Routed: **cold** — created `codev/resources/arch.md` and seeded it from this round
  (subsystem map, two-tier texts + catalogue/`source.yaml`, interchange format, scoring
  contract, audit two-layer, viewer local-results, run-evidence layout), per the hot
  file's standing "seed arch.md after the first implementation round" note.
- Routed: **hot** — added one `arch-critical.md` fact: the copyright **audit gate**
  (committed artifacts must not derive from a restricted source; origin always, content
  when payloads are local). Updated the hot file's arch.md map to point at the new cold
  doc. Hot file now 9 facts (cap respected; no demotion needed).

## Lessons Learned Updates

- Routed: **cold** — created `codev/resources/lessons-learned.md` and seeded it with
  the reference lessons (strict exact-text `retrieve_quote` conflates refusal vs
  fabrication; reasoning models need output headroom or they return empty; reviewers
  that execute catch overwrite/fresh-clone bugs; fresh-path evidence).
- Routed: **hot** — added one `lessons-critical.md` lesson: never re-run
  `collect`/`score`/`generate` over committed run evidence (resume-skips cells /
  overwrites the proof) — write to a fresh `runs/<id>/`. Updated its cold-doc map. Hot
  file now 10 lessons (at cap; future additions must demote).

## Flaky Tests

No flaky tests encountered.

## Follow-up Items

- **⚠ Vatican encyclicals licensing (HUMAN / working-group decision, pre-preprint):**
  211 encyclical texts are committed under `license: open`, but vatican.va texts carry
  © Libreria Editrice Vaticana. Transparently declared and one line to flip to
  `restricted`, but it is the highest-consequence licensing call in the PR and needs
  explicit group sign-off before any FAccT/arXiv preprint. Escalated to the human
  alongside the merge decision.
- **Scoring hardening before reporting verify_source / identify_source (Spec 2):**
  `parse_yes_no` should require a leading verdict / handle negation; `identify_source`
  needs a work check independent of the citation; the citation anti-hedge should catch
  prose-form hedges. The first run avoids all three (it is `retrieve_quote`-only); the
  docstring now scopes the limits.
- **Minor code items:** remove unused `AuditError` (or wire it); have `catalogue`/`audit`
  use `_require_catalogue`; bound the audit content layer's O(fingerprints×blob) scan;
  prune stale `texts/standardized/` outputs on `convert` re-run; guard the dev-only
  `serveRuns` `decodeURIComponent` against malformed input. Add direct `config.py` /
  `providers.py` tests (the usage-normalization contract now has one via the collect fake).
- **Abstention-vs-hallucination metric (Spec 2):** `correct=0` conflates honest refusal
  (gpt-oss-20b mostly refuses) with fabrication (gemma/llama) — the most informative
  cut for Phase 1's "reject false premises" objective; the Phase-6 contract is gated so
  it belongs in Spec 2.
- **Relaxed "quote-contained" retrieval metric (Spec 2):** claude-haiku's 24%
  understates retrieval — 17 answers reproduce the verse but add a citation prefix and
  lose the strict "nothing else" rule (`token_f1` surfaces them).
- **Audit content layer** is inert in CI/clone (no local restricted payloads) — origin
  is the enforceable proxy there; a periodic local content audit when payloads are
  present is worthwhile.
- **Arabic corpora / more tasks** beyond English `retrieve_quote` (pipeline already
  supports the six templates).
- **Viewer** full adaptation (Spec 2, issue #2).
