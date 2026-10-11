### Iteration 1 Reviews
- codex: REQUEST_CHANGES — Current standings is implemented well overall, but run recency is inconsistent and failed summaries can silently produce stale standings.
- claude: APPROVE — Phase 5 cross-run standings is complete and correct — panel-keyed rollup, newest-run-wins, graceful panel/summary fallbacks, docs swept, and tests/typecheck/build all green; only minor coverage and labeling nits remain.

### Builder Response to Iteration 1
# Phase 5 — iter1 consult rebuttal

2-way impl consult: **codex REQUEST_CHANGES (HIGH)**, **claude APPROVE (HIGH)**. No design
disagreement between the reviewers; codex's two blockers are legitimate and both are fixed.
All of claude's non-blocking nits that are in phase_5 scope are also folded. Net result after
the revision: `check-types` clean, `pnpm build` green, full suite **115 passed / 0 skipped**.

## codex (REQUEST_CHANGES) — both addressed, agreed

### C1 — equal-mtime tiebreak inconsistent with the run index (`aggregate.ts`)
**Agreed, fixed.** `aggregate` broke an exact-mtime tie by run id *descending*, while the run
index (`listRuns` in `runsEndpoint.ts:58`, `fetchRunIndex` in `runIndex.ts`) orders
`mtime desc, id asc`. So for two equal-mtime runs the leaderboard default ("most recent" =
`runs[0]`) and the standings rollup could pick different runs as "newest". Changed the tiebreak
to id **ascending** so both agree: `mtimeMs === prev.mtimeMs && runId < prev.runId`. Updated the
tie test (it now asserts `run-a` wins for two id-ordered equal-mtime runs, regardless of input
order) and the doc comment to state the index-matching rationale.

### C2 — failed/missing summaries dropped silently → possibly stale standings (`StandingsPage.tsx`)
**Agreed, fixed (keeping partial render, as codex suggested).** `loadAllRunSummaries` still skips
a run whose `summary.json` is unreadable (one bad run must not take the page down), but it now
returns the skipped ids in `failed: string[]`, and the page renders a non-fatal `role="status"`
notice naming them ("N run(s) could not be read and are omitted — standings may be out of date:
…"). This keeps the standings honest: a silently-dropped newer run can no longer present an older
result as "current" without the reader knowing. Added a test asserting the notice names the
dropped run. (This also resolves claude's non-blocking #6, the same observation.)

## claude (APPROVE) — non-blocking nits

Folded all in-scope nits:
- **#2** Standings nav link untested → added an `app.test.tsx` case asserting the link exists with
  `href="/standings"`.
- **#3** the new defensive mtime sort in `runIndex.ts` was unexercised (every fixture was already
  newest-first) → added `src/lib/runIndex.test.ts` feeding an **out-of-order** index (plus the
  equal-mtime id tiebreak, the HTML-200→empty guard, non-200→failure, non-array→malformed, and
  id/mtime entry filtering), so the "callers can rely on `runs[0]` being most recent" guarantee is
  now real.
- **#4** `runDate` labeled the directory mtime as the run's date → relabeled "indexed `<date>`"
  (and "date unknown" when mtime is 0); the run id beside it already carries the real run date.
- **#5** `package.json` `description` omitted standings → updated.
- **#8** two imports from `../lib/localResults` in `StandingsPage.tsx` → merged into one.

**Deliberately not changed (carry-forwards, with reasons):**
- **#1 (phase_5 uncommitted):** expected — in strict ASPIR porch commits the phase when it advances
  after the consult passes; there is intentionally no hand-made phase_5 commit.
- **#7 (`expect(present).toBe(true)` inside `describe.skipIf(!present)` is unreachable when the
  committed run is absent):** correct, but this is the project-wide committed-run-gate convention,
  identical in `realRun.test.ts`, `LeaderboardPage.test.tsx`, and `ExplorerPage.test.tsx`. claude
  itself flagged it as "carry-forward, not new … if it's ever fixed, fix all of them together."
  Making a vanished fixture fail loudly instead of skipping is a cross-cutting test-harness change
  for a MAINTAIN pass, not a phase_5 edit; changing only the standings gate would make the gates
  inconsistent.


### Iteration 2 Reviews
- codex: APPROVE — Phase 5 correctly implements panel-keyed cross-run standings, consistent recency handling, visible partial-load warnings, navigation, documentation updates, and focused tests.
- claude: REQUEST_CHANGES — Phase 5 standings is correct and well-tested — both iter-1 blockers genuinely fixed, suite/typecheck/build green, deps clean — but the repo-root README still calls the viewer an unadapted multibrowser seed, which the phase's own final-docs-sweep deliverable covers.

### Builder Response to Iteration 2
# Phase 5 — iter2 consult rebuttal

2-way re-consult (rebuttal from iter1 passed as context): **codex APPROVE (HIGH, no issues)**,
**claude REQUEST_CHANGES (HIGH)** on a single legitimate item. No disputes — the one blocker is
fixed, and claude's other observations are agreed and require no phase_5 action.

## claude (REQUEST_CHANGES) — the one blocker, fixed

### Root `README.md:25-26` still called the viewer an unadapted multibrowser seed
**Agreed, fixed.** Phase 5's final-docs-sweep deliverable explicitly names `README.md`, and I had
corrected the same stale claim in `apps/viewer/README.md`, `arch.md`, and `arch-critical.md` but
missed the **repo-root** README — the project's front door, and (this being the last phase) nothing
downstream would catch it. Changed lines 25-26 to:

```
- `apps/viewer/` — the benchmark viewer over local `runs/` (leaderboard +
  error explorer + cross-run standings; see `apps/viewer/README.md`).
```

Docs-only change; the suite stays 115 passed / 0 skipped, types/build green.

## claude — second item, deliberately not fixed (out of Spec 2 scope; claude concurs)

### Root `README.md:22` describes `texts/` as wholly gitignored
claude itself flagged this "for the architect, not asking you to fix it here" because it is out of
Spec 2's scope — it concerns the corpus's committed-raw-sources licensing tier, not the viewer.
Per scope discipline (build what the spec says; don't make unrelated doc edits in a feature PR), I
am **not** changing it in phase_5 and am raising it with the architect separately. The current line
contradicts `arch-critical.md`'s two-tier rule (public-domain raw sources ARE committed under
`texts/raw/`; only `restricted` payloads and `texts/standardized/` are gitignored).

## claude — non-blocking notes (no action, agreed)

1. `aggregate` would throw on a malformed `models: { m: null }` (`Object.entries(null)`), surfacing
   via ErrorBoundary rather than the localized path. This is a pre-existing `parseSummary`
   validation-depth limit shared with the leaderboard (`leaderboardRows` has the same exposure),
   not a phase_5 regression — correctly out of scope for this phase.
2. Standings omits token totals: requirement 6 asks only for per-task scores + source run id/date +
   link, so the current columns are correct as specified.
3. Ranking rows drawn from runs with different task coverage is inherently apples-to-oranges; the
   per-row "from run" column (id + indexed date) gives the reader the provenance to judge, and the
   spec's Open Questions already note staleness-surfacing as cosmetic.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
