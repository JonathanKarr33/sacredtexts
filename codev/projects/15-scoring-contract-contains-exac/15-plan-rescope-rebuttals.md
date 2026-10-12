# Spec 15 — response to the fresh re-scope plan consult (codex + claude)

Both fresh consults reviewed the re-scoped 5-phase plan (not the stale replayed iterations). **codex
REQUEST_CHANGES** (6 precision points) and **claude REQUEST_CHANGES** (a major under-sizing + contract
gaps). I verified the load-bearing claims against the committed evidence myself and **folded everything**;
the architect confirmed the one scope question (coverage). No substantive disagreement.

## claude (blocking): Phase 3 is ~10× bigger + excluding refusals re-inverts the sign — ACCEPTED

Verified with a conservative "decline-phrase AND reference-not-contained" matcher: **~100–180 refused cells**
(e.g. opus 34, opus-search 25, haiku 34, claude-haiku 55). Excluding them: opus 66 %→**100 %** (coverage
66 %) outranks opus-search 74 %→**99 %** (coverage 75 %) — the search sign re-inverts and "100 %" lies.
**Change:** Phase 3 now reports **coverage = (correct+incorrect)/n** beside every accuracy in `summary.json`,
`summary.md`, and (Phase 4) the viewer — architect-**confirmed** as the honest implementation of decision #2
(not new scope). Leaderboard: sort by accuracy, coverage an adjacent column of equal weight; docs explain the
pair in one sentence. Phase 3 is resized (calibration-first); Phase-5 prose waits on the rebaseline numbers.

## claude + codex: refused-cell metrics / oracle reconciliation — ACCEPTED (claude's stronger option)

**Change:** refused cells **keep** `exact/normalized/token_f1/contains_reference`; `outcome` decides only the
headline. This **preserves the phase-1 SHA oracle unchanged** (its `(exact,normalized,token_f1)` projection
over all cells is untouched) instead of my earlier "fresh oracle" that discarded the phase-1 anchor. A refusal
has `normalized == contains_reference == 0` ⇒ `correct == normalized` still holds (phase-1 invariants survive).
Ruling on denominators: **accuracy = correct/(correct+incorrect)** (excludes refused); **submetric averages
over graded cells** (refusals don't dilute diagnostics); `_SUBMETRICS` denominators adjusted accordingly.

## claude: conservativeness trap (decline-then-deliver) — ACCEPTED

Verified two `opus-search` cells open with a decline and still deliver the verse (currently correct).
**Change:** matcher = **decline phrase AND `_bounded_equal`(not-contained)**; these two cells are a named,
pre-registered **negative** test (decline-prefixed-but-delivers → NOT refused), alongside wrapped/near-miss negatives.

## codex + claude: Phase-2 grader semantics + the `contains_reference: 0.0` bug — ACCEPTED

**Change:** precise semantics stated: `token_f1` is an always-on diagnostic (no grader owns it); `strict`
owns exact/normalized (verdict normalized==1), `containment` owns contains_reference (verdict
contains_reference==1); **headline = OR over selected graders' verdicts** (default ⇒ phase-1 behaviour;
`--evaluator strict` ⇒ correct==normalized). `_SUBMETRICS` and the accumulator are **derived from the selected
graders**, not the static constant — so `--evaluator strict` no longer emits a bogus `contains_reference: 0.0`
(the `score.py:334`/`:372` latent bug). Empty selection errors; duplicates dedupe; paid never default.

## codex: non-inline grader descriptor without a synchronous callable — ACCEPTED

**Change:** the `Grader` separate-pass form carries `inline=False` and **no inline callable** (name +
declared metric-key set only); a fixture test exercises the metrics-merge path without running it inline —
so #21's paid Jev judge is expressible without assuming free/local/synchronous.

## codex + claude: Phase-4 real taxonomy sites + four categories + pairing + no-pair fallback — ACCEPTED

**Change:** Phase 4 now targets the actual files — `lib/explorer.ts` (FailureMode, `ExplorerFilters.correct`,
filterQuestions, questionStats), `components/ExplorerFilters.tsx`, `routes/ExplorerPage.tsx` + `router.tsx`
(URL `?task=&tradition=&correct=&mode=` gains `refused`), `LeaderboardTable.tsx`/`lib/leaderboard.ts`,
`StandingsPage.tsx`/`lib/aggregate.ts` (accuracy **values** move, not just keys). **Four** display categories:
correct/incorrect/refused/**missing** coexist. On/off pairing key = strip the `[web_search]`/`[no-tools]`
marker from `summary.panel[id].model`; **no-pair fallback** for first-run (which has no pair) and the
contrast test asserts only on the tutorial run.

## codex + claude: calibration BEFORE the matcher — ACCEPTED

**Change:** Phase 3's first task is a calibration survey of both `answers.jsonl` — hand-classify declines,
**freeze the refused set + per-model counts** — before writing the matcher, so the refused set is genuine
pre-registration (~130 cells, not captured post-hoc).

## claude minor: backup ref before history rewrite; verify_source declines — ACCEPTED

**Change:** before the one-pass `Co-Authored-By` strip (9/28 commits), create `git branch
backup/pre-trailer-strip`, do it only after all phases are committed, and verify porch still resolves state.
`verify_source` declines move from incorrect to `refused` (stated explicitly; provenance is not purely additive).

## codex: refused-rate semantics — ACCEPTED

**Change:** `refused_rate = refused/n` (includes refused in the denominator) reported in task/overall/tradition
cells; distinct from `accuracy = correct/(correct+incorrect)` and `coverage = (correct+incorrect)/n`;
all-refused ⇒ accuracy `null`; mixed missing/refused covered by a test.

---

**Net:** the re-scoped plan is resized and precise; the phase-1 oracle is preserved; coverage keeps the honest
story; the matcher is conservative with a pinned decline-then-deliver negative. Both reviewers verified the
approach/deltas; the changes are to sizing and contract precision, not direction.
