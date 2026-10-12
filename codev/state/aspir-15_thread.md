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
routes final confirm to PR gate, pre-analyses the revert as a bounded 2nd rebaseline. Next: porch next.
