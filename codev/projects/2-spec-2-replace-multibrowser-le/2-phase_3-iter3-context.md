### Iteration 1 Reviews
- codex: REQUEST_CHANGES — Phase 3 is substantially complete, but null-accuracy cells violate an explicit display requirement.
- claude: APPROVE — Phase 3 is complete and faithful to the plan — leaderboard home, `?run=<id>` contract, run selector, stale-request guard, and the committed-run gate reworked onto the leaderboard; 61 tests, types, and build all verified green.

### Builder Response to Iteration 1
# Phase 3 — rebuttal to iter1 review feedback

- **codex**: REQUEST_CHANGES (HIGH)
- **claude**: APPROVE (HIGH)

Both reviewers verified the suite/types/build and confirmed every Phase-3 plan item
landed. There is exactly one blocking item, and the two reviewers flagged the *same spot*
(the null-overall cell) from opposite framings. I agreed and fixed it; no disputes.

## codex (blocking) — null-overall cell must display "n/a"

> `formatCell` returns `"—"` when `cell.n === 0` before checking `accuracy === null`
> (`localResults.ts:328-333`); a no-data overall cell `{n:0, accuracy:null}` does not
> display `"n/a"` as required. The `LeaderboardTable` test only asserts the model name and
> acknowledges the em-dash. Update the formatter and assert `"n/a"`.

**Agreed — fixed.** The spec's edge case is explicit: *"A model with `null` overall
accuracy sorts last and formats as 'n/a' rather than crashing."* The spec is the source of
truth, so the display must be `"n/a"`, not `"—"`.

Changed `formatCell` (`apps/viewer/src/lib/localResults.ts`): a present cell with no
observations (`n === 0`) now returns `"n/a"` when there is no missing count, and still
returns `"miss N"` when there is one (more informative). An absent cell (`undefined`) is
unchanged (`"—"`), and the `n > 0` path is unchanged. The change is confined to the
`n === 0 && !missing` branch; no committed-run cell hits it (all `n = 100 / 25`), and no
existing assertion asserted `"—"` for an `n === 0` cell.

Tests updated to assert the requirement directly:
- `lib/localResults.test.ts`: added `formatCell({ n: 0, accuracy: null })` → `"n/a"`.
- `components/LeaderboardTable.test.tsx`: the null-overall test now asserts `"n/a"` renders
  (removed the comment that acknowledged the old em-dash).

This also resolves claude's non-blocking note #2 (the test name no longer over-claims).

## claude (non-blocking notes)

1. **`RunRef` drops `mtimeMs`; "most recent" relies on server sort order.** Deferred to
   Phase 5 as claude suggested — the standings view needs each run's date anyway, so
   widening `RunRef` and sorting defensively lands there. Today it is correct: `listRuns`
   sorts mtime-desc / id-asc and the page takes `runs[0]`.
2. **Null-cell test name over-claims.** Resolved by the codex fix above (now genuinely
   `"n/a"`).
