# Specification: Scoring contract — contains-exact discriminator (+ optional judge-on-disagreement pilot)

<!--
SPEC vs PLAN BOUNDARY:
This spec defines WHAT and WHY. The plan defines HOW and WHEN.
Keep implementation phases, file paths, code, and "first we will… then we will…"
out of the spec — those belong in codev/plans/15-*.md.
-->

## Problem Statement

The `retrieve_quote` headline accuracy does not just under-report search gains — **it inverts their
sign**. The headline rule is strict normalized equality (`correct = normalized` in `score.py`), so an
answer that contains the exact reference text but wraps it — in ornate Qur'anic brackets `﴿…﴾`, or
followed by an English provenance note ("*Note: I took this from a web page…*") — scores **0**,
indistinguishable from a hallucination or a refusal.

This matters because the benchmark's Phase-1 question is precisely *can models recognise and retrieve
sacred text?* Collapsing a verbatim-correct, honestly-annotated retrieval to the same 0 as a wrong
answer hides exactly the search capability the panel exists to measure — and worse, it makes search
look *harmful*.

**Evidence (committed runs; word-bounded normalized containment vs. the current `normalized` headline):**

- `runs/tutorial-2026-10-11` (400 `retrieve_quote` cells): **20** cells are `normalized=0` while the
  expected text *is contained* — all search-on (`+12` haiku-search, all Qur'an; `+8` opus-search, 7 Talmud
  + 1 Qur'an; `+0` for both no-tools models), i.e. **13 Qur'an + 7 Talmud**. Under containment the per-model
  headline moves: **haiku-search 40 % → 52 %** (vs. haiku no-tools 47 %) and **opus-search 66 % → 74 %** —
  so the strict contract currently reports *search as a 7-point regression* when it is in fact a 5-point gain.
- A further, **distinct** residue of near-misses — `normalized=0` with high `token_f1` but **not**
  contained — is where the model fetched a different Uthmani digitisation (orthographic variance the
  mark-stripper does not fold). Measured on the tutorial run: **25** such cells (of 29 high-`token_f1`
  misses, 4 are actually contained and belong to the set above; the not-contained residue is **25**).
  These are a fuzzier failure mode, out of reach of any deterministic containment rule.
- `runs/first-run-2026-10-11` (400 `retrieve_quote` cells, English): **1** wrapped-exact cell
  (`claude-haiku` 24 % → 25 %).

**Who is affected:** anyone reading a run's summary/leaderboard (the working group, the viewer), and
every future search-on vs. search-off comparison whose headline depends on this contract being honest.

## Current State

Scoring (`pipelines/sacredbench/score.py`) emits per answer: `exact`, `normalized`, `token_f1`, and a
per-task headline `correct`. For `retrieve_quote` / `complete_unit`, `correct = normalized`.
Normalisation folds unicode quotes/dashes, strips Arabic/Hebrew combining marks + Qur'anic annotation
symbols, folds alef-wasla/maqaf, case-folds, strips punctuation, collapses whitespace.

`_SUBMETRICS` (the per-task contract table) was **deliberately frozen** at Spec 8:
`retrieve_quote`/`complete_unit` → `(exact, normalized, token_f1)`; `identify_version` →
`(exact, normalized)`.

**What the reporting surfaces actually show today (verified against the code):**

- `summary_markdown()` → `_cell_str()` renders **only** `accuracy (n=N)` per task — there are **no**
  `exact`/`normalized`/`token_f1` columns in any committed `summary.md`. Submetrics live **only** inside
  `summary.json` cells.
- The viewer leaderboard (`LeaderboardPage.tsx`) renders **no** submetrics; the error explorer
  hard-codes exactly three (`localResults.ts:169` types the key as `"exact" | "normalized" | "token_f1"`;
  `QuestionList.tsx:85-87` renders three fixed `<Metric>` rows).
- **Mechanical trap:** `score_file()`'s per-cell accumulator is initialised with fixed keys
  (`{"n","correct","exact","normalized","token_f1"}`) and then read as `acc[sm]` for every
  `sm in _SUBMETRICS`. Adding `contains_reference` to `_SUBMETRICS` **alone** raises `KeyError`; the
  accumulator must learn the key too. `CODE_WALKTHROUGH.md:256` ("add a line to `_SUBMETRICS`") is
  misleading and must be corrected.

**Regression guards affected by any metrics-dict reshape:** both committed runs are
`retrieve_quote`-only (400 cells each), each guarded by a byte-for-byte re-score test
(`test_first_run_regression.py:32`, `test_tutorial_run.py`). **Additionally** `test_score.py:46` and
`test_score.py:231` assert whole `metrics` dicts by equality and will also break. Any change to the
per-answer metrics dict reshapes both `scores.jsonl` files and breaks all four guards until deliberately
rebaselined.

## Desired State

The scoring contract distinguishes *"the exact reference is present (possibly wrapped)"* from *"wrong /
absent"*, so real retrieval gains are visible and correctly-signed.

After this change:

- Every `retrieve_quote` / `complete_unit` answer reports a new deterministic **`contains_reference`**
  signal (0/1): does the normalized expected text appear, **word-bounded**, inside the normalized answer?
  It is a strict superset of `normalized` equality.
- The signal is carried in `scores.jsonl` (per answer) and aggregated into `summary.json` (per cell, via
  `_SUBMETRICS`). *(No new `summary.md`/viewer column is promised — see the headline decision below for how
  the gain becomes visible without one.)*
- **Recommended contract:** the headline `correct` for `retrieve_quote` / `complete_unit` becomes
  `normalized OR contains_reference`. This recovers the wrapped-exact cells **in the accuracy number that
  `summary.md` and the viewer leaderboard already render** — so the gain is visible at a glance with no new
  surface, and the search sign-inversion is corrected. The provenance-honesty tasks keep their exact
  current headlines.
- The two committed runs are **deliberately rebaselined once** with pre-registered, documented deltas
  (tutorial `+20`, first-run `+1`), all four affected guards updated in the same commit — never bypassed.
- The provenance-honesty tasks (`verify_source`, `cite_passage`, `identify_source`, `identify_version`)
  are **untouched**: their metrics dicts are byte-for-byte unchanged and containment never reaches them.
- *(Optional, deferred — see Decisions)* a judge-on-disagreement pilot exists only as a separate,
  off-by-default tool for the **25** not-contained near-miss cells, reported alongside — never replacing —
  the deterministic tiers.

## Success Criteria

- [ ] A deterministic `contains_reference` (0/1) submetric is computed for `retrieve_quote` and
      `complete_unit`: normalized expected text present in the normalized answer, **word-bounded** (reusing
      the existing `(?<!\w)…(?!\w)` style), so fragments can't match mid-word (`Jude 1:3` ≠ `Jude 1:30`).
- [ ] A **degenerate empty expected** (text whose normalisation is empty) yields `contains_reference = 0`,
      never 1 (guard against `re.escape("")` matching anywhere).
- [ ] `contains_reference` is added to `_SUBMETRICS` **and** to `score_file()`'s accumulator (no `KeyError`),
      and appears in both `scores.jsonl` (per answer) and `summary.json` (per cell).
- [ ] Headline (per the recommended contract): `correct = normalized OR contains_reference` for
      `retrieve_quote`/`complete_unit`; verified that on the tutorial run the recovered cells are exactly the
      20 identified (haiku-search 40 %→52 %, opus-search its measured delta) and first-run moves claude-haiku
      24 %→25 %.
- [ ] `contains_reference` is **never** emitted or consulted for `verify_source` / `cite_passage` /
      `identify_source` / `identify_version`; their metrics dicts are byte-for-byte identical to before.
- [ ] Latin-invariance holds: no Latin-script answer's `exact` or `token_f1` value changes, and
      `normalized` is unchanged (the change adds a key / adjusts only `correct` via an OR with containment).
- [ ] Both committed runs rebaselined **once**: new `scores.jsonl` + `summary.{json,md}` committed, all four
      affected guards (`test_first_run_regression.py`, `test_tutorial_run.py`, `test_score.py:46`,
      `test_score.py:231`) updated to the new baseline in the same commit, and the pre-registered deltas
      (`+20` / `+1`) documented in the review as the evidence the architect surfaces to the human at PR.
- [ ] `CODE_WALKTHROUGH.md` (§4/§5 and the "`_SUBMETRICS`" line ~256) and
      `runs/tutorial-2026-10-11/README.md` are updated to match the new contract.
- [ ] The copyright audit gate still passes (no committed artifact derives from a `restricted` source).
- [ ] *(If the judge pilot ships)* it is off by default, isolated, emits a separate report over the 25
      not-contained near-miss cells, carries a human-labelled validation sample, and never egresses
      `restricted`-source expected text to a third-party API; if it does not ship, the review records why.

## Constraints

- **Keep it simple (maintainer directive).** The deterministic contains-exact tier is the core deliverable;
  prefer shipping it **alone**. The recommended headline adoption needs **no** viewer/Markdown code change
  (the gain rides the existing accuracy column), which keeps the diff minimal.
- **The scores.jsonl reshape + regression-guard rebaseline must be deliberate and well-evidenced**, and done
  **once**. Rebaselining means: re-score the committed `answers.jsonl` in place, commit the new artifacts
  with the updated guards, and document the pre-registered delta. Never hand-edit `scores.jsonl`; never
  bypass a guard. The architect surfaces the contract change to the human at the PR gate.
- **Provenance anti-evasion is sacrosanct.** The Spec 1/8 design — "containment alone cannot game provenance
  honesty" — governs `verify_source` / `cite_passage` / `identify_source` / `identify_version`. The
  contains-exact tier applies **only** to `retrieve_quote` / `complete_unit`.
- **`_SUBMETRICS` unfreeze is the explicit purpose of this spec**; do it minimally and additively, and fix
  the accumulator `KeyError` trap at the same time.
- **`normalize()` pass order is fixed** (script-aware mark-stripping BEFORE punctuation; Latin byte-for-byte).
  `contains_reference` builds on `normalize()` without reordering or altering it.
- **Parallel work:** builder `aspir-11` changes `score.py` / `cli.py` and the regression-guard area for #11
  (panel.tools + viewer standings). Whoever merges second rebases. Keep this diff narrow and additive to
  minimise conflict; the recommended no-viewer-change path also avoids the viewer-standings surface #11 touches.

## Assumptions

- The committed `answers.jsonl` for both runs is authoritative and re-scorable (the guards assert this today).
  Rebaselining **re-scores from those committed answers in place** — not re-running `collect`/`generate` (per
  the "never re-run collect/score/generate over committed evidence" lesson; a deterministic re-score that adds
  a key is the sanctioned exception, not a null-overwrite).
- Word-bounded normalized containment faithfully operationalises "the exact reference is present." Expected
  `retrieve_quote` quotes are long enough that incidental containment is negligible (noted as a risk).
- Carrying `contains_reference` in `scores.jsonl`/`summary.json` and surfacing the recovered gain via the
  existing accuracy column requires **no viewer change** — verified the leaderboard/explorer render accuracy;
  adding a 4th explorer `<Metric>` row is an optional nice-to-have, not required.
- The judge pilot, if pursued, has a small human-labelled sample; without one it is not worth shipping.

## Decisions (resolved — were open in the first draft)

- **Containment definition:** word-bounded normalized substring (reusing `_bounded_equal`'s boundary style). **Decided.**
- **`complete_unit` coverage:** include it now, symmetric with `retrieve_quote` (zero cost on current evidence). **Decided.**
- **Judge pilot:** **out of scope for this PR.** Documented as optional/deferred; ship the deterministic tier alone. **Decided.**
- **Empty expected:** `contains_reference = 0`. **Decided.**
- **Headline `correct`:** recommended `normalized OR contains_reference` for the two text-retrieval tasks,
  implemented now so the rebaseline is done **once**; the human confirms (or reverts to diagnostic-only) at the
  PR gate. A reversal is a bounded, pre-analysed second rebaseline — see Open Questions.

## Solution Approaches

### Approach 1: `contains_reference` submetric, adopted into the headline — RECOMMENDED

Add one deterministic signal to `retrieve_quote` / `complete_unit`: `contains_reference = 1` iff the
normalized expected text occurs, word-bounded, in the normalized answer (with the empty-expected guard). Add
it to `_SUBMETRICS` **and** the `score_file` accumulator. Set `correct = normalized OR contains_reference`
for these two tasks only. Leave `normalize()` and all provenance tasks untouched. Rebaseline both runs and all
four affected guards once.

- **Pros:** Simplest change that fixes the stated problem *and* corrects the search sign-inversion. The gain
  surfaces in the existing accuracy column — **no viewer/Markdown change**. Deterministic, reproducible, no API
  cost. Catches all 21 evidenced cells (20 + 1). Single rebaseline. Minimal conflict surface with `aspir-11`.
- **Cons:** Does not recover the 25 orthographic near-miss cells (not contained → judge-pilot territory).
  A (small) theoretical containment-gaming surface on `retrieve_quote` — mitigated by word boundaries, by
  scoping to text-retrieval tasks only, and by the long expected quotes.
- **Risk/complexity:** Low. The only non-trivial step is the deliberate one-shot dual rebaseline + 4-guard
  update, which the constraints make explicit.

### Approach 2: encoding-variance folding (extend `normalize()`) — REJECTED

Extend `normalize()` to fold more orthographic variance (strip `﴿﴾` U+FD3E/FD3F, bidi/joiner/BOM
U+200C–U+200F / U+FEFF, fold more Uthmani hamza-seat variants) so near-miss digitisations collapse to an equal
`normalized`.

- **Pros:** Would fix the headline directly and recover some of the 25 near-miss cells.
- **Cons:** Reshapes `normalized` itself — the highest-risk surface. Spec 8 warns that deleting
  General-Punctuation formatting globally changes the Latin soft-hyphen path and breaks Latin-invariance;
  staying script-scoped is fiddly. "How much to fold" is open-ended and judgement-laden — the complexity the
  maintainer warned against; harder to evidence crisply.
- **Risk/complexity:** Medium-high. **Not pursued**; near-miss residue is better served by the judge pilot or
  a later, separately-scoped normalisation revision.

### Approach 3: LLM judge on the 25 not-contained near-miss cells — DEFERRED (optional)

A pilot running an LLM judge **only** on `normalized==0 ∧ token_f1 high ∧ ¬contains_reference` (the 25 cells),
asking "same scripture text, allowing orthographic variance?", validated against a human-labelled sample,
reported in a **separate** artifact alongside — never replacing — the deterministic tiers.

- **Pros:** The right tool for the fuzzy residue no deterministic rule captures; tiny cell set → cheap.
- **Cons:** Adds a provider dependency, cost, a validation obligation, a new report surface, **and** a
  copyright-egress concern — sending `restricted`-source (NABRE, TLG) expected text to a third-party judge API
  is egress the audit gate (committed-artifact-only) does not cover. Non-deterministic → can't be a headline.
- **Risk/complexity:** Medium. **Deferred / out of scope for this PR.** Ship Approach 1 alone; record the
  deferral in the review.

**Recommendation:** Approach 1. Approach 2 rejected (too risky/complex). Approach 3 deferred.

## Open Questions

**Critical (the one contract decision; routed to the human at the PR gate):**

- Confirm `correct = normalized OR contains_reference`, or revert to **diagnostic-only** (`correct = normalized`,
  `contains_reference` reported but not counted)? Implemented as adopted so the rebaseline is done once; the
  architect surfaces the change at PR. **A reversal to diagnostic-only is a bounded, pre-analysed second
  rebaseline** (accuracy returns to current values, `contains_reference` stays a column) — this cost is the
  reason to confirm at PR rather than leave it ambiguous.

**Important (shapes design):**

- Add a 4th `<Metric>` row (`contains`) to the viewer error explorer? Nice-to-have for per-answer diagnostics;
  not required for the headline gain to be visible. Recommended: optional, only if trivially cheap.

**Nice-to-know:**

- Whether a future, separately-scoped normalisation revision should pick up the `﴿﴾`/bidi folding from
  Approach 2 for the 25 near-miss cells.

## Test Scenarios

- **Wrapped-exact (happy path):** expected verse wrapped in `﴿…﴾` and/or followed by an English note →
  `contains_reference = 1`, `normalized = 0`, `correct = 1` (under the recommended contract). Assert over the 20
  real tutorial cells and the 1 first-run cell.
- **Strict match still 1:** answer equal to expected (post-normalisation) → `contains_reference = 1` and
  `normalized = 1` (containment ⊇ normalized equality).
- **Near-miss not contained:** different-digitisation answer (`normalized=0`, high `token_f1`, not a substring)
  → `contains_reference = 0`, `correct = 0`. Confirms the 25-cell residue is **not** silently rescued (judge-pilot
  territory).
- **Fragment / boundary:** expected `Jude 1:3` must not match inside `Jude 1:30`; a short expected token must not
  match mid-word.
- **Empty expected:** a text normalising to empty → `contains_reference = 0` (no accidental universal match).
- **Wrong / absent:** hallucinated or refusal answer → `contains_reference = 0`.
- **Latin invariance:** every Latin answer in `first-run-2026-10-11` keeps its `exact` / `normalized` /
  `token_f1`; only `contains_reference` is added and `correct` moves only on the single wrapped-exact cell.
- **Provenance tasks untouched:** `verify_source` / `cite_passage` / `identify_source` / `identify_version`
  metrics dicts byte-for-byte identical (no `contains_reference` key).
- **Accumulator:** `_SUBMETRICS` + accumulator both carry `contains_reference` — no `KeyError` in `score_file`.
- **Rebaseline reproducibility:** after rebaseline, re-scoring committed answers reproduces the new committed
  `scores.jsonl` byte-for-byte; `test_score.py:46`/`:231` whole-dict assertions updated and passing.
- **Pre-registered deltas:** tutorial overall/by-model accuracy moves exactly by the 20 cells; first-run by 1.
- **Audit gate:** copyright audit passes on the rebaselined artifacts.
- **(Judge pilot, if shipped):** runs only on the 25-cell residue; separate output file; deterministic tiers
  unchanged by its presence; validation sample present; no `restricted` expected-text egress.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Rebaseline silently corrupts committed evidence (nulls from a keyless re-score) | Low | High | Re-score **from committed answers** in place; additive change keeps all prior keys; byte-for-byte guards prove equivalence under the new baseline; review documents the exact pre-registered delta. |
| `_SUBMETRICS` add alone → `KeyError` in `score_file` | Medium | Medium | Spec names the fixed-key accumulator trap; plan updates accumulator + `_SUBMETRICS` together; a re-score test catches it. |
| Double rebaseline if headline decision flips after rebaseline | Medium | Medium | Decide now (adopt), rebaseline once; pre-analyse the revert so a PR-gate flip is a single bounded second re-score, not open-ended rework. |
| Containment enables gaming on `retrieve_quote` | Low | Medium | Word-boundary containment; scope to text-retrieval tasks only; long expected quotes make incidental containment negligible. |
| `normalize()` change breaks Latin-invariance (Approach 2) | — | High | Approach 2 not pursued; Approach 1 never touches `normalize()`. |
| Merge conflict with `aspir-11` on `score.py`/`cli.py`/guards | Medium | Low | Narrow, additive diff; no-viewer-change path avoids the standings surface #11 touches; second merger rebases. |
| Missed guard (e.g. `test_score.py` whole-dict asserts) left failing | Medium | Medium | Spec enumerates all four affected guards; plan updates them in the rebaseline commit. |
| Scope creep into the judge pilot | Medium | Medium | Pilot out of scope this PR; ship Approach 1 alone. |

## References

- Issue #15 — "Scoring contract: contains-exact discriminator / encoding-variance folding (+ judge-on-disagreement pilot)." From PR #9 review + maintainer discussion 2026-10-12.
- `codev/specs/8-spec-3-tutorial-centered-on-kj.md` — froze `_SUBMETRICS`; established script-aware `normalize()` and the committed-run regression guards.
- `codev/specs/1-phase1-benchmark-pipeline.md` — scoring contract and provenance anti-evasion ("containment alone cannot game provenance honesty").
- `pipelines/sacredbench/score.py` — `_SUBMETRICS`, `normalize()`, `strip_script_marks()`, `_bounded_equal()`, `score_answer()`, `score_file()` (fixed-key accumulator).
- `pipelines/tests/test_first_run_regression.py`, `pipelines/tests/test_tutorial_run.py`, `pipelines/tests/test_score.py` (`:46`, `:231` whole-dict asserts), `pipelines/tests/test_normalize_nonlatin.py` — the affected guards and non-Latin invariants.
- `apps/viewer/src/components/QuestionList.tsx` (`:85-87`), `apps/viewer/src/local/localResults.ts` (`:169`), `LeaderboardPage.tsx` — the reporting surfaces (hard-coded three metrics; accuracy-only leaderboard).
- `CODE_WALKTHROUGH.md` §4/§5 and the `_SUBMETRICS` line (~256) — document the contains-exact finding today; need updating (the "add a line to `_SUBMETRICS`" note is misleading re: the accumulator).
- `runs/first-run-2026-10-11/`, `runs/tutorial-2026-10-11/` (incl. its `README.md`) — committed evidence to rebaseline (both `retrieve_quote`-only, 400 cells each).
- Architect coordination note 2026-10-12 — simplicity directive, optional judge pilot, `aspir-11` parallel work, contract change surfaced to the human at PR.
