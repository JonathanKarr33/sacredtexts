# aspir-15 thread — Scoring contract: contains-exact discriminator (+ optional judge pilot)

Issue #15. ASPIR (strict). Builder worktree `.builders/aspir-15`, branch `builder/aspir-15`.

## 2026-10-12 — Specify phase

**Grounded the spec in real evidence before drafting** (lessons-critical: derive from real data).
Re-scored committed `runs/tutorial-2026-10-11` (400 retrieve_quote cells):

- **20/400**: `normalized==0` AND normalized expected text IS contained in answer (ornate `﴿﴾`
  brackets + trailing English notes). These are the contains-exact target — all search-on, verbatim.
- **29/400**: `normalized==0` AND `token_f1>=0.8`, NOT contained — genuine Uthmani orthographic
  near-miss (different digitisation). Distinct, fuzzier failure → the judge-pilot target, not the
  contains-exact target.

**Key structural facts:** both committed runs (`first-run`, `tutorial`) are retrieve_quote-ONLY
(400 each), each byte-for-byte re-score-guarded (`test_first_run_regression.py`,
`test_tutorial_run.py`). So adding any metrics-dict key reshapes BOTH scores.jsonl → BOTH guards
must be deliberately rebaselined. That's the "deliberate, well-evidenced reshape" the issue +
architect flag; architect surfaces the contract change to the human at PR.

**Spec decisions (recommended, not yet plan):**
- Approach 1 (RECOMMENDED, core): add `contains_reference` (0/1) submetric to retrieve_quote +
  complete_unit — word-bounded normalized containment, purely ADDITIVE (Latin-invariance trivially
  held). Scope containment to text-retrieval tasks ONLY; provenance tasks (verify/cite/identify*)
  untouched (Spec 1/8 anti-evasion intact).
- Headline `correct` adoption (`normalized OR contains_reference` vs diagnostic-only) = CRITICAL
  open question routed to human at PR gate. Default conservative = keep `correct=normalized`.
- Approach 2 (encoding-variance folding of `normalize()`) explored + REJECTED: reshapes `normalized`
  itself, risks Latin soft-hyphen contract, open-ended "how much to fold" = the complexity the
  maintainer warned against.
- Approach 3 (LLM judge on the 29 disagreement cells) = OPTIONAL/DEFERRED; keep out of critical path,
  ship Approach 1 alone unless trivially cheap + isolated.

**Coordination:** aspir-11 working #11 (panel.tools + viewer standings key) touches
score.py/cli.py/guards in parallel — second merger rebases. Keeping diff narrow + additive.

Architect ack sent (held, main busy). Signalled SPEC_DRAFTED; porch ran 2-way consult (codex+claude).

### Consult round 1 — both REQUEST_CHANGES (HIGH), strongly convergent. Folded all in (iter2):
- **Reporting surface over-claimed** (both, code-verified by me): `summary_markdown`/`_cell_str` show
  ONLY accuracy — no submetric columns; viewer `QuestionList.tsx:85-87` + `localResults.ts:169`
  hardcode exact/normalized/token_f1. FIX: don't promise a new column. Key reconciliation →
  **recommend headline adoption `correct = normalized OR contains_reference`**, so the recovered gain
  rides the EXISTING accuracy column (visible in summary.md + leaderboard) with NO viewer change. Keeps
  it simple AND avoids a double rebaseline.
- **Sign-inversion** (claude): haiku-search 40%→52% vs haiku 47% — strict contract currently reports
  search as a 7pt REGRESSION when it's a 5pt gain. Much sharper than "+5pp". Now the headline of the
  Problem Statement.
- **20/29 overlap by 4** (claude): not-contained near-miss residue is **25**, not 29. Fixed; judge-pilot
  cell set = `normalized==0 ∧ token_f1 high ∧ ¬contains_reference`.
- **first-run delta** (both): +1 cell (claude-haiku 24%→25%). Pre-registered both deltas (+20/+1).
- **KeyError trap** (claude): `score_file` accumulator has FIXED keys; adding to `_SUBMETRICS` alone
  → KeyError. Must extend accumulator too. CODE_WALKTHROUGH:256 misleading. Flagged as constraint.
- **More guards** (claude): `test_score.py:46`/`:231` assert whole metrics dicts → will break too (not
  just the 2 run guards). All FOUR guards enumerated as rebaseline scope.
