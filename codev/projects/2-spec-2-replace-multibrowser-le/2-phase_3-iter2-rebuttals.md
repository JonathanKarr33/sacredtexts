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
