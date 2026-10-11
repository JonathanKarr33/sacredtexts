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