- **Empty-expected** (both): `re.escape("")` matches anywhere → contains_reference=0 guard. Decided.
- **Convert open→decided** (codex): word-bounded=YES, complete_unit=YES, judge=OUT-of-scope. New
  "Decisions (resolved)" section.
- **Judge egress** (claude): sending restricted-source expected text to 3rd-party judge API = egress the
  audit gate doesn't cover. One line in Approach 3 + success criteria.
- Docs to update: CODE_WALKTHROUGH §4/§5 + line 256, runs/tutorial README. Added to refs + criteria.

Headline recommendation (adopt) is the architect's "contract change surfaced to human at PR" — spec
routes final confirm to PR gate, pre-analyses the revert as a bounded 2nd rebaseline.

Spec phase done — rebuttal accepted, porch advanced to PLAN.

## 2026-10-12 — Plan phase

Drafted plan. **2 phases** (deliberately, not 3):
- **Phase 1: Contains-exact scoring contract + one-shot rebaseline** (ONE atomic green commit). Scorer
  change (contains_reference submetric + accumulator + headline `correct = normalized OR
  contains_reference` + empty-guard, word-bounded) + test_score.py updates/new cases + regenerate BOTH
  committed runs' scores.jsonl/summary.{json,md} + green all 4 guards. Rationale: the metrics-dict change
  makes committed scores.jsonl non-reproducible → byte guards go red until evidence regenerated, so code
  + evidence + guards are intrinsically one unit. Splitting diagnostic-from-headline would force TWO
  rebaselines (spec/reviewers forbade). Pre-registered deltas +20 tutorial / +1 first-run.
- **Phase 2: Documentation sync** — CODE_WALKTHROUGH §4/§5 + line 246/256 (_SUBMETRICS + accumulator
  note), runs/tutorial README. Keep test_code_walkthrough.py anchors green.

Key impl risks flagged: summary.json regen must preserve panel/usage (only accuracy + generated_at move);
_SUBMETRICS-without-accumulator KeyError; test_code_walkthrough line anchors.
Checks pass (plan_exists, has_phases_json, min_two_phases=2). Signalled PLAN_DRAFTED; porch ran consult.

### Plan consult round 1 — both REQUEST_CHANGES (HIGH); BOTH verified deltas correct (+20/+1). Folded (iter2):
- **9 affected guards, not 4** (claude, verified): 5 viewer vitest suites pin committed-run numbers as
  fixtures (tutorialRun.test.ts:117-119,148; ExplorerPage:152+correct-filter; LeaderboardPage:214
  "72%(n=25)"→76%; recheck StandingsPage/realRun). `.codev/checks/test.sh` maps runs/→pipelines lane
  ONLY → my gate stays green while main breaks. FIX: Phase 1 edits apps/viewer/ in same commit (forces
  vitest) + updates all fixtures. Retracted "no viewer change" claim; sent architect merge-coord update.
- **first-run summary NOT CLI-regenerable** (both, verified): first-run answers have NO panel_fingerprint
  → `score --config` fail-fasts (cli.py:325-331); keyless score nulls panel (the scar); models.yaml
  gitignored. FIX: explicit procedure — score_file() with panel VERBATIM from committed summary.json +
  roster from questions.jsonl; NEVER YAML (would stamp [no-tools] → collide tutorial haiku standings key +
  stale FIRST_RUN_KEY). Recorded in plan + review.
- **"only accuracy moves" wrong**: summary.json also gains contains_reference submetric + (first-run)
  api_model. FIX: pre-registered honest-diff section per file.
