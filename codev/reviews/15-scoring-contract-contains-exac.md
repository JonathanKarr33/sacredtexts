# Review: Scoring contract — containment headline, refused outcome + coverage, named graders

Spec/issue #15. Protocol ASPIR (strict), builder `aspir-15`, branch `builder/aspir-15`. Five
implement phases shipped as git commits inside **one** PR, per two deliberate, well-evidenced
rebaselines of the committed run data.

## Summary

The strict `retrieve_quote` headline (`normalize(answer) == normalize(expected)`, "the quote and
nothing else") hid real search-retrieval gains and conflated honest refusals with fabrications. Per
the binding maintainer comment on #15 (six decisions), this project revised the scoring contract:

1. **Containment is the headline** for the text-retrieval tasks — `correct = normalized OR
   contains_reference` (a verbatim quote wrapped in a citation counts). Confined to
   `retrieve_quote`/`complete_unit`; provenance anti-evasion intact.
2. **Refusal is an OUTCOME, not a grader** — every answered cell is `correct`/`incorrect`/`refused`;
   a deterministic decline short-circuits the headline and is excluded from accuracy.
3. **Named, selectable graders** (`strict`, `containment`) via `score --evaluator`, with a
   separate-pass/paid grader expressible (issue #21) but never default.
4. **Accuracy with coverage** — `accuracy = correct/(correct+incorrect)`, `coverage =
   (correct+incorrect)/n`, reported together everywhere so a high-accuracy/low-coverage model isn't
   misread (opus 100%/cov66% vs opus-search 97%/cov76%).
5. The **viewer** surfaces all of it: four outcome categories + a refused filter, a coverage column
   of equal weight, and a search-on/off contrast — no README needed.
6. Two **deliberate, oracle-witnessed rebaselines** of the committed runs; one PR.

## Spec Compliance

- [x] AC: `correct = normalized OR contains_reference` headline for text-retrieval (Phase 1).
- [x] AC: named graders + `score --evaluator` (default set, unknown fail-fast, paid-never-default,
      separate-pass expressible); provable no-op refactor (Phase 2).
- [x] AC: `outcome ∈ {correct, incorrect, refused}` on every answered cell; deterministic matcher =
      leading decline cue AND reference-not-delivered; `verify_source` declines refused (Phase 3).
- [x] AC: summary emits per-model/tradition correct/incorrect/refused + coverage + refused_rate;
      accuracy excludes refusals (`null` if all refused); submetric averages over graded cells only.
- [x] AC: refused cells keep their submetrics ⇒ the phase-1 projection SHA oracle passes **unchanged**
      across both rebaselines; pre-registered refused set (268 cells) pinned by per-model count + SHA.
- [x] AC: viewer distinguishes correct/incorrect/refused/missing + a refused filter; coverage column;
      search-on/off contrast on a paired run with a no-pair fallback (Phase 4).
- [x] AC: docs match the implemented contract — the "add an evaluator" recipe, TUTORIAL grader +
      accuracy/coverage sentences, run READMEs, governance docs; `test_code_walkthrough` green (Phase 5).
- [~] Provenance hardening (`verify_source` negation-evasion on a NON-declining answer) — **deferred,
      filed as issue #23** (paper gate), out of #15's scope; no committed evidence exercises it.

## Deviations from Plan

- **Viewer committed-run fixtures were updated in Phase 3, not Phase 4.** The plan deferred all viewer
  work to Phase 4, but `.codev/checks/test.sh` diffs the whole branch vs main and Phase 1 touched
  `apps/viewer/`, so the viewer vitest lane runs on every `porch done`. The Phase-3 rebaseline moved
  the leaderboard ranking/numbers, so the committed-run-gate fixtures had to be refreshed in the same
  commit (the Phase-1 lesson: rebaseline + fixtures ship together). Viewer *feature* work stayed in
  Phase 4. Flagged to and acknowledged by the architect.
- **Phase 3 and Phase 5 force-advanced at porch's `max_iterations` (3) ceiling.** Phase 3's residual
  codex REQUEST_CHANGES was the deferred verify_source gap (→ #23); Phase 5's were resolved doc fixes.
  claude APPROVE/COMMENT throughout both. Not a bypass — porch's designed safety mechanism, recorded
  with the last rebuttal as the disposition.
- **A third, in-phase refinement of the refused set.** The Phase-3 consult surfaced two genuine "I
  can neither provide … nor" llama declines the first hand survey missed; the cue was added and the
  set re-pinned (first-run 139→141) *within* the open Phase-3 rebaseline — a recall improvement, not a
  separate rebaseline.

## Consultation Feedback (dispositions)

Per-phase 2-way consults (codex + claude; Gemini can't see the worktree). Full outputs + rebuttals in
`codev/projects/15-scoring-contract-contains-exac/`.

- **Specify / Plan** (pre-implement, SPIR→ASPIR re-scope): both REQUEST_CHANGES, strongly convergent —
  surfaced the 9-guard viewer-fixture surface, the first-run non-CLI-regenerable summary, the
  mandatory non-circular delta oracle, and (critically) that refusals are ~100–180 cells, not ~21,
  which re-inverts the search sign and makes **coverage** a required second axis.
- **Phase 1** (containment): both COMMENT. Caught the 1/21 Ketubot hedge (`4ad4392645da`) and the
  Co-Authored-By trailer (dropped going forward).
- **Phase 2** (grader seam): both APPROVE (HIGH) — provable no-op verified byte-for-byte.
- **Phase 3** (refused outcome): iter1 both RC — the provenance hedged-but-correct bug (fixed: gate
  refusal on `not correct`) and the summary.md three-outcome breakdown. iter2/3 codex RC on
  verify_source commitment-parsing; **force-advanced** with #23 filed. claude COMMENT/APPROVE; the
  rebaseline independently verified byte-clean + the refused set non-circular (token_f1 signature).
- **Phase 4** (viewer): iter1 both RC — refused rows rendered the red "wrong" badge (fixed: neutral
  "refused" badge) and the contrast/refused paths lacked render tests (added). iter2 **both APPROVE**.
- **Phase 5** (docs): three RC rounds, all concrete factual/staleness fixes (Talmud 74→8, refused
  267/268, graded-cell token_f1 means, the separate-pass grader isn't `--evaluator`-selectable, stale
  "both tiers"/"open question" wording, arch.md lag). One claude nit disputed (explorer.ts:40 is the
  real def line). Force-advanced at the ceiling with the fixes in.

## Lessons Learned

### What went well
- **Pre-registration held.** Freezing the 268-cell refused set (per-model counts + SHA) by hand survey
  *before* writing the matcher made the matcher honest; the three-way non-circularity attack (token_f1
  signature, cue-position distribution, window sensitivity) confirmed it.
- **The oracle made the rebaselines trustworthy.** Because refused cells keep their submetrics, the
  phase-1 `(exact,normalized,token_f1)` projection SHA stayed byte-identical across both rebaselines —
  a reviewer can see the second rebaseline added only `outcome`.
- **Coverage is the thing.** It converts a misleading "opus 100%" into an honest "100% at 66%
  coverage"; the consult catching this early reshaped the whole phase.

### Challenges
- **The viewer lane coupling** (whole-branch diff) broke the plan's Phase-3/Phase-4 split and forced
  same-commit fixture updates.
- **verify_source commitment parsing** drew three consult rounds before being correctly scoped out
  (#23): the right fix was to make the refusal come from the leading decline cue, not to make the
  token parser commitment-aware.
- **Line-pointer drift.** `score.py` grew ~+140 lines across phases; `test_code_walkthrough` only
  checks in-range, so pointers silently rotted — re-derived by hand in Phase 5.

### What would be done differently
- Account for the whole-branch test-dispatcher when planning phase boundaries that touch committed
  evidence a sibling app pins.
- Do the module-docstring edits before re-deriving doc pointers (I re-derived twice).

### Methodology improvements
- Keep the running thread meticulous — it carried the full state across several context refreshes.

## Architecture Updates

Applied in this PR (decision-consistent, not deferred to MAINTAIN):
- `codev/resources/arch-critical.md` + `arch.md`: the scoring fact now carries named graders, the
  OR-of-verdicts headline, the refused outcome + coverage, the sanctioned-rebaseline exception, and
  the #23 verify_source paper gate.

## Lessons Learned Updates

Applied in this PR:
- `codev/resources/lessons-learned.md` + `lessons-critical.md`: refusal-is-an-outcome; containment
  headline adopted (not reported on the side); `contains_reference` shipped (not deferred); a
  scoring-contract change is a **sanctioned, oracle-witnessed rebaseline**; and the **porch
  rollback-replay + `max_iterations` force-advance quirk** (architect-requested): a `porch rollback
  plan` replays old iterations and can reach implement with no fresh consult — run a manual consult;
  and the implement loop force-advances at the ceiling — verify that's what happened.

## Flaky Tests

None introduced. One pre-existing pytest **skip** remains: the first-run generation-invariance test
(needs `texts/standardized/`, unrelated to #15).

## Follow-up Items

- **#23 (paper gate):** harden `verify_source` commitment parsing before reporting any verify_source
  number (negation-evasion on a non-declining answer).
- **#21 (seam only):** the paid/separate-pass Jev judge — expressible via the non-inline grader
  descriptor, not built here.
- **1/21 Ketubot hedge** (`opus-search / retrieve_quote-4ad4392645da`) and the one from-memory
  reconstruction refused above token_f1 0.5 (`haiku-search / e2d74279aaf0`): documented in the run
  README; containment has no anti-hedge rule, and the refusal rule is deliberately conservative.
- Minor (claude, non-blocking): a standings coverage-column render test; `searchContrast` could
  overwrite a duplicate `(provider, base, arm)` entry (unrealistic edge).
