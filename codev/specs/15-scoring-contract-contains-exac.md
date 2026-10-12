# Specification: Scoring contract — contains-exact discriminator (+ optional judge-on-disagreement pilot)

<!--
SPEC vs PLAN BOUNDARY:
This spec defines WHAT and WHY. The plan defines HOW and WHEN.
Keep implementation phases, file paths, code, and "first we will… then we will…"
out of the spec — those belong in codev/plans/15-*.md.
-->

## Problem Statement

The `retrieve_quote` headline accuracy under-reports real search gains. The headline rule is
strict normalized equality (`correct = normalized` in `score.py`), so an answer that contains the
exact reference text but wraps it — in ornate Qur'anic brackets `﴿…﴾`, or followed by an English
provenance note ("*Note: I took this from a web page…*") — scores **0**, indistinguishable from a
hallucination or a refusal.

This matters because the benchmark's Phase-1 question is precisely *can models recognise and
retrieve sacred text?* A model that retrieved the verbatim verse and honestly annotated its source
is doing the task well; collapsing it to the same 0 as a wrong answer hides exactly the search
capability the panel exists to measure, and misleads anyone reading the leaderboard.

**Who is affected:** anyone reading a run's summary/leaderboard (the scoring contract's consumers —
the working group, the viewer), and future runs whose search-on vs search-off comparison depends on
the headline number being honest.

**Evidence (committed `runs/tutorial-2026-10-11`, 400 `retrieve_quote` cells):**

- **20 / 400** cells: `normalized == 0` **and** the normalized expected text *is contained* in the
  answer — all search-on, citation/bracket-wrapped verbatim Qur'an retrievals scored 0.
- A further **29 / 400** cells: `normalized == 0` with `token_f1 ≥ 0.8` — genuine near-misses where
  the model fetched a *different Uthmani digitisation* (orthographic variance the mark-stripper does
  not fold). These are **not** contained; they are a distinct, fuzzier failure mode.

## Current State

Scoring (`pipelines/sacredbench/score.py`) emits per answer: `exact`, `normalized`, `token_f1`, and
a per-task headline `correct`. For `retrieve_quote` / `complete_unit`, `correct = normalized`
(normalisation folds unicode quotes/dashes, strips Arabic/Hebrew combining marks + Qur'anic
annotation symbols, folds alef-wasla/maqaf, case-folds, strips punctuation, collapses whitespace).

`_SUBMETRICS` (the per-task contract table that drives the summary columns) was **deliberately
frozen** at Spec 8:

```
retrieve_quote:   (exact, normalized, token_f1)
complete_unit:    (exact, normalized, token_f1)
identify_version: (exact, normalized)
```

The two committed runs — `first-run-2026-10-11` and `tutorial-2026-10-11` — are **both
`retrieve_quote`-only (400 cells each)** and are each guarded by a **byte-for-byte re-score
regression test** (`test_first_run_regression.py`, `test_tutorial_run.py`): re-scoring the committed
`answers.jsonl` must reproduce the committed `scores.jsonl` exactly. These guards are what make the
Arabic/Hebrew normalisation reproducible; they also mean **any change to the per-answer metrics dict
reshapes both `scores.jsonl` files and breaks both guards until they are deliberately rebaselined.**

Current pain, concretely: in the tutorial run a search-on Haiku answer returning the exact verse
`قَالُوٓا۟ أَجِئْتَنَا …` followed by `*Note: I c…` scores `normalized=0, token_f1=0.3953, correct=0`
— the English note drags token_f1 down and the strict headline reports a complete miss for a
verbatim-correct retrieval.

## Desired State

The scoring contract distinguishes *"the exact reference is present (possibly wrapped)"* from
*"wrong / absent"*, so real retrieval gains are visible rather than hidden.

After this change:

- Every `retrieve_quote` / `complete_unit` answer reports a new deterministic **`contains_reference`**
  signal (0/1): does the normalized expected text appear, with word boundaries, inside the normalized
  answer?
- The summary table surfaces this tier alongside `exact` / `normalized` / `token_f1`, so a reader can
  see "strict match 55 %, exact-text-present 60 %" at a glance — the 20 wrapped-but-correct cells stop
  reading as zeroes.
- The two committed runs' `scores.jsonl` / `summary.{json,md}` are **deliberately rebaselined** with
  evidence (a documented before/after diff), and the re-score regression guards are updated to the new
  baseline in the same commit — never bypassed.
- The provenance-honesty tasks (`verify_source`, `cite_passage`, `identify_source`, `identify_version`)
  are **untouched**: containment never leaks into tasks whose whole point is anti-evasion.