- **test_score.py:231 is identify_version** (verified) — must NOT get contains_reference; only :46
  (retrieve_quote dict) changes. Fixed (inherited the spec's error).
- **acc[sm]+= path doesn't exist** (verified): score_file updates explicit keys; acc[sm] only READ. FIX:
  explicit acc["contains_reference"]+= + seed.
- **Mandatory non-circular delta validation** (both): byte guards circular post-rebaseline → promoted to a
  REQUIRED pinned test (exact 21-cell flip set / per-cell values).
- **_bounded_equal ALREADY is word-bounded containment** (claude): contains_reference =
  int(bool(normalize(target)) and _bounded_equal(answer,target)). Reuse, don't duplicate regex. Simpler.
- **Docs expanded**: + score.py module docstring (Phase 1), + CODE_WALKTHROUGH never-re-score bullet
  (300-304) amend, + first-run README (stale 24% AND factually-wrong "17 answers" — only 1/18 high-F1
  misses contained; rest genuine paraphrase). "five other tasks"→four.

### Plan consult round 2 — codex REQUEST_CHANGES (docs+rigor), claude COMMENT (all verified correct). Folded (iter3):
- **TUTORIAL.md:94-103** stale old headline/"misleading" framing → Phase 2 (verified).
- **lessons-critical/lessons-learned** "never re-score" contradicts sanctioned rebaseline → Phase 2 adds
  sanctioned-exception caveat; headline-reshape governance line stays post-PR MAINTAIN (not final till PR).
- **Validation must be EXACT 21 pairs + pre/post projection** (aggregates can't prove "nothing moved") →
  strengthened mandatory test.
- **Summary writer pinned**: json.dump(indent=1)+newline, summary_markdown, pass question_set_digest (verified cli.py).
- **Re-derive ALL ~12 score.py:N pointers in CODE_WALKTHROUGH** (Phase 1 shifts them; test only in-range → silent stale).
- **Insert position pinned**: contains_reference after token_f1 in _SUBMETRICS, before correct in score_answer dict (append-only).
- **StandingsPage.test.tsx:134** "24%(n=100)" first-run → named (6th viewer pin).
- **FACTUAL FIX ("all Qur'an")**: recomputed — 20 flips = haiku-search 12 (all Qur'an) + opus-search 8
  (7 Talmud + 1 Qur'an) = **13 Qur'an + 7 Talmud**. Corrected BOTH spec Problem Statement + plan; tutorial
  README "Talmud 8 of 34"→7; first-run high-F1 misses ~17(≥0.9)/~23(≥0.8), exactly 1 contained holds.
- claude confirmed viewer SOURCE needs no change (ScoreMetrics keys optional, metricOrNull key-typed).

### Cross-builder: architect relayed aspir-11 panel-shape change (panel.model→raw, +panel.tools, -api_model);
aspir-11 Phase 2 migrates TUTORIAL summary.json to it (NOT first-run). Folded as risk row: scores.jsonl +
deltas are panel-shape-independent; tutorial summary.json panel block is merge-order-dependent (rebase onto
whichever score.py is on main; viewer standings keys on panel.tools if 11 first); first-run untouched →
verbatim panel + api_model pre-registration hold. Acked architect.

### Plan consult round 3 — codex REQUEST_CHANGES (3 narrow), claude COMMENT (verified correct). Folded (iter4):
- **claude MUST-FIX**: my iter2 "Talmud 8 of 34 → 7" was WRONG — verified opus-search Judaism
  n=34/headline=1/contains=8/flips=7, so "8 of 34" is a CONTAINS count (1+7), correct as written. DROPPED;
  plan now says do NOT touch the "8 of 34"/"24 of 33" contains counts. (Nearly landed a factual error.)
- **codex: durable oracle** — pre/post projection needs a frozen source post-rebaseline. Added: new test
  pipelines/tests/test_contains_reference_rebaseline.py pins SHA-256 of pre-change
  (mid,qid)→(exact,normalized,token_f1) projection (from git show HEAD) + exact 21-pair flip set.
- **codex: lessons-learned IN-PR** — lessons-learned:34 "don't reshape headline" + :40-41 "deferred" directly
  contradicted; post-PR MAINTAIN would merge self-contradictory tree. Now updated in THIS PR, decision-
  consistent, whole set moves together (adopt or revert). Removed MAINTAIN deferral.
- **codex: enumerate 9 guards + name validation file** — done (4 pipeline incl. new test + 5 viewer).
- **claude gaps**: tutorial README headline table :33-38 + framing :30-31 (named; cells pre-registered);
  CODE_WALKTHROUGH:305-308 + TUTORIAL:29 named; first-run summary.json gains BOTH generated_at AND api_model
  (no generated_at today); summary.md row-order changes (pre-registered); pointer drift fixed (tutorialRun
  :115 not :117, Leaderboard :215, ExplorerPage 5 "24" sites, CODE_WALKTHROUGH score.py set has no :176).

claude re-verified deltas/approach/mechanics/9-guard surface/aspir-11 analysis all correct. Next: porch next.
