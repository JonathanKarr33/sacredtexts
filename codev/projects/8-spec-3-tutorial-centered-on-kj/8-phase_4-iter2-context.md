### Iteration 1 Reviews
- codex: REQUEST_CHANGES — Tutorial rework is strong, but two Phase 4 verification/documentation requirements remain incomplete.
- claude: APPROVE — Phase 4 is complete and independently verified — tutorial numbers recompute exactly, the Track-B generate reproduces the committed question set byte-for-byte, and the viewer is unchanged with 123/123 + 195/195 tests green; only docs polish suggestions remain.

### Builder Response to Iteration 1
# Phase 4 — review iteration 1 rebuttals

Reviewers: **codex REQUEST_CHANGES/HIGH**, **claude APPROVE/HIGH**. Every point accepted
and addressed in commit `ba1bcdf`; the full gate is green after the fixes (viewer 125/125
incl. `realRun.test.ts` + the `#86` probe, pipelines 195/195).

## codex (REQUEST_CHANGES) — both addressed

### 1. `tutorialRun.test.ts` only exercised `loadRun()`/`aggregate()`, not the leaderboard / explorer surfaces
**Disposition: Addressed.** The acceptance criterion allows "a viewer test that does not
change app behaviour," and the first cut covered the two data surfaces unique to this spec
(the 4-entry panel load and the standings non-collision). codex is right that the
leaderboard and explorer renders over the *tutorial* run were asserted only indirectly.

I extended `apps/viewer/src/local/tutorialRun.test.ts` with two more test-only blocks (no
app source change):
- **Leaderboard:** `leaderboardRows(run.summary)` ranks the four entries
  `[opus, opus-search, haiku, haiku-search]` (66/66/47/40 overall, verified non-increasing
  with the model-id tiebreak), each row carries its per-model token totals
  (`tokens.calls === 100`), and `hasTraditionData` + `traditionRows` expose all three
  traditions per entry.
- **Explorer:** `modelQuestions(run.results, "haiku-search")` drills into 100 roster
  questions with `questionStats` = 40 correct / 0 missing (matching `summary.md`), and the
  tradition filter composes (`Sunni Islam` → 33).

This renders the committed run through the same pure functions the leaderboard and explorer
routes consume. The existing component gates (`LeaderboardPage.test.tsx`,
`ExplorerPage.test.tsx`) remain first-run-targeted by design — they test *app behaviour*
with fixtures and must not be re-pointed; the new coverage is additive and run-specific.
(Also verified live: `pnpm dev` + `GET /runs/_index` lists both runs with the tutorial run
newest, and its `summary.json` serves the four marked panel entries.)

### 2. The web-search copyright / fair-use lesson was absent from the docs
**Disposition: Addressed.** Added to the cold `codev/resources/lessons-learned.md`
(§ Evidence & copyright) as a binding-policy entry: model answers are committed **as
collected** — no manual clearance/redaction pass; incidentally-retrieved copyrighted text
is accepted as fair use for academic benchmarking; the automated `audit` gate remains the
enforcement line (still blocks any artifact derived from a *restricted* source); and a
human clearance step must not be reintroduced. (The run `README.md` already carried the
one-line fair-use note; this records the durable policy where future work will see it.)

## claude (APPROVE) — non-blocking comments, all taken

1. **Track B had no cost magnitude.** Added a callout quoting the committed run's spend
   (~4.24M input / ~249K output tokens + 226 web-search requests across 400 cells, 200
   web-search-enabled; tens of dollars at list opus pricing, billed per search request) and
   a cheap-trial path (`--per-task 5`) with the caveat that any `--per-task ≠ 100` changes
   the question set so its digest no longer matches the committed run.
2. **"most-recent run … is this tutorial run" is mtime-dependent.** Hedged both the Track A
   "then view it" line and the Track C leaderboard bullet to say the default is *typically*
   the tutorial run on a fresh clone and to point at the run selector otherwise (an exact
   mtime tie resolves to `first-run` by the id-ascending tiebreak; `generated_at` can't be
   consumed for ordering without a disallowed viewer change).
3. **`lessons-critical.md` named in the plan's doc-updates but left unchanged.** Deliberate,
   not an omission — the hot tier is at its ~10-entry cap, so the two load-bearing facts
   went to `arch-critical.md` and the four new lessons to the cold `lessons-learned.md`
   (displacement discipline). Recorded in the builder thread; claude concurred with the call.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