- *(Optional, deferred by default)* a judge-on-disagreement pilot exists as a clearly separated,
  off-by-default tool for the 29 near-miss cells, reported **alongside — never replacing** — the
  deterministic tiers, and validated against a human-labelled sample before any number it produces is
  trusted.

## Success Criteria

- [ ] A deterministic `contains_reference` (0/1) submetric is computed for `retrieve_quote` and
      `complete_unit` answers: normalized expected text present in the normalized answer, **word-bounded**
      (reusing the existing boundary-aware equality style, not naive substring), so `Jude 1:3`-style
      fragments can't match inside a longer token.
- [ ] `contains_reference` is added to `_SUBMETRICS` for those two tasks and renders as a summary column.
- [ ] On the tutorial run, `contains_reference` is 1 for all **20** identified wrapped-but-exact cells and
      the aggregate `contains_reference` accuracy exceeds `normalized` accuracy by exactly those cells.
- [ ] `contains_reference` is **never** emitted or consulted for `verify_source` / `cite_passage` /
      `identify_source` / `identify_version`; their metrics dicts are byte-for-byte unchanged.
- [ ] Latin-invariance holds: no Latin-script answer's `normalized`, `exact`, or `token_f1` value changes
      (the contains-exact change is purely additive to the metrics dict).
- [ ] Both committed runs are rebaselined: new `scores.jsonl` + `summary.{json,md}` committed, the
      re-score regression guards updated to match, and the before/after accuracy delta documented in the
      review as the evidence the architect surfaces to the human at PR.
- [ ] The copyright audit gate still passes (no committed artifact derives from a `restricted` source).
- [ ] The headline-contract decision (does `correct` incorporate `contains_reference`, or does it stay a
      diagnostic-only column?) is resolved explicitly — not silently — at the PR gate.
- [ ] *(If the judge pilot ships)* it is off by default, isolated, emits a separate report, and carries a
      human-labelled validation sample; if it does not ship, the spec records why.

## Constraints

- **Keep it simple (maintainer directive).** The deterministic contains-exact tier is the core
  deliverable; the maintainer explicitly dislikes unnecessary complexity. Prefer shipping the
  deterministic tier **alone** over coupling it to the judge pilot.
- **The scores.jsonl reshape + regression-guard rebaseline must be deliberate and well-evidenced.** The
  architect will surface the contract change to the human at PR. Rebaselining means: regenerate the
  committed scores from committed answers, commit them together with the updated guard, and document the
  delta. Never edit `scores.jsonl` by hand and never bypass a guard to make it pass.
- **Provenance anti-evasion is sacros. **The Spec 1/8 design — "containment alone cannot game provenance
  honesty" — governs `verify_source` / `cite_passage` / `identify_source` / `identify_version`. The
  contains-exact tier applies **only** to the text-retrieval tasks (`retrieve_quote`, `complete_unit`).
- **`_SUBMETRICS` was frozen deliberately at Spec 8.** Unfreezing it is the explicit purpose of this spec;
  do so minimally and additively.
- **`normalize()` pass order is fixed:** script-aware mark-stripping BEFORE the punctuation pass; Latin
  byte-for-byte unchanged (pinned snapshot). `contains_reference` must build on `normalize()` without
  reordering or altering it.
- **Parallel work (coordination):** builder `aspir-11` is changing `score.py` / `cli.py` and the
  regression-guard area for issue #11 (panel.tools field + viewer standings key). Whoever merges second
  rebases. Keep this change narrow to minimise conflict surface.
- **`contains_reference` must be a pure additive key** in the metrics dict — adding it must not change any
  existing key's value, so the Latin-invariance and non-Latin-reproducibility properties hold under a
  fresh baseline.

## Assumptions

- The committed `answers.jsonl` for both runs is authoritative and re-scorable (the guards assert this
  today). Rebaselining re-scores *from those committed answers*, writing to the run directories in place —
  **not** re-running `collect`/`generate` (per the "never re-run collect/score/generate over committed
  evidence" lesson; this is a deterministic re-score of existing answers, the one sanctioned exception,
  and it adds a column rather than overwriting with nulls).
- Word-bounded normalized containment is a faithful operationalisation of "the exact reference is present."
  Expected quotes are long enough that incidental containment (a model dumping an unrelated long passage
  that happens to contain the full verse) is negligible for `retrieve_quote`; this is noted as a risk.
- The viewer renders whatever submetric columns the summary carries (it is generic over `_SUBMETRICS`
  output); adding a column is a zero-code-change for the viewer. To be verified, not assumed.
- The judge pilot, if pursued, has access to a (small) human-labelled sample for validation; without one,
  it is not worth shipping and is deferred.

## Solution Approaches

### Approach 1: `contains_reference` submetric (deterministic contains-exact discriminator) — RECOMMENDED

