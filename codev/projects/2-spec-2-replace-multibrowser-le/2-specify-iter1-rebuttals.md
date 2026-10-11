# Spec 2 — Specify iteration 1 rebuttal

Both reviewers returned **REQUEST_CHANGES (HIGH confidence)**. The feedback was
accurate and convergent — claude verified every factual claim against the worktree, and
codex independently caught the same two blockers. I accepted essentially all of it and
revised the spec (commit `[Spec 2] Specification with multi-agent review`). Point by
point:

## Blocking — accepted and fixed

### 1. Issue #2 requirement 6 (cross-run aggregate "current standings") was dropped
**(codex: "critical scope undecided"; claude: blocking)** — **Accepted.** An addendum
to issue #2 landed from the architect mid-specify and I had not yet folded it in. Added
requirement 6 **verbatim** to Constraints, plus the architect's binding clarification
that identity keys on `panel.provider`+`panel.model` (not the free-text `model_id`).
Added a dedicated Success Criterion, a Desired-State bullet, an Approaches "Aggregate
data shape" paragraph (loads *every* run's `summary.json`+`panel`; selects each
`(provider,model)` key's row from the latest run containing it), and two aggregate Test
Scenarios (subset re-benchmark; renamed-id dedupe). Fixed the References line that
wrongly implied the requirements were already copied verbatim — it now covers 1–6.

### 2. Per-question "missing cell" not derivable from summary+scores+answers
**(both, blocking)** — **Accepted; the reviewers also pointed to the fix.** Verified in
`score.py`: score/answer rows exist only for answered questions, and the cell `missing`
is a count, not identities. `questions.jsonl` (the roster) ships with every run and,
with the run's model panel, yields the exact set of un-answered (model, question) pairs.
The spec now names `questions.jsonl` as a fourth loaded artifact, states that
`joinResults` must iterate the roster (not the scores rows), and updates the dependent
items: the "adding a run needs summary+scores+answers" criterion now includes
`questions.jsonl`; the missing-artifact error condition lists all four; a `missing > 0`
fixture demonstrates the path (the committed run is all-`missing: 0`).

## Non-blocking — accepted

### 3. Per-task metric availability (codex + claude #5)
**Accepted.** Verified `_SUBMETRICS` in `score.py`: `retrieve_quote`/`complete_unit` →
`exact,normalized,token_f1`; `identify_version` → `exact,normalized`; other tasks →
none; `_overall` cells carry no sub-metrics. The "three metrics per failure" criterion
now reads "the per-metric scores the task emits … 'n/a' where a task emits none," and an
Assumption records the per-task table plus the `_overall` caveat.

### 4. Purge criterion self-contradictory ("no tradition/scenario identifiers")
**(both)** — **Accepted.** `src/local/sample.ts` legitimately carries
`tradition: ["Protestant Christian"]` as benchmark data. The criterion now forbids
concrete *multibrowser* patterns instead: no `from '…/traditions/'` imports in source,
and no `JLS-\d{3}` / `BZ-\d{3}` / `al-jalīs` in `dist/assets` — mirroring what
`deploy.test.ts` already asserts — and explicitly notes tradition **names** in run data
are fine.

### 5. `#86` numbered-shade built-CSS probe lives in `deploy.test.ts` (claude)
**Accepted.** This is the only guard against the invisible-text scar and sits inside the
file being reworked. The spec now makes its survival explicit: Current State flags it,
the deploy decision and Approaches sub-decision require it be kept/relocated, a Success
Criterion names it, and it is called out in the Risks table (probability/impact raised).

### 6. Settle the undecided Critical/Important open questions (codex)
**Accepted** — ASPIR is autonomous (no human spec gate), so I promoted the
recommendations to **decisions** in a new "Settled design decisions" block in
Constraints: run discovery = dev directory-listing (Approach 1); ordering = directory
mtime with id tiebreak; deploy = plain static SPA host with `deploy.test.ts` reworked
(drop tradition-baking/raw-tier/review-proxy, keep SPA-fallback smoke + the `#86`
probe). Leaderboard equal-score ties break on `model_id` ascending. Open Questions now
holds only genuinely nice-to-know items (panel display, metric presentation, same-mtime
cosmetics).

### 7. Path-confinement hardening (codex)
**Accepted.** The lexical `startsWith` check does not stop a symlink escape and can
throw on bad percent-encoding. The spec now requires canonical-path (`realpath`)
containment **plus** symlink rejection, with try/caught URL decoding, and adds a
security Test Scenario (traversal + symlink-escape + malformed-encoding) and a Risks
row.

### 8. Resilient run selector on a malformed/incomplete run (codex)
**Accepted.** The error-conditions scenarios now require that a bad selected run surface
a localized error (which run, which line) **without** removing the run selector or other
runs from use.

### 9. `/local-results` doc staleness: `TUTORIAL.md`, `arch.md` (claude)
**Accepted.** The doc-update criterion now covers `apps/viewer/README.md`,
`TUTORIAL.md`, and arch.md's "Viewer local results" section (update to the new pages, or
keep `/local-results` as a redirect).

### 10. Dependency pruning left ambiguous (claude)
**Accepted; declared in scope.** The human said "gone, not merely hidden," so a Success
Criterion now requires pruning deps used only by the removed surface (candidates:
`js-yaml`, `zod`, TanStack Query persisters, and — per the deploy decision —
`hono`/`@hono/node-server`), verified by no kept source importing them and a green
build. `hono`'s fate is tied explicitly to the static-host decision.

## Disagreements

None substantive. The only softening: codex floated "narrow 'missing' to aggregate-only
display" as an alternative to loading `questions.jsonl`. I chose the per-question path
(load the roster) because the requirement explicitly asks to "list every question with
pass/fail" and filter by the missing-cell failure mode at question granularity, and the
roster is already present in every run — so the richer behavior costs nothing in data
availability.
