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

Architect ack sent (held, main busy). Next: signal SPEC_DRAFTED, porch runs 3-way consult.