Add one deterministic signal to `retrieve_quote` / `complete_unit`: `contains_reference = 1` iff the
normalized expected text occurs, word-bounded, inside the normalized answer. Report it as a new
`_SUBMETRICS` column. Leave `normalize()` and every existing metric untouched; the change is purely
additive to the metrics dict. Rebaseline both committed runs and their guards deliberately.

The headline (`correct`) decision is kept **separate and explicit**: the conservative default is to keep
`correct = normalized` and treat `contains_reference` as a *reported diagnostic* (the gains become
*visible* without weakening the strict contract); the alternative is `correct = normalized OR
contains_reference` for these two tasks only (gains become *counted*, +20/400 ≈ +5pp on the tutorial
`retrieve_quote` headline). This decision is routed to the human at the PR gate (Critical open question),
with evidence prepared both ways. Containment is confined to the two text-retrieval tasks; provenance
tasks are untouched.

- **Pros:** Simplest change that fixes the stated problem. Deterministic, reproducible, no API calls, no
  cost. Additive → Latin-invariance trivially preserved. Catches all 20 evidenced cells. Minimal conflict
  surface with `aspir-11`. Matches the maintainer's "keep it simple / ship (a) alone" directive.
- **Cons:** Does not recover the 29 orthographic near-miss cells (not contained). Introduces a (small)
  theoretical containment-gaming surface for `retrieve_quote` if `correct` adopts it — mitigated by word
  boundaries, by scoping to text-retrieval tasks only, and by making the headline adoption a human
  decision rather than a default.
- **Risk/complexity:** Low. The only non-trivial step is the deliberate dual rebaseline + guard update,
  which the constraints make explicit.

### Approach 2: encoding-variance folding (extend `normalize()`)

Instead of (or in addition to) a new submetric, extend `normalize()` to fold more orthographic variance
(e.g. strip ornate parentheses `﴿﴾` U+FD3E/FD3F, bidi/joiner/BOM formatting characters U+200C–U+200F /
U+FEFF, and fold additional Uthmani hamza-seat variants), so more near-miss digitisations collapse to an
equal `normalized` value and score under the existing strict headline.

- **Pros:** Fixes the headline directly (no new contract column). Would recover some of the 29 near-miss
  cells as well as some wrapped cells.
- **Cons:** Reshapes `normalized` itself — the highest-risk surface in the scorer. The Spec 8 comments
  warn that deleting General-Punctuation formatting characters globally would change the Latin path
  (soft-hyphen folding) and break Latin-invariance; staying script-scoped is possible but fiddly. "How
  much to fold" is open-ended and judgement-laden — exactly the unnecessary complexity the maintainer
  warned against. Harder to evidence crisply (every `normalized` value is in play, not an additive column).
- **Risk/complexity:** Medium-high. **Not recommended** for this spec; the genuinely-ambiguous near-miss
  cases are better served by the judge pilot or a later, separately-scoped normalisation revision.

### Approach 3 (optional, separable): LLM judge on disagreement cells — DEFERRED by default

A pilot that runs an LLM judge **only** on the disagreement set (`normalized == 0` ∧ `token_f1` high — the
29 near-miss cells), asking "is this the same scripture text, allowing orthographic variance?", validated
against a human-labelled sample, and reported in a **separate** artifact alongside — never replacing — the
deterministic tiers.

- **Pros:** The right tool for the fuzzy near-miss residue that no deterministic rule cleanly captures.
  Scoped to a tiny cell set → cheap.
- **Cons:** Adds a provider dependency, a cost, a validation obligation, and a new report surface — scope
  and complexity the maintainer asked to avoid coupling to the core. Non-deterministic → can't be a headline.
- **Risk/complexity:** Medium. **Recommended disposition: spec it as optional, do not ship it in the same
  PR as Approach 1** unless it stays trivially cheap and fully isolated; prefer shipping the deterministic
  tier alone. Record the deferral decision in the review.

**Recommendation:** Approach 1 as the core deliverable. Approach 2 explored and rejected as too risky /
complex for the stated goal. Approach 3 deferred (optional) and kept out of the critical path.

## Open Questions

**Critical (blocks the contract / PR):**

- Does the headline `correct` for `retrieve_quote` / `complete_unit` adopt `contains_reference`
  (`normalized OR contains_reference`), or does `contains_reference` stay a reported-diagnostic column with
  `correct = normalized` unchanged? → **Routed to the human at the PR gate** (the architect surfaces the
  contract change). Evidence prepared both ways (+20/400 ≈ +5pp on the tutorial headline if adopted).

**Important (shapes design):**

- Exact definition of "contains": word-bounded normalized substring (recommended, reusing the existing
  `_bounded_equal` boundary style) vs. plain normalized substring. Boundaries resist fragment gaming at
  near-zero cost.
