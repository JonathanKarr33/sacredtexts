# Spec 15 — Rebuttal to iteration-3 plan review (codex + claude)

Iteration-3 verdicts: **codex REQUEST_CHANGES** (3 narrow points), **claude COMMENT** (approach, deltas,
rebaseline mechanics, nine-guard surface all independently re-verified correct; one **must-fix** wrong
instruction + 4 precision gaps). **All accepted and folded.** I verified the must-fix and the cited line
numbers against the code before editing — including recomputing the opus-search Judaism breakdown.

## claude MUST-FIX: "Talmud 8 of 34 → 7" is wrong — DROPPED

Verified: opus-search Judaism is `n=34, headline(normalized)=1, contains=8, flips=7`. The README's "8 of
34 (~24 %)" is a **containment** count (1 pre-existing headline + 7 flips = 8), correct as written; my iter2
instruction conflated flips with containment and would have *introduced* an error. **Removed** that
instruction; the plan now explicitly says **do not change the "8 of 34" / "24 of 33" contains counts**.

## codex #1: validation needs a durable pre-change oracle — ACCEPTED

Right — once `scores.jsonl` is replaced there is no in-tree "pre". **Change:** the new test
`pipelines/tests/test_contains_reference_rebaseline.py` pins a **SHA-256 of the canonical, order-independent
`(model_id,question_id)→(exact,normalized,token_f1)` projection**, captured once from the pre-change committed
`scores.jsonl` (`git show HEAD:…` at authoring); the test re-projects the regenerated file and asserts the
hash matches (proves those three fields unmoved on all 800 rows) plus the exact 21-pair `correct`-flip set
and the self-contained `correct==normalized`-except-21 / `contains⊇normalized` invariants.

## codex #2: lessons-learned "don't reshape headline" must be in-PR, not post-MAINTAIN — ACCEPTED

Verified `lessons-learned.md:34` says "don't reshape the headline contract" and `:40-41` marks the submetric
"deferred" — both directly contradicted by this PR. A post-PR MAINTAIN follow-up would merge a
self-contradictory tree. **Change:** Phase 2 now updates `lessons-learned.md:28-41` + `lessons-critical.md`
+ `arch-critical.md` scoring lines **in this PR, consistent with the PR-gate decision** — the whole doc +
contract + artifact set moves together (all-adopted or all-reverted). No deferral.

## codex #3: enumerate the nine guards + name the validation file — ACCEPTED

**Change:** named `pipelines/tests/test_contains_reference_rebaseline.py` and enumerated the nine: 4 pipeline
(`test_first_run_regression`, `test_tutorial_run`, `test_score.py:46`, the new rebaseline-validation test) +
5 viewer (`tutorialRun`, `ExplorerPage`, `LeaderboardPage`, `StandingsPage`, `realRun` — the last has no
numeric pins, confirm-green).

## claude gaps — ACCEPTED

1. **Tutorial README headline table is `:33-38` + framing `:30-31`**, outside my `~:44-110` range and what the
   rebaseline most invalidates. Named it, with the moved cells pre-registered (overall 66/74/47/52;
   opus-search Judaism 3 %→24 %, Sunni Islam 97 %→100 %; haiku-search Sunni Islam 36 %→73 %).
2. **`CODE_WALKTHROUGH.md:305-308`** ("add evidence, not perturb the old") and **`TUTORIAL.md:29`** (external
   "headline-vs-contains-exact analysis") added to the named edit targets.
3. **Honest diff:** first-run `summary.json` has **no `generated_at`** today → regeneration adds it **and**
   `api_model` (two new keys, guard-safe). Added `summary.md` to the diff: accuracy cells **and row order**
   change (tutorial `opus-search`/`haiku-search` rise).
4. **Pointer drift corrected:** `tutorialRun.test.ts` row-order is `:115` (not `:117`); `LeaderboardPage` pin
   `:215` (not `:214`); `ExplorerPage` five "24" sites (`:147/:152/:154/:163/:168`); `CODE_WALKTHROUGH`
   `score.py:N` set is `:1`×2/`:60`/`:87`/`:108`×2/`:115`/`:126`/`:183`/`:201`×2/`:235`/`:266`/`:452` (no
   `:176`); `StandingsPage:134` exact.

---

**Net:** codex's 3 points and claude's must-fix + 4 gaps all closed; the one would-be factual error
("8→7") dropped before it could land. Deltas, approach, mechanics, guard surface, and the aspir-11
merge-order analysis were independently re-verified correct by claude — the approach is unchanged.