3. **Stale `/local-results` pointer in `src/local/sample.ts:2`.** Fixed now (cheap,
   in-scope with this phase's doc-accuracy pass): the header comment now describes the
   sample as a test fixture, not a `pnpm dev → /local-results` page.
4. **`formatInt` exported but only used internally.** Left as-is — it is used by
   `formatTokens`, and exporting it is harmless and plausibly wanted by Phase 5's
   standings table.

## Verification after the fixes

- `pnpm -C apps/viewer check-types` — clean.
- `pnpm -C apps/viewer test` — **61 passed / 0 skipped** (both gates ran: `realRun.test.ts`
  and the `LeaderboardPage` committed-run gate).
- `pnpm -C apps/viewer build` — green.


### Iteration 2 Reviews
- codex: REQUEST_CHANGES — The prior fix handles only null cells without missing counts; realistic all-missing models still violate the required “n/a” overall display.
- claude: COMMENT — Phase 3 is complete and faithful to the plan — leaderboard home, `?run=<id>` contract, run selector, stale-request guard, reworked committed-run gate, docs updated; 61 tests and types verified green by me.

### Builder Response to Iteration 2
# Phase 3 — rebuttal to iter2 review feedback

- **codex**: REQUEST_CHANGES (HIGH)
- **claude**: COMMENT (HIGH)

Both reviewers verified the suite/types green and confirmed every Phase-3 plan item landed.
They raised the **same** residual from the iter1 fix (codex blocking, claude non-blocking) and
proposed compatible fixes. I agreed and fixed it; no disputes.

## codex (blocking) / claude (non-blocking) — fully-missing overall must read "n/a", not "miss N"

> codex: `formatCell` returns `miss N` before honoring `accuracy === null` when `missing > 0`.
> `score.py` emits fully-missing models as `{n:0, accuracy:null, missing:N}`, so their overall
> cell shows `miss N`, not the required `n/a`. Add coverage for the realistic shape; consider an
> overall-specific formatter if task cells should keep the missing count.
>
> claude: the iter1 `"n/a"` fix covers only the `missing`-absent shape (hand-written fixtures);
> real `_overall` cells always carry `missing`, so a no-data model displays `"miss 100"`. A
> combined `n/a (miss N)` satisfies both, plus a test on the real-shaped cell.

**Agreed — fixed.** My iter1 change only handled `{n:0, accuracy:null}` with no `missing`
count; both reviewers correctly note that real pipeline output for a fully-missing model is
`{n:0, accuracy:null, expected_n, missing:N}`, which still produced `"miss N"` for the overall.

Rather than add a second (overall-only) formatter, I unified `formatCell`
(`apps/viewer/src/lib/localResults.ts`): a **null-accuracy** cell now reads `"n/a"` everywhere,
annotated with the missing count when the cell carries one (`"n/a (miss N)"`). This is claude's
suggested combined string, and it satisfies codex's requirement that the overall column render
`n/a` — it applies to the overall **and** the task/tradition columns (the table uses
`formatCell` for all of them), so a separate formatter is unnecessary and the informative
missing count is retained. The guard moved from `n === 0` to `accuracy === null` (equivalent —
`n === 0 ⟺ accuracy null` in this data — but it expresses the spec intent directly). The bare
`"miss N"` display is gone, which is strictly less informative than `"n/a (miss N)"`.

Coverage for the **realistic** shape added, as both asked:
- `lib/localResults.test.ts`: `formatCell({n:0, accuracy:null, expected_n:100, missing:100})`
  → `"n/a (miss 100)"`, and `{…, missing:3}` → `"n/a (miss 3)"`.
- `components/LeaderboardTable.test.tsx`: a fully-missing model with the real `_overall` **and**
  task shape renders `"n/a (miss 10)"` on both cells, ranks last, and emits no bare `"miss 10"`.

## claude (minor) — bad-default-run test only checked the good run is listed

**Agreed — fixed.** `LeaderboardPage.test.tsx`'s bad-default-run test now selects the good run
after the error and asserts the leaderboard recovers (`Leaderboard` heading + a model row),
proving the bad run does not take the page down.

## claude (minor) — `RunRef` drops `mtimeMs`; "most recent" rides `listRuns`' sort order

**Deferred to Phase 5 (both reviewers agree).** Correct today: `listRuns` sorts mtime-desc /
id-asc and the page takes `runs[0]`. Phase 5's standings view needs each run's date anyway, so
widening `RunRef` to carry `mtimeMs` (and sorting defensively) lands there. The test fixtures
already carry an unused `mtimeMs`, so the wire shape is ready.

## Verification after the fixes

- `pnpm -C apps/viewer check-types` — clean.
- `pnpm -C apps/viewer test` — **62 passed / 0 skipped** (both gates ran).
- `pnpm -C apps/viewer build` — green.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
