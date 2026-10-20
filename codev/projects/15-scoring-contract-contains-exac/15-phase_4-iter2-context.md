### Iteration 1 Reviews
- codex: REQUEST_CHANGES — Refusal filtering works, but refused rows are still visibly labeled as wrong in the explorer.
- claude: REQUEST_CHANGES — Four-outcome data model, coverage columns and contrast pairing are well-built and tested at the lib level, but refused rows still render a "wrong" badge in the explorer, and both the contrast UI and the refused URL/filter path have no render-level coverage.

### Builder Response to Iteration 1
# Phase 4 impl consult (iter1) — disposition

codex **REQUEST_CHANGES** and claude **REQUEST_CHANGES** converged on one real UI gap plus
render-test coverage holes. All fixed; 134 viewer tests pass, check-types clean.

## MUST-FIX (both lanes) — refused rows showed the red "wrong" badge

`QuestionList.tsx` `StatusBadge` branched only correct / missing / wrong, so every refused row fell
through to the red "wrong" badge — contradicting the stats line, the legend, and decision 2's "the
viewer shows a refused status". **Fix:** added a `refused` branch (neutral badge, not red — refused is
excluded from accuracy, not scored wrong) before the wrong fallback. Test added:
`QuestionList.test.tsx` asserts a refused row shows "refused", never "wrong", and still shows the
decline text as the answer.

## claude — render-level coverage holes (fixed)

- **Contrast UI untested** (deleting the section kept the suite green): added a `LeaderboardTable`
  render test over a paired-arm fixture — the "Search on vs off" section renders, names the base model,
  shows the coverage column (`65% (35 refused)`), and the `+9 pt` delta; plus a no-panel test asserting
  the section is omitted.
- **`mode=refused` / refused filter option untested**: added an `ExplorerPage` committed-run test —
  `?mode=refused` narrows claude-haiku to its 55 refused cells, the stats line reports "55 refused",
  and the rows are badged "refused". (The failure-mode `<select>` refused option is now exercised via
  the URL path end-to-end.)

## claude non-blocking (fixed anyway — cheap and correct)

- `searchContrast` paired arms by base model NAME alone, so two same-named base models from different
  providers could form a false contrast. Now keyed on `provider\u0000base` (the same identity the
  standings use); `base` is still carried for display.

## Deferred (unchanged — phase 5 / filed issues)

Phase-5 docs still own: the from-memory-reconstruction caveat, issue #23 (verify_source paper gate),
issue #21 (jev-judge seam), and the architect's two panel-summary edits.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