- Does `complete_unit` get `contains_reference` now, even though no committed run exercises it? (Keeps the
  two text-retrieval tasks symmetric; costs nothing on current evidence.) Recommended: yes.

**Nice-to-know:**

- Whether the viewer needs *any* change to display the new column, or renders it generically (expected: no
  change; to be verified).
- Whether a future, separately-scoped normalisation revision should pick up the `﴿﴾`/bidi folding from
  Approach 2 for the near-miss cells.

## Test Scenarios

- **Wrapped-exact (happy path):** expected verse wrapped in `﴿…﴾` and/or followed by an English note →
  `contains_reference = 1`, `normalized = 0` (headline per the PR decision). Assert over the 20 real
  tutorial cells.
- **Strict match still 1:** an answer equal to expected (post-normalisation) → `contains_reference = 1` and
  `normalized = 1` (containment is a superset of normalized equality).
- **Near-miss not contained:** a different-digitisation answer (`normalized = 0`, high `token_f1`, expected
  text not a substring) → `contains_reference = 0`. Assert it does **not** get silently rescued by
  containment (that's the judge pilot's territory, not this tier's).
- **Fragment / boundary:** expected `Jude 1:3` must not match inside `Jude 1:30`; a short expected token
  must not match mid-word → word-boundary guard holds.
- **Wrong / absent:** hallucinated or refusal answer → `contains_reference = 0`.
- **Latin invariance:** every Latin-script answer in `first-run-2026-10-11` keeps its exact/normalized/
  token_f1 values; only the additive `contains_reference` key appears.
- **Provenance tasks untouched:** `verify_source` / `cite_passage` / `identify_source` /
  `identify_version` metrics dicts are byte-for-byte identical to before (no `contains_reference` key).
- **Rebaseline reproducibility:** after rebaseline, re-scoring committed answers reproduces the new
  committed `scores.jsonl` byte-for-byte (the updated guards pass).
- **Audit gate:** the copyright audit still passes on the rebaselined artifacts.
- **(Judge pilot, if shipped):** runs only on the disagreement set; its output is a separate file;
  deterministic tiers in `scores.jsonl` / `summary` are unchanged by its presence; validation sample is
  present.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Rebaseline silently corrupts committed evidence (e.g. nulls from a keyless re-score) | Low | High | Re-score **from committed answers** only (no collect/generate); the additive change keeps all prior keys; byte-for-byte guard proves equivalence under the new baseline; review documents the exact delta. |
| Containment adopted into headline enables gaming (dump a long passage containing the verse) | Low | Medium | Word-boundary containment; scope to text-retrieval tasks only; headline adoption is a human PR decision, not a default — default keeps `correct = normalized`. |
| Change to `normalize()` breaks Latin-invariance (Approach 2) | — | High | Approach 2 not pursued; Approach 1 is additive and never touches `normalize()`. |
| Merge conflict with `aspir-11` on `score.py`/`cli.py`/guards | Medium | Low | Keep the diff narrow and additive; second merger rebases per the coordination note. |
| Scope creep into the judge pilot | Medium | Medium | Judge pilot is optional/deferred; ship Approach 1 alone unless the pilot stays trivially cheap and isolated. |
| Viewer can't render the new column | Low | Low | Verify the viewer renders `_SUBMETRICS` columns generically before relying on it; the viewer README is the reference. |

## References

- Issue #15 — "Scoring contract: contains-exact discriminator / encoding-variance folding (+ judge-on-disagreement pilot)." From PR #9 review + maintainer discussion 2026-10-12.
- `codev/specs/8-spec-3-tutorial-centered-on-kj.md` — froze `_SUBMETRICS`; established the script-aware `normalize()` and the committed-run regression guards.
- `codev/specs/1-phase1-benchmark-pipeline.md` — the scoring contract and the provenance anti-evasion design ("containment alone cannot game provenance honesty").
- `pipelines/sacredbench/score.py` — `_SUBMETRICS`, `normalize()`, `strip_script_marks()`, `_bounded_equal()`, `score_answer()`, `score_file()`.
- `pipelines/tests/test_first_run_regression.py`, `pipelines/tests/test_tutorial_run.py`, `pipelines/tests/test_normalize_nonlatin.py` — the byte-for-byte re-score guards and non-Latin scoring invariants.
- `runs/first-run-2026-10-11/`, `runs/tutorial-2026-10-11/` — the committed evidence to rebaseline (both `retrieve_quote`-only, 400 cells each).
- Architect coordination note 2026-10-12 — simplicity directive, optional judge pilot, `aspir-11` parallel work, contract change surfaced to human at PR.
