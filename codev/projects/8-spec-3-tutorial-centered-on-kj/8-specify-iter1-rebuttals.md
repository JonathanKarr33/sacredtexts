# Spec 8 — Iteration 1 rebuttals

Both reviewers returned **REQUEST_CHANGES / HIGH**, and both independently verified (in a
REPL / against the worktree) that the spec's empirical claims were correct. The findings were
substantive and I accepted nearly all of them. Below, each point with what changed.

## Codex

**C1 — Approach D under-covers the real QUL marks (U+06D6, U+06DA, U+06DF, U+06E2, U+06ED; some mid-word). ACCEPTED.**
Correct and important — a U+064B–U+065F-only list would have shipped a broken normalizer. I
enumerated the real committed `quran_uthmani_from_qul.json.json` and found marks well beyond
basic harakat: the whole U+06D6–U+06ED annotation block, editorial symbols U+06DE (rub-el-hizb)
and U+06E9 (sajdah), superscript alef U+0670, tatweel, and small waw/yeh (U+06E5/U+06E6) — many
occurring mid-word. Approach D now states the contract by **range + category**, derived from the
real data, and a Success Criterion + Test Scenario require a **full real-ayah fixture** carrying
annotation marks and a sajdah/rub-el-hizb symbol (not a toy string).

**C2 — Unsupported tool configs need defined fail-fast behavior. ACCEPTED.**
Added to Constraints, Approach A, and a Success Criterion: enabling the Anthropic web-search tool
on a non-`anthropic` provider, or an invalid tools value, raises `ConfigError` at load (before any
provider call). I also noted (per Claude's P5) that `config.py` does no unknown-key validation
today, so the setting must be genuinely parsed into `ModelSpec` and honored, not merely tolerated.

**C3 — CC-BY-NC attribution is not satisfied by the coarse `open` audit. ACCEPTED.**
Added a Constraint and a Success Criterion: the committed run's README preserves the Davidson
Talmud's source / attribution / licence / non-commercial notice. (Reinforced by Claude's P1 on the
broader web-search copyright surface.)

## Claude

**L1 — Live web-search answers may commit copyrighted translations to a public repo; the audit can't see it. ACCEPTED (the most important finding).**
This is a genuine new copyright surface and the project's #1 critical fact is the copyright gate.
Added **Solution Approach F** (documented clearance of committed search-on answers before commit;
original-language targets are public-domain so a copyrighted translation both scores 0 and is an
outlier; answers are *cleared*, not truncated — the explorer must show them), a **Critical** Open
Question (the clearance mechanism blocks committing the run), a Constraint, a Risk row, and Success
Criteria + Test Scenarios.

**L2 — `audit.py :: _norm` is Latin-only, so the content layer no-ops on the non-Latin run. ACCEPTED.**
Added **Approach G**: extend `audit._norm` for Arabic/Hebrew alongside `normalize()` (recommended,
optional), or state the limitation explicitly. Noted that for *this* committed run the content
layer is not the guard anyway (it is restricted-payload-gated; origin + the Approach-F clearance
are the enforceable protection), so "`audit` passes" no longer implies non-Latin content coverage.

**L3 — Web-search request charges (`usage.server_tool_use.web_search_requests`) uncaptured → misleading cost. ACCEPTED.**
Added **Approach H**: the committed run's panel stays **unpriced** (token-only, as the first run
did), so `score` emits no `cost_usd` and the understatement cannot arise; the spec forbids a priced
cost table for a search-enabled run while per-request charges are uncaptured. Capturing the request
count as additive provenance is left as a plan option.

**L4 — `correct = normalized` (whole-answer equality) may invert the search-on/off contrast. ACCEPTED.**
Sharpened the contrast Success Criterion and added a Risk row: named the hazard (a search-on answer
that appends attribution can score *lower* on the headline while retrieving better), pinned
`token_f1`/`exact` as the discriminating numbers, and stated explicitly that `_SUBMETRICS` is **not**
altered to "fix" it (requirement 4 forbids it).

**L5 — "no unknown-key error" criterion is unverifiable (config.py does no such validation). ACCEPTED.**
Restated the criterion to "the tool-use setting is genuinely parsed into `ModelSpec` and honored"
and added the separate fail-fast criterion (C2). Dropped the inaccurate "no unknown-key error"
phrasing.

**L6 — Approach A overwrites `panel.model`, which is documented as proof; also emit the raw API model string. ACCEPTED.**
Approach A now also emits the raw API model string under a viewer-ignored key (`api_model`), so the
`(provider, model)` carries the tools-aware standings identity while the true model id stays
recoverable from the artifact. Panel-secret-free criteria updated to list `api_model`.

**Smaller points.**
- *Pin `--tasks retrieve_quote`* and the `generate.py` imports-`normalize` blast radius: ACCEPTED —
  added an Assumption (Latin determinism safe because `_qid` hashes raw text; the tutorial pins
  `retrieve_quote`, which does not use the affected `work_texts`/`version_texts` pooling) and a
  **first-run question-set digest regression** Success Criterion + Test Scenario.
- *`MIN_WORDS_IDENTIFIABLE = 12` skews Arabic items long*: ACCEPTED — added as an Assumption so it
  is not later mistaken for a bug.
- *Structure*: Claude confirmed the spec matches the delivered `@cluesmith/codev` SPIR template
  (all eleven headings, in order) — no change needed.

## Net

No points rejected. Every REQUEST_CHANGES item was folded in; the two highest-impact additions are
the web-search copyright-clearance treatment (Approach F, Critical open question) and the
data-derived QUL mark set with a real-ayah fixture (Approach D). The scoring contract (`_SUBMETRICS`,
headline rules) and the viewer (zero code changes) remain untouched, as the baked requirements
demand.
