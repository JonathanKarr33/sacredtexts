# Specify iteration 1 — rebuttal

Both reviewers returned **REQUEST_CHANGES / HIGH**. They converged on the same
core set of issues; claude verified against the actual seed code, which made its
findings precise. I accepted essentially all of it — the findings were about
internal consistency, testability, and benchmark validity, not taste. Below, each
point with what changed.

## Accepted and fixed

**1. Representation contract contradicts itself** (codex #3, claude #1).
Approach 1 still described the pre-amendment layout (`texts/<corpus-id>/` +
`entries.jsonl`), contradicting Desired State's two-tier `raw/standardized/`; the
seed code implements neither — it writes interchange JSON directly.
→ Rewrote Approach 1 to the two-tier layout and stated there is **one** text
representation (the interchange flat format). Rewrote Approach 2 accordingly and
fixed the Interop constraint line.

**2. Round-trip criterion is vacuous** (codex #3, claude #2).
If standardized docs *are* interchange JSON, the exporter is a copy and the
round-trip test can't fail.
→ Redefined: the standardized tier may be **sharded** per unit; the exporter is an
**assembler** that merges a work's shards into the single group-shared interchange
document with defined ordering/dedup. The lossless round-trip is now **standardized
shards ↔ assembled document** on (`source` metadata + ordered `entries`) — a real
guarantee. Updated Desired State §2, the success criterion, and the test scenario.

**3. `identify_version` is degenerate** (codex #1, claude #3).
One version per work ⇒ answer inferable from the work; graded by substring
containment of `"NABRE"`.
→ Added a success criterion and Desired State requirement: **≥2 versions of at
least one work** (public-domain KJV/ASV — which also sidestep the NABRE licensing
problem and are committable). Generation **excludes shared-wording items** so the
answer is genuinely distinctive. This is the most scope-bearing change (new corpus
work) — flagged to the architect for the gate.

**4. Per-task scoring contract undefined** (codex #4, claude #4).
"Every answer gets exact/normalized/token-F1" is ill-defined for yes/no and
two-field answers, and `score.py` already diverges.
→ Expanded the task-types table into the authoritative scoring contract:
expected-answer schema + applicable metrics + headline `correct` per task. Noted
`score.py` must match it (it already gives the three similarity metrics only to
`retrieve_quote`/`complete_unit`).

**5. Containment grading is gameable** (claude #5).
A multi-candidate hedge scores correct, inverting the provenance-honesty property.
→ `correct` for `cite_passage`/`identify_source` now requires a **single extracted
candidate**; multi-candidate answers score 0. Added a test scenario.

**6. List-valued tradition aggregation undefined** (codex #5, claude #6).
→ Stated the rule in Desired State §6: an observation counts **once per listed
tradition**, plus an overall row counting each observation once. Added to the
summary criterion and a test scenario.

**7. Committed artifacts leak copyrighted text + provider-submission silence**
(codex #8, claude #7).
→ Extended the copyright-gate constraint to **derived artifacts**
(questions/answers/scores/smoke) — NABRE text redacted/hashed; committed live
evidence uses public-domain/synthetic corpora. Added provider-submission as an
Important Open Question and a Risks row.

**8. `.gitignore` can't reach `source.yaml`; stale `texts/README.md`** (claude #8).
→ Named the `.gitignore` restructure and `README` update as explicit requirements
in Desired State §1 and the success criterion.

**9. Analysis/visualisation unbounded** (codex #9, claude #9).
→ Scoped visualisation (matplotlib figures, the SPA) explicitly to a **follow-on
spec**, consistent with the viewer adaptation already being follow-on. This spec's
analysis deliverable is the summary table. Added an end-to-end aggregation test
(with a missing/failed cell) to the test criterion and scenarios.

**10. Quran acquisition is an unmitigated SPOF** (claude #10).
→ Added a Risks row and softened the Assumption: openly-licensed public source
(Tanzil / quran.com JSON) is the committable fallback.

**11. Determinism / collect-is-evidence** (codex #6, claude #11).
→ Generation criterion now requires stable content-derived IDs + ordering,
persisted seed/config/input-hash, and a resume-refused-against-changed-questions
guard. `collect`'s ≥3-model panel is marked as satisfied by committed run
artifacts, not CI.

**12. Generation policy underspecified** (codex #2).
→ Added a generation-policy paragraph (per-task quotas, negative ratio, tradition
balancing, overlapping-negative exclusion). Fine mechanics (completion-prefix
selection) are deliberately left to the plan as implementation detail, not spec.

**Fresh-checkout demo** (codex #7).
→ Resolved by the public-domain-corpora decision: the demo criterion now runs on
**committed** public-domain/synthetic corpora, so a fresh checkout works without
any gitignored NABRE data.

## Disagreements

None of substance. Two scoping notes rather than disagreements:
- Completion-prefix selection and other fine generation mechanics are left to the
  plan (HOW), not the spec (WHAT/WHY).
- Items touching already-shipped code (the scoring contract, `identify_version`,
  the corpus) are incorporated because they are genuine validity problems, but the
  two most scope-bearing (≥2 versions / new corpus work, and the round-trip
  redefinition) are surfaced to the architect at the `spec-approval` gate — that
  human review is the right place to accept/reject a change that reopens shipped
  work, rather than deciding it autonomously here.
